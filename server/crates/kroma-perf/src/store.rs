use std::collections::BTreeMap;
use std::path::Path;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Mutex;

use anyhow::Context;
use rusqlite::{params, Connection};

use crate::hook::ignore_database;
use crate::recent::{floor, Bucket, HOUR_MS};
use crate::scope::now_ms;
use crate::segment::Descriptor;
use crate::slow::SlowRequest;

const SCHEMA_VERSION: i64 = 1;
const DAY_MS: i64 = 24 * HOUR_MS;
const HOURS_KEPT_MS: i64 = 2 * DAY_MS;
const HISTORY_KEPT_MS: i64 = 31 * DAY_MS;
const SLOW_KEPT_MS: i64 = 7 * DAY_MS;
const SLOW_KEPT_ROWS: i64 = 5_000;
const ALL_BOOTS: &str = "*";

const SCHEMA: &str = "
    CREATE TABLE IF NOT EXISTS history (
        start_ms INTEGER NOT NULL,
        span_ms INTEGER NOT NULL,
        boot TEXT NOT NULL,
        build TEXT NOT NULL,
        bucket TEXT NOT NULL,
        PRIMARY KEY (start_ms, span_ms, boot, build)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS slow (
        id INTEGER PRIMARY KEY,
        at_ms INTEGER NOT NULL,
        name TEXT NOT NULL,
        total_us INTEGER NOT NULL,
        body TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS slow_at ON slow (at_ms);
    CREATE TABLE IF NOT EXISTS catalog (
        key INTEGER PRIMARY KEY,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        origin TEXT
    );";

enum Write {
    Hour(Bucket),
    Slow(Box<SlowRequest>),
    Catalog(Vec<(u64, Descriptor)>),
}

/// The measured history on disk: hours for two days, then days for a month,
/// and the slow requests of the last week. Measurements only: a file of
/// another schema version is emptied rather than migrated. Writes happen on a
/// thread of their own, so recording never waits on the disk.
pub struct Store {
    writes: Mutex<Sender<Write>>,
    reader: Mutex<Connection>,
}

impl Store {
    pub fn open(path: &Path, build: &str) -> anyhow::Result<Store> {
        ignore_database(path);
        let writer = connect(path)?;
        ensure_schema(&writer)?;
        let reader = connect(path)?;
        let (writes, queue) = channel();
        let tag = Tag {
            boot: format!("{}-{}", std::process::id(), now_ms()),
            build: build.to_string(),
        };
        std::thread::Builder::new()
            .name("kroma-perf-store".into())
            .spawn(move || write_all(&writer, &queue, &tag))
            .context("start the performance store")?;
        Ok(Store {
            writes: Mutex::new(writes),
            reader: Mutex::new(reader),
        })
    }

    pub(crate) fn keep_hour(&self, hour: Bucket) {
        self.send(Write::Hour(hour));
    }

    pub(crate) fn keep_slow(&self, request: SlowRequest) {
        self.send(Write::Slow(Box::new(request)));
    }

    pub(crate) fn keep_catalog(&self, entries: Vec<(u64, Descriptor)>) {
        self.send(Write::Catalog(entries));
    }

    fn send(&self, write: Write) {
        let _ = self.writes.lock().unwrap().send(write);
    }

    pub(crate) fn read_since(&self, since_ms: i64) -> anyhow::Result<Bucket> {
        let reader = self.reader.lock().unwrap();
        let mut statement =
            reader.prepare("SELECT bucket FROM history WHERE start_ms + span_ms > ?1")?;
        let rows = statement.query_map([since_ms], |row| row.get::<_, String>(0))?;
        let mut merged = Bucket::default();
        for text in rows {
            merged.merge(&serde_json::from_str(&text?)?);
        }
        Ok(merged)
    }

    pub(crate) fn slow_request(&self, id: u64) -> Option<SlowRequest> {
        let reader = self.reader.lock().unwrap();
        let body: String = reader
            .query_row(
                "SELECT body FROM slow WHERE id = ?1",
                [i64::try_from(id).ok()?],
                |row| row.get(0),
            )
            .ok()?;
        serde_json::from_str(&body).ok()
    }

    pub(crate) fn slow_since(&self, since_ms: i64) -> anyhow::Result<Vec<SlowRequest>> {
        let reader = self.reader.lock().unwrap();
        let mut statement =
            reader.prepare("SELECT body FROM slow WHERE at_ms >= ?1 ORDER BY at_ms")?;
        let rows = statement.query_map([since_ms], |row| row.get::<_, String>(0))?;
        rows.map(|body| Ok(serde_json::from_str(&body?)?)).collect()
    }

    pub(crate) fn catalog(&self) -> Vec<(u64, Descriptor)> {
        let reader = self.reader.lock().unwrap();
        let Ok(mut statement) = reader.prepare("SELECT key, kind, label, origin FROM catalog")
        else {
            return Vec::new();
        };
        let rows = statement.query_map([], |row| {
            let key: i64 = row.get(0)?;
            let descriptor = Descriptor {
                kind: row.get(1)?,
                label: row.get(2)?,
                origin: row.get(3)?,
            };
            Ok((key as u64, descriptor))
        });
        rows.map(|rows| rows.filter_map(Result::ok).collect())
            .unwrap_or_default()
    }
}

struct Tag {
    boot: String,
    build: String,
}

fn connect(path: &Path) -> anyhow::Result<Connection> {
    let connection = Connection::open(path).with_context(|| format!("open {}", path.display()))?;
    connection.execute_batch(
        "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;",
    )?;
    Ok(connection)
}

fn ensure_schema(connection: &Connection) -> anyhow::Result<()> {
    let version: i64 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version != SCHEMA_VERSION {
        connection.execute_batch("DROP TABLE IF EXISTS history; DROP TABLE IF EXISTS slow; DROP TABLE IF EXISTS catalog;")?;
    }
    connection.execute_batch(SCHEMA)?;
    connection.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    Ok(())
}

fn write_all(connection: &Connection, queue: &Receiver<Write>, tag: &Tag) {
    for write in queue {
        let written = match write {
            Write::Hour(hour) => {
                write_hour(connection, &hour, tag).and_then(|()| tidy(connection, now_ms()))
            }
            Write::Slow(request) => write_slow(connection, &request),
            Write::Catalog(entries) => write_catalog(connection, &entries),
        };
        if let Err(error) = written {
            tracing::warn!(%error, "performance history did not write");
        }
    }
}

fn write_hour(connection: &Connection, hour: &Bucket, tag: &Tag) -> anyhow::Result<()> {
    connection.execute(
        "INSERT OR REPLACE INTO history (start_ms, span_ms, boot, build, bucket) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![hour.start_ms, HOUR_MS, tag.boot, tag.build, serde_json::to_string(hour)?],
    )?;
    Ok(())
}

fn write_slow(connection: &Connection, request: &SlowRequest) -> anyhow::Result<()> {
    connection.execute(
        "INSERT OR REPLACE INTO slow (id, at_ms, name, total_us, body) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            i64::try_from(request.id)?,
            request.at_ms,
            request.name,
            i64::try_from(request.total_us)?,
            serde_json::to_string(request)?
        ],
    )?;
    Ok(())
}

fn write_catalog(connection: &Connection, entries: &[(u64, Descriptor)]) -> anyhow::Result<()> {
    let transaction = connection.unchecked_transaction()?;
    {
        let mut insert = transaction.prepare_cached(
            "INSERT OR IGNORE INTO catalog (key, kind, label, origin) VALUES (?1, ?2, ?3, ?4)",
        )?;
        for (key, descriptor) in entries {
            insert.execute(params![
                *key as i64,
                descriptor.kind,
                descriptor.label,
                descriptor.origin
            ])?;
        }
    }
    transaction.commit()?;
    Ok(())
}

fn tidy(connection: &Connection, now: i64) -> anyhow::Result<()> {
    fold_old_hours_into_days(connection, now)?;
    connection.execute(
        "DELETE FROM history WHERE start_ms < ?1",
        [now - HISTORY_KEPT_MS],
    )?;
    connection.execute("DELETE FROM slow WHERE at_ms < ?1", [now - SLOW_KEPT_MS])?;
    connection.execute(
        "DELETE FROM slow WHERE id NOT IN (SELECT id FROM slow ORDER BY at_ms DESC LIMIT ?1)",
        [SLOW_KEPT_ROWS],
    )?;
    Ok(())
}

fn fold_old_hours_into_days(connection: &Connection, now: i64) -> anyhow::Result<()> {
    let before = floor(now - HOURS_KEPT_MS, DAY_MS);
    let mut days: BTreeMap<(i64, String), Bucket> = BTreeMap::new();
    {
        let mut old = connection.prepare(
            "SELECT start_ms, build, bucket FROM history WHERE span_ms = ?1 AND start_ms < ?2",
        )?;
        let rows = old.query_map(params![HOUR_MS, before], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?;
        for row in rows {
            let (start_ms, build, text) = row?;
            let day = days.entry((floor(start_ms, DAY_MS), build)).or_default();
            day.merge(&serde_json::from_str(&text)?);
        }
    }
    if days.is_empty() {
        return Ok(());
    }
    let transaction = connection.unchecked_transaction()?;
    for ((day_ms, build), mut bucket) in days {
        bucket.start_ms = day_ms;
        let existing: Option<String> = transaction
            .query_row(
                "SELECT bucket FROM history WHERE start_ms = ?1 AND span_ms = ?2 AND boot = ?3 AND build = ?4",
                params![day_ms, DAY_MS, ALL_BOOTS, build],
                |row| row.get(0),
            )
            .ok();
        if let Some(text) = existing {
            bucket.merge(&serde_json::from_str(&text)?);
        }
        transaction.execute(
            "INSERT OR REPLACE INTO history (start_ms, span_ms, boot, build, bucket) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![day_ms, DAY_MS, ALL_BOOTS, build, serde_json::to_string(&bucket)?],
        )?;
    }
    transaction.execute(
        "DELETE FROM history WHERE span_ms = ?1 AND start_ms < ?2",
        params![HOUR_MS, before],
    )?;
    transaction.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::recent::ScopeKey;
    use crate::scope::ScopeKind;
    use crate::stats::Run;

    fn hour_with(start_ms: i64, requests: u64) -> Bucket {
        let mut bucket = Bucket::starting(start_ms);
        let key = ScopeKey {
            kind: ScopeKind::Request,
            name: "GET /api/home".into(),
        };
        for _ in 0..requests {
            bucket.scopes.entry(key.clone()).or_default().record(&Run {
                elapsed_ns: 1_000_000,
                ..Run::default()
            });
        }
        bucket
    }

    fn requests_in(bucket: &Bucket) -> u64 {
        bucket.scopes.values().map(|s| s.timing.count).sum()
    }

    fn open_store() -> (kroma_testing::TempDir, Connection) {
        let dir = kroma_testing::temp_dir("perf-store");
        let connection = connect(&dir.path().join("perf.db")).unwrap();
        ensure_schema(&connection).unwrap();
        (dir, connection)
    }

    #[test]
    fn an_hour_written_twice_by_one_boot_counts_once() {
        let (_dir, connection) = open_store();
        let tag = Tag {
            boot: "b1".into(),
            build: "1".into(),
        };

        write_hour(&connection, &hour_with(HOUR_MS, 2), &tag).unwrap();
        write_hour(&connection, &hour_with(HOUR_MS, 5), &tag).unwrap();

        let count: i64 = connection
            .query_row("SELECT count(*) FROM history", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn hours_older_than_two_days_fold_into_one_day_per_build() {
        let (_dir, connection) = open_store();
        let now = 10 * DAY_MS;
        let tag = Tag {
            boot: "b1".into(),
            build: "1".into(),
        };
        write_hour(&connection, &hour_with(2 * DAY_MS, 1), &tag).unwrap();
        write_hour(&connection, &hour_with(2 * DAY_MS + HOUR_MS, 2), &tag).unwrap();
        write_hour(&connection, &hour_with(now - HOUR_MS, 4), &tag).unwrap();

        tidy(&connection, now).unwrap();

        let spans: Vec<(i64, i64)> = connection
            .prepare("SELECT start_ms, span_ms FROM history ORDER BY start_ms")
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(spans, vec![(2 * DAY_MS, DAY_MS), (now - HOUR_MS, HOUR_MS)]);
    }

    #[test]
    fn a_store_reads_back_what_it_kept() {
        let dir = kroma_testing::temp_dir("perf-store-read");
        let store = Store::open(&dir.path().join("perf.db"), "42").unwrap();
        let writer = connect(&dir.path().join("perf.db")).unwrap();
        let tag = Tag {
            boot: "b".into(),
            build: "42".into(),
        };
        write_hour(&writer, &hour_with(now_ms() - HOUR_MS, 3), &tag).unwrap();

        let read = store.read_since(now_ms() - DAY_MS).unwrap();

        assert_eq!(requests_in(&read), 3);
    }

    #[test]
    fn a_file_from_another_schema_is_emptied() {
        let (dir, connection) = open_store();
        connection.execute_batch("INSERT INTO catalog VALUES (1, 'sql', 'SELECT 1', NULL); PRAGMA user_version = 99;").unwrap();

        ensure_schema(&connect(&dir.path().join("perf.db")).unwrap()).unwrap();

        let count: i64 = connection
            .query_row("SELECT count(*) FROM catalog", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }
}

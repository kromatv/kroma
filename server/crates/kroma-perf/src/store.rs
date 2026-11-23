use std::collections::BTreeMap;
use std::path::Path;
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

/// What the profiler has measured since its last save: the hours whose content
/// changed, the slow requests and the segment names it has not written yet.
#[derive(Default)]
pub(crate) struct Unsaved {
    pub hours: Vec<Bucket>,
    pub slow: Vec<SlowRequest>,
    pub names: Vec<(u64, Descriptor)>,
}

impl Unsaved {
    fn is_empty(&self) -> bool {
        self.hours.is_empty() && self.slow.is_empty() && self.names.is_empty()
    }
}

struct Tag {
    boot: String,
    build: String,
}

/// The measured history on disk: hours for two days, then days for a month,
/// and the slow requests of the last week. Measurements only: a file of
/// another schema version is emptied rather than migrated.
pub struct Store {
    connection: Mutex<Connection>,
    tag: Tag,
}

impl Store {
    pub fn open(path: &Path, build: &str) -> anyhow::Result<Store> {
        ignore_database(path);
        let connection =
            Connection::open(path).with_context(|| format!("open {}", path.display()))?;
        connection.execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;")?;
        ensure_schema(&connection)?;
        Ok(Store {
            connection: Mutex::new(connection),
            tag: Tag {
                boot: format!("{}-{}", std::process::id(), now_ms()),
                build: build.to_string(),
            },
        })
    }

    pub(crate) fn save(&self, unsaved: &Unsaved) -> anyhow::Result<()> {
        if unsaved.is_empty() {
            return Ok(());
        }
        let mut connection = self.connection.lock().unwrap();
        let transaction = connection.transaction()?;
        write_unsaved(&transaction, unsaved, &self.tag)?;
        Ok(transaction.commit()?)
    }

    pub(crate) fn read_since(&self, since_ms: i64) -> anyhow::Result<Bucket> {
        let connection = self.connection.lock().unwrap();
        let mut statement =
            connection.prepare("SELECT bucket FROM history WHERE start_ms + span_ms > ?1")?;
        let rows = statement.query_map([since_ms], |row| row.get::<_, String>(0))?;
        let mut merged = Bucket::default();
        for text in rows {
            merged.merge(&serde_json::from_str(&text?)?);
        }
        Ok(merged)
    }

    pub(crate) fn slow_request(&self, id: u64) -> Option<SlowRequest> {
        let connection = self.connection.lock().unwrap();
        let body: String = connection
            .query_row(
                "SELECT body FROM slow WHERE id = ?1",
                [i64::try_from(id).ok()?],
                |row| row.get(0),
            )
            .ok()?;
        serde_json::from_str(&body).ok()
    }

    pub(crate) fn slow_since(&self, since_ms: i64) -> anyhow::Result<Vec<SlowRequest>> {
        let connection = self.connection.lock().unwrap();
        let mut statement =
            connection.prepare("SELECT body FROM slow WHERE at_ms >= ?1 ORDER BY at_ms")?;
        let rows = statement.query_map([since_ms], |row| row.get::<_, String>(0))?;
        rows.map(|body| Ok(serde_json::from_str(&body?)?)).collect()
    }

    pub(crate) fn names(&self) -> anyhow::Result<Vec<(u64, Descriptor)>> {
        let connection = self.connection.lock().unwrap();
        let mut statement = connection.prepare("SELECT key, kind, label, origin FROM catalog")?;
        let rows = statement.query_map([], |row| {
            let descriptor = Descriptor {
                kind: row.get(1)?,
                label: row.get(2)?,
                origin: row.get(3)?,
            };
            Ok((row.get::<_, i64>(0)?.cast_unsigned(), descriptor))
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }
}

fn ensure_schema(connection: &Connection) -> anyhow::Result<()> {
    let version: i64 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version != SCHEMA_VERSION {
        connection.execute_batch(
            "DROP TABLE IF EXISTS history; DROP TABLE IF EXISTS slow; DROP TABLE IF EXISTS catalog;",
        )?;
    }
    connection.execute_batch(SCHEMA)?;
    connection.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    Ok(())
}

fn write_unsaved(connection: &Connection, unsaved: &Unsaved, tag: &Tag) -> anyhow::Result<()> {
    for hour in &unsaved.hours {
        write_hour(connection, hour, tag)?;
    }
    for request in &unsaved.slow {
        write_slow(connection, request)?;
    }
    write_names(connection, &unsaved.names)?;
    if !unsaved.hours.is_empty() {
        tidy(connection, now_ms())?;
    }
    Ok(())
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

fn write_names(connection: &Connection, names: &[(u64, Descriptor)]) -> anyhow::Result<()> {
    let mut insert = connection.prepare_cached(
        "INSERT OR IGNORE INTO catalog (key, kind, label, origin) VALUES (?1, ?2, ?3, ?4)",
    )?;
    for (key, descriptor) in names {
        insert.execute(params![
            key.cast_signed(),
            descriptor.kind,
            descriptor.label,
            descriptor.origin
        ])?;
    }
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
    for ((day_ms, build), mut day) in old_hours_by_day(connection, before)? {
        day.start_ms = day_ms;
        if let Some(text) = day_bucket(connection, day_ms, &build)? {
            day.merge(&serde_json::from_str(&text)?);
        }
        connection.execute(
            "INSERT OR REPLACE INTO history (start_ms, span_ms, boot, build, bucket) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![day_ms, DAY_MS, ALL_BOOTS, build, serde_json::to_string(&day)?],
        )?;
    }
    connection.execute(
        "DELETE FROM history WHERE span_ms = ?1 AND start_ms < ?2",
        params![HOUR_MS, before],
    )?;
    Ok(())
}

fn old_hours_by_day(
    connection: &Connection,
    before: i64,
) -> anyhow::Result<BTreeMap<(i64, String), Bucket>> {
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
    let mut days: BTreeMap<(i64, String), Bucket> = BTreeMap::new();
    for row in rows {
        let (start_ms, build, text) = row?;
        let day = days.entry((floor(start_ms, DAY_MS), build)).or_default();
        day.merge(&serde_json::from_str(&text)?);
    }
    Ok(days)
}

fn day_bucket(connection: &Connection, day_ms: i64, build: &str) -> anyhow::Result<Option<String>> {
    let mut statement = connection.prepare(
        "SELECT bucket FROM history WHERE start_ms = ?1 AND span_ms = ?2 AND boot = ?3 AND build = ?4",
    )?;
    let mut rows = statement.query(params![day_ms, DAY_MS, ALL_BOOTS, build])?;
    Ok(rows.next()?.map(|row| row.get(0)).transpose()?)
}

#[cfg(test)]
mod tests;

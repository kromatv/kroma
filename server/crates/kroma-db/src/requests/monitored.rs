//! The `monitored` table: the titles the server wants to hold.

use rusqlite::{Connection, OptionalExtension, Row, params};

use kroma_domain::{MinAvailability, MonitoredSummary, MonitoredTitle, RequestKind};

use crate::{Pool, Result};

const MONITORED_COLS: &str = "m.kind, m.tmdb_id, m.title, m.year, m.poster_url, m.seasons, \
    m.monitor_new_seasons, m.min_availability, m.last_season, m.added_by, m.added_at, m.updated_at, \
    m.original_language, m.air_status, m.refreshed_at, m.known_episodes, m.aliases";

fn row_to_monitored(r: &Row) -> rusqlite::Result<MonitoredTitle> {
    let kind: String = r.get(0)?;
    let seasons: String = r.get(5)?;
    let min_availability: String = r.get(7)?;
    Ok(MonitoredTitle {
        kind: RequestKind::parse(&kind).unwrap_or(RequestKind::Movie),
        tmdb_id: r.get::<_, i64>(1)? as u64,
        title: r.get(2)?,
        year: r.get(3)?,
        poster_url: r.get(4)?,
        seasons: serde_json::from_str(&seasons).unwrap_or_default(),
        monitor_new_seasons: r.get::<_, i64>(6)? != 0,
        min_availability: MinAvailability::parse(&min_availability).unwrap_or_default(),
        last_season: r.get(8)?,
        added_by: r.get(9)?,
        added_at: r.get(10)?,
        updated_at: r.get(11)?,
        original_language: r.get(12)?,
        air_status: r.get(13)?,
        refreshed_at: r.get(14)?,
        known_episodes: serde_json::from_str(&r.get::<_, String>(15)?).unwrap_or_default(),
        aliases: serde_json::from_str(&r.get::<_, String>(16)?).unwrap_or_default(),
    })
}

/// Inserts the title, or rewrites everything but who added it and when.
pub fn upsert_monitored(pool: &Pool, title: &MonitoredTitle) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO monitored (kind, tmdb_id, title, year, poster_url, seasons, \
             monitor_new_seasons, min_availability, last_season, added_by, added_at, updated_at, \
             original_language, air_status, refreshed_at, known_episodes, aliases) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17) \
         ON CONFLICT(kind, tmdb_id) DO UPDATE SET \
             title = excluded.title, year = excluded.year, poster_url = excluded.poster_url, \
             seasons = excluded.seasons, monitor_new_seasons = excluded.monitor_new_seasons, \
             min_availability = excluded.min_availability, last_season = excluded.last_season, \
             updated_at = excluded.updated_at, original_language = excluded.original_language, \
             air_status = excluded.air_status, refreshed_at = excluded.refreshed_at, \
             known_episodes = excluded.known_episodes, aliases = excluded.aliases",
        params![
            title.kind.as_str(),
            title.tmdb_id as i64,
            title.title,
            title.year,
            title.poster_url,
            serde_json::to_string(&title.seasons).unwrap_or_else(|_| "[]".into()),
            title.monitor_new_seasons,
            title.min_availability.as_str(),
            title.last_season,
            title.added_by,
            title.added_at,
            title.updated_at,
            title.original_language,
            title.air_status,
            title.refreshed_at,
            serde_json::to_string(&title.known_episodes).unwrap_or_else(|_| "{}".into()),
            serde_json::to_string(&title.aliases).unwrap_or_else(|_| "[]".into()),
        ],
    )?;
    Ok(())
}

pub fn get_monitored(
    conn: &Connection,
    kind: RequestKind,
    tmdb_id: u64,
) -> rusqlite::Result<Option<MonitoredTitle>> {
    conn.query_row(
        &format!("SELECT {MONITORED_COLS} FROM monitored m WHERE m.kind = ?1 AND m.tmdb_id = ?2"),
        params![kind.as_str(), tmdb_id as i64],
        row_to_monitored,
    )
    .optional()
}

pub fn list_monitored(conn: &Connection) -> rusqlite::Result<Vec<MonitoredTitle>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {MONITORED_COLS} FROM monitored m ORDER BY m.title COLLATE NOCASE"
    ))?;
    let rows = stmt.query_map([], row_to_monitored)?;
    rows.collect()
}

/// Every monitored title with its ledger tallied: `missing` counts the rows
/// still wanted whose air date has passed `today` (or that have none).
pub fn monitored_summaries(
    conn: &Connection,
    today: &str,
) -> rusqlite::Result<Vec<MonitoredSummary>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {MONITORED_COLS}, \
             COUNT(w.id), \
             COALESCE(SUM(w.status = 'available'), 0), \
             COALESCE(SUM(w.status = 'wanted' AND (w.air_date IS NULL OR w.air_date <= ?1)), 0), \
             COALESCE(SUM(w.status = 'grabbed'), 0) \
         FROM monitored m \
         LEFT JOIN wanted w ON w.tmdb_id = m.tmdb_id \
             AND w.kind = CASE m.kind WHEN 'show' THEN 'episode' ELSE 'movie' END \
         GROUP BY m.kind, m.tmdb_id \
         ORDER BY m.title COLLATE NOCASE"
    ))?;
    let rows = stmt.query_map(params![today], |r| {
        Ok(MonitoredSummary {
            title: row_to_monitored(r)?,
            monitored: r.get(17)?,
            available: r.get(18)?,
            missing: r.get(19)?,
            grabbed: r.get(20)?,
        })
    })?;
    rows.collect()
}

/// Stops monitoring a title: its row and every wanted row it had go together.
pub fn delete_monitored(pool: &Pool, kind: RequestKind, tmdb_id: u64) -> Result<bool> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    tx.execute(
        "DELETE FROM wanted WHERE kind = ?1 AND tmdb_id = ?2",
        params![unit_kind(kind), tmdb_id as i64],
    )?;
    let removed = tx.execute(
        "DELETE FROM monitored WHERE kind = ?1 AND tmdb_id = ?2",
        params![kind.as_str(), tmdb_id as i64],
    )?;
    tx.commit()?;
    Ok(removed > 0)
}

/// The `wanted.kind` of a title's units: a show's are its episodes.
pub fn unit_kind(kind: RequestKind) -> &'static str {
    match kind {
        RequestKind::Movie => "movie",
        RequestKind::Show => "episode",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::requests::tests::*;
    use crate::requests::{WantedRow, insert_wanted, wanted_for_title};

    fn show(tmdb_id: u64, seasons: Vec<u32>) -> MonitoredTitle {
        MonitoredTitle {
            kind: RequestKind::Show,
            tmdb_id,
            title: "Show".into(),
            year: Some(2020),
            poster_url: None,
            seasons,
            monitor_new_seasons: true,
            min_availability: MinAvailability::Released,
            last_season: Some(2),
            added_by: None,
            added_at: 1,
            updated_at: 1,
            original_language: Some("en-US".into()),
            air_status: Some("Returning Series".into()),
            refreshed_at: Some(5),
            known_episodes: [(1, 10)].into(),
            aliases: vec!["Show Original".into()],
        }
    }

    fn unowned(id: &str, episode: u32, status: &str) -> WantedRow {
        WantedRow {
            request_id: None,
            ..ep_row(id, 1, episode, status)
        }
    }

    #[test]
    fn a_monitored_title_round_trips() {
        let p = pool();
        upsert_monitored(&p, &show(1396, vec![1, 2])).unwrap();

        let conn = p.get().unwrap();
        let read = get_monitored(&conn, RequestKind::Show, 1396).unwrap();

        assert_eq!(read, Some(show(1396, vec![1, 2])));
    }

    #[test]
    fn an_upsert_keeps_when_the_title_was_first_added() {
        let p = pool();
        upsert_monitored(&p, &show(1396, vec![1])).unwrap();
        let later = MonitoredTitle {
            added_at: 99,
            updated_at: 99,
            ..show(1396, vec![1, 2, 3])
        };
        upsert_monitored(&p, &later).unwrap();

        let conn = p.get().unwrap();
        let read = get_monitored(&conn, RequestKind::Show, 1396)
            .unwrap()
            .unwrap();

        assert_eq!(read.seasons, [1, 2, 3]);
        assert_eq!((read.added_at, read.updated_at), (1, 99));
    }

    #[test]
    fn a_summary_counts_what_is_held_missing_and_on_its_way() {
        let p = pool();
        upsert_monitored(&p, &show(1396, vec![1])).unwrap();
        insert_wanted(
            &p,
            &[
                unowned("w1", 1, "available"),
                unowned("w2", 2, "wanted"),
                unowned("w3", 3, "grabbed"),
                WantedRow {
                    air_date: Some("2999-01-01".into()),
                    ..unowned("w4", 4, "wanted")
                },
            ],
            1,
        )
        .unwrap();

        let conn = p.get().unwrap();
        let summaries = monitored_summaries(&conn, "2026-01-01").unwrap();

        let s = &summaries[0];
        assert_eq!(
            (s.monitored, s.available, s.missing, s.grabbed),
            (4, 1, 1, 1)
        );
    }

    #[test]
    fn unmonitoring_drops_the_title_and_its_rows_only() {
        let p = pool();
        upsert_monitored(&p, &show(1396, vec![1])).unwrap();
        upsert_monitored(&p, &show(1400, vec![1])).unwrap();
        insert_wanted(
            &p,
            &[
                unowned("w1", 1, "wanted"),
                WantedRow {
                    tmdb_id: 1400,
                    ..unowned("w2", 1, "wanted")
                },
            ],
            1,
        )
        .unwrap();

        let removed = delete_monitored(&p, RequestKind::Show, 1396).unwrap();

        let conn = p.get().unwrap();
        assert!(removed);
        assert!(
            get_monitored(&conn, RequestKind::Show, 1396)
                .unwrap()
                .is_none()
        );
        assert!(
            wanted_for_title(&conn, RequestKind::Show, 1396)
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            wanted_for_title(&conn, RequestKind::Show, 1400)
                .unwrap()
                .len(),
            1
        );
    }
}

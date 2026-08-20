//! Which wanted rows an automatic search pass takes next, and their backoff.

use anyhow::Result;
use rusqlite::{params, Connection};

use crate::chunked::IN_CHUNK;
use crate::pool::Pool;
use super::wanted::{row_to_wanted, WantedRow, WANTED_COLS};

/// Rows ready for an automatic search pass: still wanted, aired or undated, and
/// past their backoff. Ordered freshest air date first, so an episode that aired
/// this morning is searched before a gap from years ago that no pass will ever
/// close; `next_search_at` breaks ties in favour of the longest-waiting row.
pub fn wanted_searchable(
    conn: &Connection,
    today: &str,
    now_ms: i64,
    limit: usize,
) -> rusqlite::Result<Vec<WantedRow>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {WANTED_COLS} FROM wanted \
         WHERE status = 'wanted' AND (air_date IS NULL OR air_date <= ?1) \
           AND (next_search_at IS NULL OR next_search_at <= ?2) \
         ORDER BY air_date IS NULL, air_date DESC, \
                  next_search_at IS NOT NULL, next_search_at, season, episode LIMIT ?3"
    ))?;
    let rows = stmt.query_map(params![today, now_ms, limit as i64], row_to_wanted)?;
    rows.collect()
}

fn update_wanted_chunked(
    pool: &Pool,
    ids: &[String],
    set_sql: &str,
    lead: &[&dyn rusqlite::ToSql],
) -> Result<()> {
    if ids.is_empty() {
        return Ok(());
    }
    let conn = pool.get()?;
    for chunk in ids.chunks(IN_CHUNK) {
        let ph = vec!["?"; chunk.len()].join(",");
        let mut params_vec: Vec<&dyn rusqlite::ToSql> = lead.to_vec();
        for id in chunk {
            params_vec.push(id);
        }
        conn.execute(
            &format!("UPDATE wanted SET {set_sql} WHERE id IN ({ph})"),
            params_vec.as_slice(),
        )?;
    }
    Ok(())
}

pub fn set_wanted_status(pool: &Pool, ids: &[String], status: &str, now_ms: i64) -> Result<()> {
    update_wanted_chunked(pool, ids, "status = ?1, updated_at = ?2", &[&status, &now_ms])
}

/// Longest a searched row ever waits for its next turn.
pub const MAX_SEARCH_DELAY_MS: i64 = 7 * 24 * 60 * 60 * 1000;

// A row that keeps coming up empty costs an indexer round trip every pass, so
// each fruitless attempt stretches its gap - up to five times the base, capped.
const MAX_ATTEMPT_FACTOR: i64 = 5;

/// Stamp a searched batch and push its next turn out by `base_delay_ms` grown
/// by how many fruitless attempts each row already has. Callers group ids by
/// base delay (see the acquisition module's `search::backoff`).
pub fn schedule_next_search(
    pool: &Pool,
    ids: &[String],
    now_ms: i64,
    base_delay_ms: i64,
) -> Result<()> {
    update_wanted_chunked(
        pool,
        ids,
        "search_attempts = search_attempts + 1, \
         last_search_at = ?1, \
         next_search_at = ?1 + MIN(?2 * MIN(search_attempts + 1, ?3), ?4), \
         updated_at = ?1",
        &[&now_ms, &base_delay_ms, &MAX_ATTEMPT_FACTOR, &MAX_SEARCH_DELAY_MS],
    )
}

/// Put a row back at the front of the queue (a newly aired episode), clearing
/// the backoff its earlier unaired attempts accumulated.
pub fn reset_wanted_search(pool: &Pool, ids: &[String], now_ms: i64) -> Result<()> {
    update_wanted_chunked(
        pool,
        ids,
        "search_attempts = 0, next_search_at = NULL, updated_at = ?1",
        &[&now_ms],
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::requests::tests::*;
    use crate::requests::{insert_request, replace_wanted};
    use kroma_domain::RequestKind;

    #[test]
    fn wanted_searchable_gates_on_air_date_and_status() {
        let p = pool();
        insert_request(&p, &new_req("r1", RequestKind::Show, 1396, None), 1000).unwrap();
        let mk = |id: &str, episode: u32, air: Option<&str>, status: &str, searched: Option<i64>| WantedRow {
            id: id.into(),
            request_id: "r1".into(),
            kind: "episode".into(),
            tmdb_id: 1396,
            imdb_id: None,
            title: "T".into(),
            year: None,
            season: Some(1),
            episode: Some(episode),
            air_date: air.map(str::to_string),
            status: status.into(),
            last_search_at: searched,
        };
        let rows = vec![
            mk("w-aired", 1, Some("2020-01-01"), "wanted", Some(500)),
            mk("w-unaired", 2, Some("2999-01-01"), "wanted", None),
            mk("w-grabbed", 3, Some("2020-01-01"), "grabbed", None),
            mk("w-undated", 4, None, "wanted", None),
        ];
        replace_wanted(&p, "r1", &rows, 1000).unwrap();

        let conn = p.get().unwrap();
        let due = wanted_searchable(&conn, "2026-07-05", 4000, 10).unwrap();
        let ids: Vec<&str> = due.iter().map(|w| w.id.as_str()).collect();
        assert_eq!(ids, vec!["w-aired", "w-undated"], "dated rows lead, undated trail");
        drop(conn);

        set_wanted_status(&p, &["w-aired".to_string()], "available", 2000).unwrap();
        schedule_next_search(&p, &["w-undated".to_string()], 3000, 1000).unwrap();
        let conn = p.get().unwrap();
        let due = wanted_searchable(&conn, "2026-07-05", 4000, 10).unwrap();
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].id, "w-undated");
        assert_eq!(due[0].last_search_at, Some(3000));
    }

    #[test]
    fn wanted_searchable_puts_the_freshest_air_date_first() {
        // The whole point of the ordering: a weekly show's new episode must not
        // queue behind a years-old gap no pass will ever close.
        let p = pool();
        insert_request(&p, &new_req("r1", RequestKind::Show, 1396, None), 1000).unwrap();
        let mk = |id: &str, episode: u32, air: &str| WantedRow {
            id: id.into(),
            request_id: "r1".into(),
            kind: "episode".into(),
            tmdb_id: 1396,
            imdb_id: None,
            title: "T".into(),
            year: None,
            season: Some(1),
            episode: Some(episode),
            air_date: Some(air.into()),
            status: "wanted".into(),
            last_search_at: None,
        };
        replace_wanted(
            &p,
            "r1",
            &[mk("w-old", 1, "2019-03-04"), mk("w-fresh", 2, "2026-07-04"), mk("w-mid", 3, "2024-01-01")],
            1000,
        )
        .unwrap();

        let conn = p.get().unwrap();
        let due = wanted_searchable(&conn, "2026-07-05", 2000, 10).unwrap();
        let ids: Vec<&str> = due.iter().map(|w| w.id.as_str()).collect();
        assert_eq!(ids, vec!["w-fresh", "w-mid", "w-old"]);
    }

    #[test]
    fn schedule_next_search_backs_a_row_off_and_resetting_brings_it_straight_back() {
        let p = pool();
        insert_request(&p, &new_req("r1", RequestKind::Show, 1396, None), 1000).unwrap();
        let row = WantedRow {
            id: "w1".into(),
            request_id: "r1".into(),
            kind: "episode".into(),
            tmdb_id: 1396,
            imdb_id: None,
            title: "T".into(),
            year: None,
            season: Some(1),
            episode: Some(1),
            air_date: Some("2020-01-01".into()),
            status: "wanted".into(),
            last_search_at: None,
        };
        replace_wanted(&p, "r1", &[row], 1000).unwrap();
        let ids = vec!["w1".to_string()];

        schedule_next_search(&p, &ids, 10_000, 1000).unwrap();
        let conn = p.get().unwrap();
        assert!(wanted_searchable(&conn, "2026-07-05", 10_500, 10).unwrap().is_empty(), "backed off");
        assert_eq!(wanted_searchable(&conn, "2026-07-05", 11_000, 10).unwrap().len(), 1, "due again");
        drop(conn);

        // A second fruitless attempt costs twice the base, a third three times.
        schedule_next_search(&p, &ids, 11_000, 1000).unwrap();
        let conn = p.get().unwrap();
        assert!(wanted_searchable(&conn, "2026-07-05", 12_500, 10).unwrap().is_empty());
        assert_eq!(wanted_searchable(&conn, "2026-07-05", 13_000, 10).unwrap().len(), 1);
        drop(conn);

        reset_wanted_search(&p, &ids, 12_000).unwrap();
        let conn = p.get().unwrap();
        assert_eq!(
            wanted_searchable(&conn, "2026-07-05", 12_001, 10).unwrap().len(),
            1,
            "a newly aired episode jumps its own backoff"
        );
    }

    #[test]
    fn schedule_next_search_never_pushes_a_row_past_a_week() {
        let p = pool();
        insert_request(&p, &new_req("r1", RequestKind::Movie, 603, None), 1000).unwrap();
        replace_wanted(
            &p,
            "r1",
            &[WantedRow {
                id: "w1".into(),
                request_id: "r1".into(),
                kind: "movie".into(),
                tmdb_id: 603,
                imdb_id: None,
                title: "T".into(),
                year: None,
                season: None,
                episode: None,
                air_date: Some("2019-01-01".into()),
                status: "wanted".into(),
                last_search_at: None,
            }],
            1000,
        )
        .unwrap();

        let ids = vec!["w1".to_string()];
        for _ in 0..6 {
            schedule_next_search(&p, &ids, 0, MAX_SEARCH_DELAY_MS).unwrap();
        }
        let conn = p.get().unwrap();
        assert_eq!(wanted_searchable(&conn, "2026-07-05", MAX_SEARCH_DELAY_MS, 10).unwrap().len(), 1);
    }

    #[test]
    fn wanted_searchable_gates_unreleased_movies() {
        // A movie's wanted row carries its release date as air_date, with
        // season/episode NULL.
        let p = pool();
        insert_request(&p, &new_req("m1", RequestKind::Movie, 603, None), 1000).unwrap();
        let mk = |id: &str, air: Option<&str>| WantedRow {
            id: id.into(),
            request_id: "m1".into(),
            kind: "movie".into(),
            tmdb_id: 603,
            imdb_id: None,
            title: "M".into(),
            year: None,
            season: None,
            episode: None,
            air_date: air.map(str::to_string),
            status: "wanted".into(),
            last_search_at: None,
        };
        // replace_wanted is per-request, so each movie row needs its own request.
        insert_request(&p, &new_req("m2", RequestKind::Movie, 604, None), 1000).unwrap();
        insert_request(&p, &new_req("m3", RequestKind::Movie, 605, None), 1000).unwrap();
        replace_wanted(&p, "m1", &[mk("m-future", Some("2999-01-01"))], 1000).unwrap();
        replace_wanted(&p, "m2", &[WantedRow { request_id: "m2".into(), ..mk("m-out", Some("2020-01-01")) }], 1000).unwrap();
        replace_wanted(&p, "m3", &[WantedRow { request_id: "m3".into(), ..mk("m-nodate", None) }], 1000).unwrap();

        let conn = p.get().unwrap();
        let due = wanted_searchable(&conn, "2026-07-05", 2000, 10).unwrap();
        let mut ids: Vec<&str> = due.iter().map(|w| w.id.as_str()).collect();
        ids.sort_unstable();
        assert_eq!(ids, vec!["m-nodate", "m-out"]);
    }
}

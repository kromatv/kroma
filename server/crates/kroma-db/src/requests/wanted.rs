//! The wanted ledger: one row per monitored unit, a movie or an episode.

use anyhow::Result;
use rusqlite::{params, Connection, Row};

use kroma_domain::RequestKind;

use super::unit_kind;
use crate::chunked::IN_CHUNK;
use crate::Pool;

/// One wanted unit: a movie, or one episode of a monitored show. `request_id`
/// is the request it answers to, if any.
#[derive(Debug, Clone)]
pub struct WantedRow {
    pub id: String,
    pub request_id: Option<String>,
    pub kind: String,
    // The movie's TMDB id, or the SHOW's TMDB id for episodes.
    pub tmdb_id: u64,
    pub imdb_id: Option<String>,
    pub title: String,
    pub year: Option<u32>,
    pub season: Option<u32>,
    pub episode: Option<u32>,
    // Unaired episodes (YYYY-MM-DD) are skipped by search until the date passes.
    pub air_date: Option<String>,
    pub status: String,
    pub last_search_at: Option<i64>,
}

pub(super) fn row_to_wanted(r: &Row) -> rusqlite::Result<WantedRow> {
    Ok(WantedRow {
        id: r.get(0)?,
        request_id: r.get(1)?,
        kind: r.get(2)?,
        tmdb_id: r.get::<_, i64>(3)? as u64,
        imdb_id: r.get(4)?,
        title: r.get(5)?,
        year: r.get(6)?,
        season: r.get(7)?,
        episode: r.get(8)?,
        air_date: r.get(9)?,
        status: r.get(10)?,
        last_search_at: r.get(11)?,
    })
}

pub(super) const WANTED_COLS: &str =
    "id, request_id, kind, tmdb_id, imdb_id, title, year, season, episode, air_date, status, last_search_at";

// Append after an `INSERT INTO` / `INSERT OR IGNORE INTO` verb.
const WANTED_INSERT_TAIL: &str =
    "wanted (id, request_id, kind, tmdb_id, imdb_id, title, year, season, episode, air_date, status, last_search_at, updated_at) \
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)";

fn insert_wanted_rows(
    conn: &Connection,
    sql: &str,
    rows: &[WantedRow],
    now_ms: i64,
) -> rusqlite::Result<()> {
    let mut stmt = conn.prepare(sql)?;
    for w in rows {
        stmt.execute(params![
            w.id,
            w.request_id,
            w.kind,
            w.tmdb_id as i64,
            w.imdb_id,
            w.title,
            w.year,
            w.season,
            w.episode,
            w.air_date,
            w.status,
            w.last_search_at,
            now_ms
        ])?;
    }
    Ok(())
}

/// The id of a unit's row: one per movie, and one per episode of a show, so
/// the same episode asked for twice is the same row.
pub fn unit_id(kind: &str, tmdb_id: u64, season: Option<u32>, episode: Option<u32>) -> String {
    let at = |n: Option<u32>| n.map_or_else(|| "-".to_string(), |n| n.to_string());
    kroma_primitives::short_hash(&format!(
        "wanted|{kind}|{tmdb_id}|{}|{}",
        at(season),
        at(episode)
    ))
}

/// Puts a request's rows in the ledger: a unit nobody monitored yet joins it,
/// and one already there answers to this request from now on, keeping its
/// state, unless an open request already holds it.
pub fn claim_wanted(
    pool: &Pool,
    request_id: &str,
    rows: &[WantedRow],
    now_ms: i64,
) -> Result<()> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    insert_wanted_rows(
        &tx,
        &format!("INSERT OR IGNORE INTO {WANTED_INSERT_TAIL}"),
        rows,
        now_ms,
    )?;
    let mut adopt = tx.prepare(
        "UPDATE wanted SET request_id = ?1, updated_at = ?2 \
         WHERE kind = ?3 AND tmdb_id = ?4 \
           AND IFNULL(season, -1) = IFNULL(?5, -1) AND IFNULL(episode, -1) = IFNULL(?6, -1) \
           AND (request_id IS NULL OR request_id = ?1 OR request_id IN ( \
               SELECT id FROM requests WHERE status IN ('available', 'denied', 'failed')))",
    )?;
    for w in rows {
        adopt.execute(params![
            request_id,
            now_ms,
            w.kind,
            w.tmdb_id as i64,
            w.season,
            w.episode
        ])?;
    }
    drop(adopt);
    tx.commit()?;
    Ok(())
}

/// Additive: newly-aired episodes join the ledger without disturbing existing
/// grabbed/available rows, and a duplicate deterministic id is a no-op.
pub fn insert_wanted(pool: &Pool, rows: &[WantedRow], now_ms: i64) -> Result<()> {
    if rows.is_empty() {
        return Ok(());
    }
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    insert_wanted_rows(
        &tx,
        &format!("INSERT OR IGNORE INTO {WANTED_INSERT_TAIL}"),
        rows,
        now_ms,
    )?;
    tx.commit()?;
    Ok(())
}

/// Drop the request's wanted rows that are no longer wanted, keeping `keep_ids`.
///
/// The other half of a reconcile: [`claim_wanted`] adds what is newly covered
/// without disturbing what was already there, and this removes what stopped
/// being covered, so every surviving row keeps the state it had.
pub fn prune_wanted(pool: &Pool, request_id: &str, keep_ids: &[String]) -> Result<usize> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    let removed = if keep_ids.is_empty() {
        tx.execute(
            "DELETE FROM wanted WHERE request_id = ?1",
            params![request_id],
        )?
    } else {
        let keep: std::collections::HashSet<&str> = keep_ids.iter().map(String::as_str).collect();
        let present: Vec<String> = {
            let mut stmt = tx.prepare("SELECT id FROM wanted WHERE request_id = ?1")?;
            let rows = stmt.query_map(params![request_id], |r| r.get::<_, String>(0))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };
        // The set difference is taken here rather than as a chunked `NOT IN`:
        // one chunk of the keep list does not know about the next, so it would
        // delete rows a later chunk keeps.
        let doomed: Vec<&String> = present
            .iter()
            .filter(|id| !keep.contains(id.as_str()))
            .collect();
        let mut removed = 0;
        for chunk in doomed.chunks(IN_CHUNK) {
            let holes = std::iter::repeat_n("?", chunk.len())
                .collect::<Vec<_>>()
                .join(",");
            removed += tx.execute(
                &format!("DELETE FROM wanted WHERE id IN ({holes})"),
                rusqlite::params_from_iter(chunk.iter()),
            )?;
        }
        removed
    };
    tx.commit()?;
    Ok(removed)
}

/// Only fills a NULL `air_date`, so a known date is never overwritten, and never
/// touches `status`.
pub fn set_wanted_air_date(pool: &Pool, id: &str, air_date: &str, now_ms: i64) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE wanted SET air_date = ?2, updated_at = ?3 WHERE id = ?1 AND air_date IS NULL",
        params![id, air_date, now_ms],
    )?;
    Ok(())
}

/// The rows among `ids` that have not changed since `before_ms`.
pub fn wanted_unchanged_since(
    conn: &Connection,
    ids: &[String],
    before_ms: i64,
) -> rusqlite::Result<Vec<String>> {
    let mut settled = Vec::new();
    for chunk in ids.chunks(IN_CHUNK) {
        let holes = std::iter::repeat_n("?", chunk.len())
            .collect::<Vec<_>>()
            .join(",");
        let mut stmt = conn.prepare(&format!(
            "SELECT id FROM wanted WHERE updated_at <= ? AND id IN ({holes})"
        ))?;
        let params = std::iter::once(rusqlite::types::Value::from(before_ms)).chain(
            chunk
                .iter()
                .map(|id| rusqlite::types::Value::from(id.clone())),
        );
        let rows = stmt.query_map(rusqlite::params_from_iter(params), |r| r.get(0))?;
        settled.extend(rows.collect::<rusqlite::Result<Vec<String>>>()?);
    }
    Ok(settled)
}

/// Moves a monitored film's search date, which its minimum availability
/// decides; `None` makes it searchable now.
pub fn set_movie_air_date(
    pool: &Pool,
    tmdb_id: u64,
    air_date: Option<&str>,
    now_ms: i64,
) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE wanted SET air_date = ?2, updated_at = ?3 WHERE kind = 'movie' AND tmdb_id = ?1",
        params![tmdb_id as i64, air_date, now_ms],
    )?;
    Ok(())
}

pub fn wanted_for_request(conn: &Connection, request_id: &str) -> rusqlite::Result<Vec<WantedRow>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {WANTED_COLS} FROM wanted WHERE request_id = ?1 ORDER BY season, episode"
    ))?;
    let rows = stmt.query_map(params![request_id], row_to_wanted)?;
    rows.collect()
}

/// Every row in one status, across every title.
pub fn wanted_in_status(conn: &Connection, status: &str) -> rusqlite::Result<Vec<WantedRow>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {WANTED_COLS} FROM wanted WHERE status = ?1 ORDER BY tmdb_id, season, episode"
    ))?;
    let rows = stmt.query_map(params![status], row_to_wanted)?;
    rows.collect()
}

/// Every row a title has, whichever request it answers to.
pub fn wanted_for_title(
    conn: &Connection,
    kind: RequestKind,
    tmdb_id: u64,
) -> rusqlite::Result<Vec<WantedRow>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {WANTED_COLS} FROM wanted WHERE kind = ?1 AND tmdb_id = ?2 \
         ORDER BY season, episode"
    ))?;
    let rows = stmt.query_map(params![unit_kind(kind), tmdb_id as i64], row_to_wanted)?;
    rows.collect()
}

/// Removes rows by id, which unmonitors those units.
pub fn delete_wanted(pool: &Pool, ids: &[String]) -> Result<usize> {
    let conn = pool.get()?;
    let mut removed = 0;
    for chunk in ids.chunks(IN_CHUNK) {
        let holes = std::iter::repeat_n("?", chunk.len())
            .collect::<Vec<_>>()
            .join(",");
        removed += conn.execute(
            &format!("DELETE FROM wanted WHERE id IN ({holes})"),
            rusqlite::params_from_iter(chunk.iter()),
        )?;
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::requests::tests::*;
    use crate::requests::{insert_request, replace_show_gaps};
    use kroma_domain::RequestKind;

    #[test]
    fn pruning_narrows_a_ledger_and_leaves_the_survivors_as_they_were() {
        let p = pool();
        insert_request(&p, &new_req("r1", RequestKind::Show, 1396, None), 1000).unwrap();
        claim_wanted(
            &p,
            "r1",
            &[
                ep_row("w1", 1, 1, "available"),
                ep_row("w2", 1, 2, "grabbed"),
                ep_row("w3", 2, 1, "wanted"),
            ],
            1000,
        )
        .unwrap();

        let removed = prune_wanted(&p, "r1", &["w1".into(), "w2".into()]).unwrap();
        assert_eq!(removed, 1, "only the row that fell out of scope");

        let conn = p.get().unwrap();
        let rows = wanted_for_request(&conn, "r1").unwrap();
        assert_eq!(rows.len(), 2);
        // The point of pruning over replacing: what was downloaded stays known.
        assert_eq!(
            rows.iter().find(|w| w.id == "w1").unwrap().status,
            "available"
        );
        assert_eq!(
            rows.iter().find(|w| w.id == "w2").unwrap().status,
            "grabbed"
        );
    }

    #[test]
    fn pruning_to_nothing_empties_the_ledger() {
        let p = pool();
        insert_request(&p, &new_req("r1", RequestKind::Show, 1396, None), 1000).unwrap();
        claim_wanted(&p, "r1", &[ep_row("w1", 1, 1, "wanted")], 1000).unwrap();
        assert_eq!(prune_wanted(&p, "r1", &[]).unwrap(), 1);
        let conn = p.get().unwrap();
        assert!(wanted_for_request(&conn, "r1").unwrap().is_empty());
    }

    #[test]
    fn a_keep_list_longer_than_one_chunk_keeps_every_row_it_names() {
        let p = pool();
        insert_request(&p, &new_req("r1", RequestKind::Show, 1396, None), 1000).unwrap();
        let rows: Vec<WantedRow> = (0..IN_CHUNK + 50)
            .map(|n| ep_row(&format!("w{n}"), 1, n as u32, "wanted"))
            .collect();
        claim_wanted(&p, "r1", &rows, 1000).unwrap();

        let keep: Vec<String> = rows.iter().skip(1).map(|w| w.id.clone()).collect();
        let removed = prune_wanted(&p, "r1", &keep).unwrap();

        assert_eq!(removed, 1);
        let conn = p.get().unwrap();
        assert_eq!(wanted_for_request(&conn, "r1").unwrap().len(), keep.len());
    }

    #[test]
    fn pruning_one_request_never_reaches_another() {
        let p = pool();
        insert_request(&p, &new_req("r1", RequestKind::Show, 1396, None), 1000).unwrap();
        insert_request(&p, &new_req("r2", RequestKind::Show, 1400, None), 1000).unwrap();
        claim_wanted(&p, "r1", &[ep_row("w1", 1, 1, "wanted")], 1000).unwrap();
        let mut other = ep_row("w9", 1, 1, "wanted");
        other.request_id = Some("r2".into());
        other.tmdb_id = 1400;
        claim_wanted(&p, "r2", &[other], 1000).unwrap();

        prune_wanted(&p, "r1", &[]).unwrap();
        let conn = p.get().unwrap();
        assert_eq!(
            wanted_for_request(&conn, "r2").unwrap().len(),
            1,
            "r2 untouched"
        );
    }

    #[test]
    fn insert_wanted_is_additive_and_never_disturbs_grabbed() {
        let p = pool();
        insert_request(&p, &new_req("r1", RequestKind::Show, 1396, None), 1000).unwrap();
        let mk = |id: &str, episode: u32, air: Option<&str>, status: &str| WantedRow {
            id: id.into(),
            request_id: Some("r1".into()),
            kind: "episode".into(),
            tmdb_id: 1396,
            imdb_id: None,
            title: "T".into(),
            year: None,
            season: Some(1),
            episode: Some(episode),
            air_date: air.map(str::to_string),
            status: status.into(),
            last_search_at: None,
        };
        claim_wanted(
            &p,
            "r1",
            &[
                mk("w-e1", 1, Some("2020-01-01"), "grabbed"),
                mk("w-e2", 2, None, "wanted"),
            ],
            1000,
        )
        .unwrap();
        insert_wanted(
            &p,
            &[
                mk("w-e3", 3, Some("2020-01-03"), "wanted"),
                mk("w-e1", 1, Some("2020-01-01"), "wanted"),
            ],
            2000,
        )
        .unwrap();
        set_wanted_air_date(&p, "w-e2", "2020-01-02", 2000).unwrap();
        set_wanted_air_date(&p, "w-e1", "2999-01-01", 2000).unwrap();

        let conn = p.get().unwrap();
        let rows = wanted_for_request(&conn, "r1").unwrap();
        assert_eq!(rows.len(), 3, "e3 added; the e1 duplicate was ignored");
        let by_ep = |ep: u32| rows.iter().find(|w| w.episode == Some(ep)).unwrap();
        assert_eq!(by_ep(1).status, "grabbed");
        assert_eq!(by_ep(1).air_date.as_deref(), Some("2020-01-01"));
        assert_eq!(by_ep(2).air_date.as_deref(), Some("2020-01-02"));
        assert_eq!(by_ep(3).status, "wanted");
    }

    #[test]
    fn a_refused_row_rolls_the_whole_ledger_write_back() {
        let pool = pool();
        let conn = pool.get().unwrap();
        seed_library(&conn);
        insert_request(&pool, &new_req("r-1", RequestKind::Show, 1396, None), 1_000).unwrap();
        conn.execute_batch(
            "CREATE TRIGGER no_wanted BEFORE INSERT ON wanted \
             BEGIN SELECT RAISE(ABORT, 'refused'); END;
             CREATE TRIGGER no_gaps BEFORE INSERT ON library_gaps \
             BEGIN SELECT RAISE(ABORT, 'refused'); END",
        )
        .unwrap();
        drop(conn);

        let rows = vec![wanted_row("w-1", "r-1", Some("2030-01-01"), "wanted")];
        assert!(insert_wanted(&pool, &rows, 1_000).is_err());
        assert!(claim_wanted(&pool, "r-1", &rows, 1_000).is_err());
        assert!(replace_show_gaps(
            &pool,
            "s1",
            1396,
            "Breaking Bad",
            None,
            &[(1, 1, Some("2030-01-01".into()))],
            1_000
        )
        .is_err());
    }

    fn owner(p: &Pool, id: &str) -> Option<String> {
        let conn = p.get().unwrap();
        conn.query_row("SELECT request_id FROM wanted WHERE id = ?1", [id], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn claiming_a_unit_monitoring_holds_keeps_its_state() {
        let p = pool();
        insert_request(&p, &new_req("r1", RequestKind::Show, 1396, None), 1000).unwrap();
        let held = WantedRow {
            request_id: None,
            ..ep_row("w-held", 1, 1, "available")
        };
        insert_wanted(&p, &[held], 1000).unwrap();

        claim_wanted(&p, "r1", &[ep_row("w-fresh", 1, 1, "wanted")], 2000).unwrap();

        let conn = p.get().unwrap();
        let rows = wanted_for_request(&conn, "r1").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!((rows[0].id.as_str(), rows[0].status.as_str()), ("w-held", "available"));
    }

    #[test]
    fn claiming_never_takes_a_unit_from_an_open_request() {
        let p = pool();
        insert_request(&p, &new_req("r1", RequestKind::Show, 1396, None), 1000).unwrap();
        insert_request(&p, &new_req("r2", RequestKind::Show, 1396, None), 1000).unwrap();
        claim_wanted(&p, "r1", &[ep_row("w1", 1, 1, "wanted")], 1000).unwrap();

        claim_wanted(&p, "r2", &[ep_row("w2", 1, 1, "wanted")], 2000).unwrap();

        assert_eq!(owner(&p, "w1").as_deref(), Some("r1"));
    }

    #[test]
    fn claiming_takes_a_unit_from_a_request_that_is_over() {
        let p = pool();
        insert_request(&p, &new_req("r1", RequestKind::Show, 1396, None), 1000).unwrap();
        insert_request(&p, &new_req("r2", RequestKind::Show, 1396, None), 1000).unwrap();
        claim_wanted(&p, "r1", &[ep_row("w1", 1, 1, "available")], 1000).unwrap();
        crate::requests::set_request_status(
            &p,
            "r1",
            kroma_domain::RequestStatus::Available,
            None,
            None,
            1500,
        )
        .unwrap();

        claim_wanted(&p, "r2", &[ep_row("w2", 1, 1, "wanted")], 2000).unwrap();

        assert_eq!(owner(&p, "w1").as_deref(), Some("r2"));
    }

    #[test]
    fn deleting_a_request_leaves_its_units_monitored() {
        let p = pool();
        insert_request(&p, &new_req("r1", RequestKind::Show, 1396, None), 1000).unwrap();
        claim_wanted(&p, "r1", &[ep_row("w1", 1, 1, "wanted")], 1000).unwrap();

        crate::requests::delete_request(&p, "r1").unwrap();

        let conn = p.get().unwrap();
        let rows = wanted_for_title(&conn, RequestKind::Show, 1396).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].request_id, None);
    }

    #[test]
    fn deleting_rows_by_id_removes_only_those() {
        let p = pool();
        insert_wanted(
            &p,
            &[
                WantedRow {
                    request_id: None,
                    ..ep_row("w1", 1, 1, "wanted")
                },
                WantedRow {
                    request_id: None,
                    ..ep_row("w2", 1, 2, "wanted")
                },
            ],
            1000,
        )
        .unwrap();

        let removed = delete_wanted(&p, &["w1".into()]).unwrap();

        let conn = p.get().unwrap();
        assert_eq!(removed, 1);
        assert_eq!(wanted_for_title(&conn, RequestKind::Show, 1396).unwrap().len(), 1);
    }
}

use std::collections::HashSet;

use anyhow::Result;
use rusqlite::{params, Connection};

use super::Pool;

pub fn mark_watch_starter(pool: &Pool, download_id: &str, user_id: &str) -> Result<()> {
    pool.get()?.execute(
        "INSERT OR IGNORE INTO watch_starters (download_id, user_id) VALUES (?1, ?2)",
        params![download_id, user_id],
    )?;
    Ok(())
}

pub fn forget_watch_starters(pool: &Pool, download_id: &str) -> Result<()> {
    pool.get()?.execute(
        "DELETE FROM watch_starters WHERE download_id = ?1",
        params![download_id],
    )?;
    Ok(())
}

pub fn watches_started_by(conn: &Connection, user_id: &str) -> rusqlite::Result<HashSet<String>> {
    let mut stmt = conn.prepare("SELECT download_id FROM watch_starters WHERE user_id = ?1")?;
    let ids = stmt.query_map(params![user_id], |row| row.get(0))?;
    ids.collect()
}

pub fn started_the_watch(
    conn: &Connection,
    download_id: &str,
    user_id: &str,
) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT 1 FROM watch_starters WHERE download_id = ?1 AND user_id = ?2",
        params![download_id, user_id],
        |_| Ok(true),
    )
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(false),
        other => Err(other),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::test_db;

    #[test]
    fn a_download_is_seen_by_the_members_who_asked_for_it_and_nobody_else() {
        let pool = test_db();
        mark_watch_starter(&pool, "d1", "ana").unwrap();
        mark_watch_starter(&pool, "d1", "ana").unwrap();
        mark_watch_starter(&pool, "d1", "bo").unwrap();
        mark_watch_starter(&pool, "d2", "bo").unwrap();
        let conn = pool.get().unwrap();

        let anas = watches_started_by(&conn, "ana").unwrap();

        assert_eq!(anas, HashSet::from(["d1".to_string()]));
        assert!(started_the_watch(&conn, "d1", "bo").unwrap());
        assert!(!started_the_watch(&conn, "d2", "ana").unwrap());
    }

    #[test]
    fn an_erased_download_takes_every_claim_on_it_with_it() {
        let pool = test_db();
        mark_watch_starter(&pool, "d1", "ana").unwrap();
        mark_watch_starter(&pool, "d1", "bo").unwrap();

        forget_watch_starters(&pool, "d1").unwrap();

        let conn = pool.get().unwrap();
        assert!(watches_started_by(&conn, "ana").unwrap().is_empty());
        assert!(!started_the_watch(&conn, "d1", "bo").unwrap());
    }
}

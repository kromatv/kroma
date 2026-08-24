//! The per-user flags on an item: watched, and on my list.

use anyhow::Result;
use rusqlite::params;

use crate::now_or_blank;
use crate::pool::Pool;

/// Mark an item as watched for a user, and drop any resume position so it leaves
/// "Continue watching". Idempotent (re-marking just refreshes `watched_at`).
pub fn mark_watched(pool: &Pool, user_id: &str, item_id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO watched (user_id,item_id,watched_at) VALUES (?1,?2,?3) \
         ON CONFLICT(user_id,item_id) DO UPDATE SET watched_at=excluded.watched_at",
        params![user_id, item_id, now_or_blank()],
    )?;
    conn.execute(
        "DELETE FROM progress WHERE user_id = ?1 AND item_id = ?2",
        params![user_id, item_id],
    )?;
    Ok(())
}

/// Clear an item's watched flag for a user. Idempotent.
pub fn unmark_watched(pool: &Pool, user_id: &str, item_id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "DELETE FROM watched WHERE user_id = ?1 AND item_id = ?2",
        params![user_id, item_id],
    )?;
    Ok(())
}

/// Every item id the user has marked (or finished) as watched clients hydrate a
/// set once and badge cards from it.
pub fn list_watched(pool: &Pool, user_id: &str) -> Result<Vec<String>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT item_id FROM watched WHERE user_id = ?1")?;
    let rows = stmt.query_map(params![user_id], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Add a title to the user's list. Idempotent (re-adding refreshes `added_at`).
pub fn add_to_list(pool: &Pool, user_id: &str, item_id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO my_list (user_id,item_id,added_at) VALUES (?1,?2,?3) \
         ON CONFLICT(user_id,item_id) DO UPDATE SET added_at=excluded.added_at",
        params![user_id, item_id, now_or_blank()],
    )?;
    Ok(())
}

/// Remove a title from the user's list. Idempotent.
pub fn remove_from_list(pool: &Pool, user_id: &str, item_id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "DELETE FROM my_list WHERE user_id = ?1 AND item_id = ?2",
        params![user_id, item_id],
    )?;
    Ok(())
}

/// Every item id in the user's list, most-recently-added first.
pub fn list_my_list(pool: &Pool, user_id: &str) -> Result<Vec<String>> {
    let conn = pool.get()?;
    let mut stmt =
        conn.prepare("SELECT item_id FROM my_list WHERE user_id = ?1 ORDER BY added_at DESC")?;
    let rows = stmt.query_map(params![user_id], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::playback::test_support::*;
    use crate::playback::{get_progress, upsert_progress};

    #[test]
    fn mark_unmark_round_trips_and_clears_progress() {
        let (pool, uid) = pool_with_user();
        assert!(list_watched(&pool, &uid).unwrap().is_empty());

        // A resume position that mark_watched should wipe.
        upsert_progress(&pool, &uid, "m1", 60_000, Some(120_000)).unwrap();
        mark_watched(&pool, &uid, "m1").unwrap();
        assert_eq!(list_watched(&pool, &uid).unwrap(), vec!["m1".to_string()]);
        assert!(
            get_progress(&pool, &uid, "m1").unwrap().is_none(),
            "marking watched clears resume"
        );

        // Idempotent: marking again keeps a single row.
        mark_watched(&pool, &uid, "m1").unwrap();
        assert_eq!(list_watched(&pool, &uid).unwrap().len(), 1);

        // Shows (ids not in `items`) can be marked too the column has no items FK.
        mark_watched(&pool, &uid, "show-7").unwrap();
        let mut ids = list_watched(&pool, &uid).unwrap();
        ids.sort();
        assert_eq!(ids, vec!["m1".to_string(), "show-7".to_string()]);

        unmark_watched(&pool, &uid, "m1").unwrap();
        assert_eq!(
            list_watched(&pool, &uid).unwrap(),
            vec!["show-7".to_string()]
        );
    }

    #[test]
    fn my_list_add_remove_round_trips() {
        let (pool, uid) = pool_with_user();
        assert!(list_my_list(&pool, &uid).unwrap().is_empty());

        add_to_list(&pool, &uid, "m1").unwrap();
        add_to_list(&pool, &uid, "show-7").unwrap(); // show ids allowed (no items FK)
        add_to_list(&pool, &uid, "m1").unwrap(); // idempotent
        let mut ids = list_my_list(&pool, &uid).unwrap();
        ids.sort();
        assert_eq!(ids, vec!["m1".to_string(), "show-7".to_string()]);

        remove_from_list(&pool, &uid, "m1").unwrap();
        assert_eq!(
            list_my_list(&pool, &uid).unwrap(),
            vec!["show-7".to_string()]
        );
    }
}

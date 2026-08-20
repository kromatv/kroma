//! Moving a row between read and unread, and deleting it.

use crate::{Pool, IN_CHUNK};
use anyhow::Result;
use rusqlite::params;

/// Mark some (or, with `None`, all) of a user's notifications read. Scoped to
/// `user_id` so an id guessed from another account is a no-op, not a leak.
/// Returns how many rows changed.
pub fn mark_read(pool: &Pool, user_id: &str, ids: Option<&[String]>, now_ms: i64) -> Result<usize> {
    set_read_at(pool, user_id, ids, Some(now_ms))
}

/// Put rows back in the unread pile, so a reader who marked one read by mistake
/// can undo it without waiting for the event to happen again. Scoped like
/// [`mark_read`]. There is no `None` case on purpose: "mark everything unread"
/// is not an affordance anyone wants.
pub fn mark_unread(pool: &Pool, user_id: &str, ids: &[String]) -> Result<usize> {
    set_read_at(pool, user_id, Some(ids), None)
}

fn set_read_at(
    pool: &Pool,
    user_id: &str,
    ids: Option<&[String]>,
    read_at: Option<i64>,
) -> Result<usize> {
    let mut conn = pool.get()?;
    // Only rows on the far side of the transition, so the count is what moved.
    let side = if read_at.is_some() { "read_at IS NULL" } else { "read_at IS NOT NULL" };
    let Some(ids) = ids else {
        return Ok(conn.execute(
            &format!("UPDATE notifications SET read_at = ?2 WHERE user_id = ?1 AND {side}"),
            params![user_id, read_at],
        )?);
    };
    if ids.is_empty() {
        return Ok(0);
    }

    // One transaction over the chunks: a caller that marks a list read sees all
    // of it move or none of it, whatever the list's length.
    let tx = conn.transaction()?;
    let mut changed = 0;
    for chunk in ids.chunks(IN_CHUNK) {
        let placeholders = vec!["?"; chunk.len()].join(",");
        let sql = format!(
            "UPDATE notifications SET read_at = ? WHERE user_id = ? AND {side} \
             AND id IN ({placeholders})"
        );
        let mut args: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(chunk.len() + 2);
        args.push(&read_at);
        args.push(&user_id);
        for id in chunk {
            args.push(id);
        }
        changed += tx.execute(&sql, args.as_slice())?;
    }
    tx.commit()?;
    Ok(changed)
}

/// Delete one of the caller's own notifications.
pub fn delete_notification(pool: &Pool, user_id: &str, id: &str) -> Result<bool> {
    let conn = pool.get()?;
    let n = conn.execute(
        "DELETE FROM notifications WHERE user_id = ?1 AND id = ?2",
        params![user_id, id],
    )?;
    Ok(n > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notifications::test_support::*;
    use crate::notifications::{list_notifications, unread_count};

    #[test]
    fn mark_read_all_then_only_unread_listing_is_empty() {
        let (p, u1, _) = pool();
        insert(&p, "n1", &u1, 1_000);
        insert(&p, "n2", &u1, 2_000);
        assert_eq!(mark_read(&p, &u1, None, 9_000).unwrap(), 2);
        let conn = p.get().unwrap();
        assert_eq!(unread_count(&conn, &u1).unwrap(), 0);
        assert!(list_notifications(&conn, &u1, 50, true).unwrap().is_empty());
        drop(conn);
        assert_eq!(mark_read(&p, &u1, None, 9_001).unwrap(), 0);
    }

    #[test]
    fn mark_read_by_id_cannot_touch_another_users_rows() {
        let (p, u1, u2) = pool();
        insert(&p, "mine", &u1, 1_000);
        insert(&p, "theirs", &u2, 1_000);
        let ids = vec!["theirs".to_string()];
        assert_eq!(mark_read(&p, &u1, Some(&ids), 9_000).unwrap(), 0);
        let conn = p.get().unwrap();
        assert_eq!(unread_count(&conn, &u2).unwrap(), 1);
        drop(conn);
        let ids = vec!["mine".to_string()];
        assert_eq!(mark_read(&p, &u1, Some(&ids), 9_000).unwrap(), 1);
    }

    #[test]
    fn a_read_list_longer_than_sqlite_can_bind_still_marks_the_rows() {
        const SQLITE_BIND_LIMIT: usize = 32_766;
        let (p, u1, _) = pool();
        insert(&p, "n1", &u1, 1_000);
        let mut ids: Vec<String> = (0..=SQLITE_BIND_LIMIT).map(|n| format!("absent{n}")).collect();
        ids.push("n1".to_string());

        assert_eq!(mark_read(&p, &u1, Some(&ids), 9_000).unwrap(), 1);

        let conn = p.get().unwrap();
        assert_eq!(unread_count(&conn, &u1).unwrap(), 0);
    }

    #[test]
    fn mark_unread_puts_a_row_back_and_counts_only_what_moved() {
        let (p, u1, _) = pool();
        insert(&p, "n1", &u1, 1_000);
        insert(&p, "n2", &u1, 2_000);
        assert_eq!(mark_read(&p, &u1, None, 9_000).unwrap(), 2);

        let ids = vec!["n1".to_string()];
        assert_eq!(mark_unread(&p, &u1, &ids).unwrap(), 1);
        let conn = p.get().unwrap();
        assert_eq!(unread_count(&conn, &u1).unwrap(), 1);
        assert_eq!(list_notifications(&conn, &u1, 50, true).unwrap().len(), 1);
        drop(conn);
        // Already unread: nothing moves, and nothing is double-counted.
        assert_eq!(mark_unread(&p, &u1, &ids).unwrap(), 0);
        assert_eq!(mark_unread(&p, &u1, &[]).unwrap(), 0);
    }

    #[test]
    fn mark_unread_cannot_touch_another_users_rows() {
        let (p, u1, u2) = pool();
        insert(&p, "theirs", &u2, 1_000);
        assert_eq!(mark_read(&p, &u2, None, 9_000).unwrap(), 1);

        let ids = vec!["theirs".to_string()];
        assert_eq!(mark_unread(&p, &u1, &ids).unwrap(), 0);
        let conn = p.get().unwrap();
        assert_eq!(unread_count(&conn, &u2).unwrap(), 0);
    }

    #[test]
    fn delete_is_scoped_to_the_owner() {
        let (p, u1, u2) = pool();
        insert(&p, "n1", &u1, 1_000);
        assert!(!delete_notification(&p, &u2, "n1").unwrap());
        assert!(delete_notification(&p, &u1, "n1").unwrap());
        let conn = p.get().unwrap();
        assert!(list_notifications(&conn, &u1, 50, false).unwrap().is_empty());
    }
}

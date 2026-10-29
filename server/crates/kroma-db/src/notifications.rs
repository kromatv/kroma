//! Notification persistence: insert, list newest-first, unread tally, read /
//! delete transitions, retention, and the per-user delivery matrix. Rows store
//! i18n keys, not rendered text; `services::notify::render` builds the wire shape.

use super::{params, Connection, Result};
use kroma_domain::PushCategory;

mod digest;
mod preferences;
mod read_state;
mod stored;
mod subjects;

#[cfg(test)]
mod test_support;

pub use digest::*;
pub use preferences::*;
pub use read_state::*;
pub use stored::*;
pub use subjects::*;

use stored::{data_column, row_to_notification, NOTIFICATION_COLS};

pub const RETENTION_PER_USER: usize = 200;

/// Every image a stored notification still points at, so the size-based cache
/// trimmer knows an uploaded image is spoken for and must not evict it.
pub fn referenced_images(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt =
        conn.prepare("SELECT DISTINCT image_url FROM notifications WHERE image_url IS NOT NULL")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Insert one notification for `user_id`, enforce [`RETENTION_PER_USER`], and
/// return that user's new unread count.
pub fn insert_notification(
    conn: &Connection,
    user_id: &str,
    n: &StoredNotification,
) -> Result<u32> {
    // Serialization can't realistically fail; degrade to empty rather than lose the notification.
    let params = serde_json::to_string(&n.params).unwrap_or_else(|_| "{}".into());
    let actions = serde_json::to_string(&n.actions).unwrap_or_else(|_| "[]".into());
    conn.execute(
        "INSERT INTO notifications \
         (id, user_id, category, event, title_key, body_key, params, link, image_url, actions, \
          push_category, created_at, subject_kind, subject_id, actor_id, data) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            n.id,
            user_id,
            // The spec's category, not the event's default: `Custom` reports `System`,
            // while a module names the preference bucket its notification answers to.
            n.category.as_str(),
            n.event.as_str(),
            n.title_key,
            n.body_key,
            params,
            n.link,
            n.image_url,
            actions,
            n.push_category.map(PushCategory::as_str),
            n.created_at,
            n.subject.as_ref().map(|s| s.kind.as_str()),
            n.subject.as_ref().map(|s| s.id.as_str()),
            n.actor_id,
            data_column(n)
        ],
    )?;
    prune(conn, user_id)?;
    Ok(unread_count(conn, user_id)?)
}

fn prune(conn: &Connection, user_id: &str) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM notifications WHERE user_id = ?1 AND id NOT IN \
         (SELECT id FROM notifications WHERE user_id = ?1 ORDER BY created_at DESC LIMIT ?2)",
        params![user_id, RETENTION_PER_USER as i64],
    )?;
    Ok(())
}

/// One user's notifications, newest first.
pub fn list_notifications(
    conn: &Connection,
    user_id: &str,
    limit: usize,
    only_unread: bool,
) -> rusqlite::Result<Vec<StoredNotification>> {
    let unread = if only_unread {
        " AND read_at IS NULL"
    } else {
        ""
    };
    let sql = format!(
        "SELECT {NOTIFICATION_COLS} FROM notifications WHERE user_id = ?1{unread} \
         ORDER BY created_at DESC LIMIT ?2"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![user_id, limit as i64], row_to_notification)?;
    rows.collect()
}

/// Unread tally for the bell badge.
pub fn unread_count(conn: &Connection, user_id: &str) -> rusqlite::Result<u32> {
    conn.query_row(
        "SELECT COUNT(*) FROM notifications WHERE user_id = ?1 AND read_at IS NULL",
        params![user_id],
        |r| r.get(0),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notifications::test_support::*;
    use kroma_domain::{ActionKind, NotificationCategory, ParamValue};

    #[test]
    fn insert_round_trips_every_rich_field() {
        let (p, u1, _) = pool();
        insert(&p, "n1", &u1, 1_000);
        let conn = p.get().unwrap();
        let list = list_notifications(&conn, &u1, 50, false).unwrap();
        assert_eq!(list.len(), 1);
        let n = &list[0];
        assert_eq!(n.link.as_deref(), Some("/movie/ab12"));
        assert_eq!(n.image_url.as_deref(), Some("https://img/p.jpg"));
        assert_eq!(
            n.params.get("title"),
            Some(&ParamValue::Text("Dune".into()))
        );
        assert_eq!(n.actions.len(), 1);
        assert_eq!(n.actions[0].id, "view");
        assert_eq!(n.actions[0].kind, ActionKind::Link);
        assert_eq!(n.push_category, Some(PushCategory::MediaAvailable));
        // The category column is derived from the event, not passed in.
        assert_eq!(n.category, NotificationCategory::Requests);
        assert!(!n.read);
    }

    #[test]
    fn insert_round_trips_the_subject_the_actor_and_the_data() {
        let (p, u1, _) = pool();
        insert(&p, "n1", &u1, 1_000);
        let conn = p.get().unwrap();
        let n = &list_notifications(&conn, &u1, 50, false).unwrap()[0];
        assert_eq!(
            n.subject,
            Some(kroma_domain::NotificationSubject::request("req-1"))
        );
        assert_eq!(n.actor_id.as_deref(), Some("mod-1"));
        assert_eq!(n.data, Some(serde_json::json!({ "requestId": "req-1" })));
    }

    #[test]
    fn a_row_written_before_subjects_existed_reads_back_with_none() {
        let (p, u1, _) = pool();
        let conn = p.get().unwrap();
        let mut legacy = new("old", 1_000);
        legacy.subject = None;
        legacy.actor_id = None;
        legacy.data = None;
        insert_notification(&conn, &u1, &legacy).unwrap();

        let n = &list_notifications(&conn, &u1, 50, false).unwrap()[0];

        assert_eq!(n.subject, None);
        assert_eq!(n.actor_id, None);
        assert_eq!(n.data, None);
        assert_eq!(n.link.as_deref(), Some("/movie/ab12"));
    }

    #[test]
    fn data_past_the_ceiling_is_dropped_rather_than_stored() {
        let (p, u1, _) = pool();
        let conn = p.get().unwrap();
        let mut bloated = new("fat", 1_000);
        bloated.data = Some(serde_json::json!({ "blob": "x".repeat(MAX_DATA_BYTES) }));
        insert_notification(&conn, &u1, &bloated).unwrap();

        let n = &list_notifications(&conn, &u1, 50, false).unwrap()[0];

        assert_eq!(n.data, None);
        assert_eq!(n.title_key, "notifications.request.approved.title");
    }

    #[test]
    fn listing_and_counting_are_scoped_to_one_user() {
        let (p, u1, u2) = pool();
        insert(&p, "n1", &u1, 1_000);
        insert(&p, "n2", &u2, 1_000);
        let conn = p.get().unwrap();
        assert_eq!(list_notifications(&conn, &u1, 50, false).unwrap().len(), 1);
        assert_eq!(unread_count(&conn, &u1).unwrap(), 1);
        assert_eq!(unread_count(&conn, &u2).unwrap(), 1);
    }

    #[test]
    fn retention_keeps_the_newest_and_drops_the_rest() {
        let (p, u1, _) = pool();
        for i in 0..(RETENTION_PER_USER + 5) {
            insert(&p, &format!("n{i}"), &u1, i as i64);
        }
        let conn = p.get().unwrap();
        let list = list_notifications(&conn, &u1, 1_000, false).unwrap();
        assert_eq!(list.len(), RETENTION_PER_USER);
        assert_eq!(list[0].id, format!("n{}", RETENTION_PER_USER + 4));
        assert!(!list.iter().any(|n| n.id == "n0"));
    }

    #[test]
    fn deleting_a_user_takes_their_notifications_with_them() {
        let (p, u1, _) = pool();
        insert(&p, "n1", &u1, 1_000);
        let conn = p.get().unwrap();
        conn.execute("DELETE FROM users WHERE id = ?1", params![u1])
            .unwrap();
        // ON DELETE CASCADE, so no orphan inbox survives the account.
        assert_eq!(unread_count(&conn, &u1).unwrap(), 0);
    }

    #[test]
    fn a_retention_sweep_that_is_refused_fails_the_write_it_belongs_to() {
        let (p, u1, _) = pool();
        let conn = p.get().unwrap();
        for n in 0..=RETENTION_PER_USER {
            insert_notification(&conn, &u1, &new(&format!("n{n}"), n as i64)).unwrap();
        }
        conn.execute_batch(
            "CREATE TRIGGER no_prune BEFORE DELETE ON notifications \
             BEGIN SELECT RAISE(ABORT, 'refused'); END",
        )
        .unwrap();

        assert!(insert_notification(&conn, &u1, &new("over", 9_999)).is_err());
    }
}

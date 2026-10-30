//! Notification persistence: insert, list newest-first, unread tally, read /
//! delete transitions, retention, and the per-user delivery matrix. Rows store
//! i18n keys, not rendered text; `services::notify::render` builds the wire shape.

use rusqlite::OptionalExtension;

use super::{params, Connection, Result};
use kroma_domain::{NotificationEvent, NotificationSubject, PushCategory};

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

/// What writing a notification did, and to which row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Written {
    /// The row that now holds this news: a new id, or the id of the row the
    /// repeat folded into.
    pub id: String,
    /// Emissions this row now stands for, `1` for a row nothing folded into.
    pub count: u32,
    pub folded: bool,
    pub unread: u32,
}

/// Write one notification for `user_id`, folding it into the row that already
/// holds its group where there is one, enforce [`RETENTION_PER_USER`], and
/// report what happened.
pub fn insert_notification(
    conn: &Connection,
    user_id: &str,
    n: &StoredNotification,
) -> Result<Written> {
    if let Some(key) = n.group_key.as_deref() {
        if let Some(written) = fold_into_group(conn, user_id, key, n)? {
            return Ok(written);
        }
    }
    // Serialization can't realistically fail; degrade to empty rather than lose the notification.
    let params = serde_json::to_string(&n.params).unwrap_or_else(|_| "{}".into());
    let actions = serde_json::to_string(&n.actions).unwrap_or_else(|_| "[]".into());
    conn.execute(
        "INSERT INTO notifications \
         (id, user_id, category, event, title_key, body_key, params, link, image_url, actions, \
          push_category, created_at, subject_kind, subject_id, actor_id, data, dedupe_key, \
          group_key, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, \
          ?18, ?12)",
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
            data_column(n),
            n.dedupe_key,
            n.group_key
        ],
    )?;
    prune(conn, user_id)?;
    Ok(Written {
        id: n.id.clone(),
        count: 1,
        folded: false,
        unread: unread_count(conn, user_id)?,
    })
}

fn fold_into_group(
    conn: &Connection,
    user_id: &str,
    key: &str,
    n: &StoredNotification,
) -> Result<Option<Written>> {
    let existing: Option<(String, u32)> = conn
        .query_row(
            "SELECT id, count FROM notifications WHERE user_id = ?1 AND group_key = ?2 \
             ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 1",
            params![user_id, key],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    let Some((id, count)) = existing else {
        return Ok(None);
    };
    let params_json = serde_json::to_string(&n.params).unwrap_or_else(|_| "{}".into());
    let actions_json = serde_json::to_string(&n.actions).unwrap_or_else(|_| "[]".into());
    conn.execute(
        "UPDATE notifications SET count = count + 1, updated_at = ?3, read_at = NULL, \
           title_key = ?4, body_key = ?5, params = ?6, link = ?7, image_url = ?8, \
           actions = ?9, actor_id = ?10, data = ?11 \
         WHERE user_id = ?1 AND id = ?2",
        params![
            user_id,
            id,
            n.created_at,
            n.title_key,
            n.body_key,
            params_json,
            n.link,
            n.image_url,
            actions_json,
            n.actor_id,
            data_column(n)
        ],
    )?;
    Ok(Some(Written {
        id,
        count: count + 1,
        folded: true,
        unread: unread_count(conn, user_id)?,
    }))
}

fn prune(conn: &Connection, user_id: &str) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM notifications WHERE user_id = ?1 AND id NOT IN \
         (SELECT id FROM notifications WHERE user_id = ?1 \
           ORDER BY COALESCE(updated_at, created_at) DESC LIMIT ?2)",
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
         ORDER BY COALESCE(updated_at, created_at) DESC LIMIT ?2"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![user_id, limit as i64], row_to_notification)?;
    rows.collect()
}

/// Mark every row about `subject` raised by `event` as settled, whoever holds
/// it, and report how many moved. `by` is the account that settled it, `None`
/// when the server did.
pub fn resolve(
    conn: &Connection,
    subject: &NotificationSubject,
    event: NotificationEvent,
    by: Option<&str>,
    now: i64,
) -> rusqlite::Result<usize> {
    conn.execute(
        "UPDATE notifications SET resolved_at = ?4, resolved_by = ?5 \
         WHERE subject_kind = ?1 AND subject_id = ?2 AND event = ?3 AND resolved_at IS NULL",
        params![subject.kind, subject.id, event.as_str(), now, by],
    )
}

/// How long one folded group waits between banners. Repeats in between update
/// the inbox and raise nothing on the device.
pub const PUSH_THROTTLE_MS: i64 = 60 * 60 * 1000;

/// Claims the right to push `id` now, and says whether it was granted. A row
/// outside a group always pushes; one inside a group pushes at most once per
/// [`PUSH_THROTTLE_MS`], counted from the last banner it raised.
pub fn claim_push(conn: &Connection, id: &str, now: i64) -> rusqlite::Result<bool> {
    let granted = conn.execute(
        "UPDATE notifications SET pushed_at = ?2 WHERE id = ?1 \
         AND (group_key IS NULL OR pushed_at IS NULL OR pushed_at <= ?3)",
        params![id, now, now - PUSH_THROTTLE_MS],
    )?;
    Ok(granted > 0)
}

/// Whether `user_id` still holds a row this producer has already sent, named by
/// its `dedupe_key`.
pub fn holds_dedupe_key(conn: &Connection, user_id: &str, key: &str) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM notifications WHERE user_id = ?1 AND dedupe_key = ?2)",
        params![user_id, key],
        |r| r.get(0),
    )
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
    fn a_dedupe_key_is_held_by_the_one_recipient_that_was_told() {
        let (p, u1, u2) = pool();
        let conn = p.get().unwrap();
        let mut told = new("n1", 1_000);
        told.dedupe_key = Some("request.available:req-1:available".into());
        insert_notification(&conn, &u1, &told).unwrap();

        assert!(holds_dedupe_key(&conn, &u1, "request.available:req-1:available").unwrap());
        assert!(!holds_dedupe_key(&conn, &u2, "request.available:req-1:available").unwrap());
        assert!(
            !holds_dedupe_key(&conn, &u1, "request.available:req-1:partially_available").unwrap()
        );
    }

    #[test]
    fn a_repeat_of_one_group_folds_into_the_row_that_already_holds_it() {
        let (p, u1, _) = pool();
        let conn = p.get().unwrap();
        let mut first = new("n1", 1_000);
        first.group_key = Some("system.job.failed:job:library.scan".into());
        let mut again = new("n2", 2_000);
        again.group_key = first.group_key.clone();
        insert_notification(&conn, &u1, &first).unwrap();

        let written = insert_notification(&conn, &u1, &again).unwrap();

        assert!(written.folded);
        assert_eq!(written.id, "n1");
        assert_eq!(written.count, 2);
        let rows = list_notifications(&conn, &u1, 50, false).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].count, 2);
        assert_eq!(rows[0].updated_at, 2_000);
    }

    #[test]
    fn a_fold_brings_the_row_back_unread_and_up_to_the_top() {
        let (p, u1, _) = pool();
        let conn = p.get().unwrap();
        let mut failing = new("n1", 1_000);
        failing.group_key = Some("system.job.failed:job:library.scan".into());
        insert_notification(&conn, &u1, &failing).unwrap();
        insert_notification(&conn, &u1, &new("other", 2_000)).unwrap();
        mark_read(&p, &u1, None, 1_500).unwrap();

        let mut again = failing.clone();
        again.id = "n2".into();
        again.created_at = 3_000;
        insert_notification(&conn, &u1, &again).unwrap();

        let rows = list_notifications(&conn, &u1, 50, false).unwrap();
        assert_eq!(rows[0].id, "n1");
        assert!(!rows[0].read);
        assert!(rows[1].read);
    }

    #[test]
    fn a_row_with_no_group_is_its_own_row_every_time() {
        let (p, u1, _) = pool();
        let conn = p.get().unwrap();
        insert_notification(&conn, &u1, &new("n1", 1_000)).unwrap();

        let written = insert_notification(&conn, &u1, &new("n2", 2_000)).unwrap();

        assert!(!written.folded);
        assert_eq!(list_notifications(&conn, &u1, 50, false).unwrap().len(), 2);
    }

    #[test]
    fn a_group_raises_one_banner_an_hour_and_an_ungrouped_row_every_time() {
        let (p, u1, _) = pool();
        let conn = p.get().unwrap();
        let mut grouped = new("n1", 0);
        grouped.group_key = Some("system.job.failed:job:library.scan".into());
        insert_notification(&conn, &u1, &grouped).unwrap();
        insert_notification(&conn, &u1, &new("loose", 0)).unwrap();

        assert!(claim_push(&conn, "n1", 0).unwrap());
        assert!(!claim_push(&conn, "n1", PUSH_THROTTLE_MS - 1).unwrap());
        assert!(claim_push(&conn, "n1", PUSH_THROTTLE_MS).unwrap());
        assert!(claim_push(&conn, "loose", 0).unwrap());
        assert!(claim_push(&conn, "loose", 1).unwrap());
    }

    #[test]
    fn settling_a_subject_reaches_every_recipient_that_holds_it() {
        let (p, u1, u2) = pool();
        let conn = p.get().unwrap();
        let about = kroma_domain::NotificationSubject::request("req-7");
        let mut asked = new("n1", 1_000);
        asked.subject = Some(about.clone());
        asked.event = NotificationEvent::RequestSubmitted;
        insert_notification(&conn, &u1, &asked).unwrap();
        asked.id = "n2".into();
        insert_notification(&conn, &u2, &asked).unwrap();

        let moved = resolve(&conn, &about, NotificationEvent::RequestSubmitted, Some("mod-1"), 9).unwrap();

        assert_eq!(moved, 2);
        for user in [&u1, &u2] {
            let row = &list_notifications(&conn, user, 50, false).unwrap()[0];
            assert_eq!(row.resolved_at, Some(9));
            assert_eq!(row.resolved_by.as_deref(), Some("mod-1"));
        }
    }

    #[test]
    fn settling_leaves_another_subject_and_another_event_alone() {
        let (p, u1, _) = pool();
        let conn = p.get().unwrap();
        let mut asked = new("n1", 1_000);
        asked.subject = Some(kroma_domain::NotificationSubject::request("req-7"));
        asked.event = NotificationEvent::RequestSubmitted;
        insert_notification(&conn, &u1, &asked).unwrap();

        let other = resolve(
            &conn,
            &kroma_domain::NotificationSubject::request("req-8"),
            NotificationEvent::RequestSubmitted,
            None,
            9,
        )
        .unwrap();
        let wrong_event = resolve(
            &conn,
            &kroma_domain::NotificationSubject::request("req-7"),
            NotificationEvent::RequestApproved,
            None,
            9,
        )
        .unwrap();

        assert_eq!((other, wrong_event), (0, 0));
        assert_eq!(
            list_notifications(&conn, &u1, 50, false).unwrap()[0].resolved_at,
            None
        );
    }

    #[test]
    fn a_row_settled_once_keeps_the_account_that_settled_it() {
        let (p, u1, _) = pool();
        let conn = p.get().unwrap();
        let about = kroma_domain::NotificationSubject::request("req-7");
        let mut asked = new("n1", 1_000);
        asked.subject = Some(about.clone());
        asked.event = NotificationEvent::RequestSubmitted;
        insert_notification(&conn, &u1, &asked).unwrap();
        resolve(&conn, &about, NotificationEvent::RequestSubmitted, Some("ana"), 9).unwrap();

        let again = resolve(&conn, &about, NotificationEvent::RequestSubmitted, Some("bo"), 20).unwrap();

        assert_eq!(again, 0);
        let row = &list_notifications(&conn, &u1, 50, false).unwrap()[0];
        assert_eq!(row.resolved_by.as_deref(), Some("ana"));
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

//! Notification persistence: insert, list newest-first, unread tally, read /
//! delete transitions, retention, and the per-user delivery matrix. Rows store
//! i18n keys, not rendered text; `services::notify::render` builds the wire shape.

use std::collections::BTreeMap;

use super::*;
use kroma_domain::{
    ActionSpec, CategoryPref, NotificationCategory, NotificationEvent, ParamValue, PushCategory,
};

pub const RETENTION_PER_USER: usize = 200;

// Column order must match `row_to_notification`.
const NOTIFICATION_COLS: &str = "id, category, event, title_key, body_key, params, link, \
    image_url, actions, push_category, read_at, created_at";

/// One notification as stored: keys + params, not yet rendered.
#[derive(Debug, Clone)]
pub struct StoredNotification {
    pub id: String,
    pub category: NotificationCategory,
    pub event: NotificationEvent,
    pub title_key: String,
    pub body_key: String,
    pub params: BTreeMap<String, ParamValue>,
    pub link: Option<String>,
    pub image_url: Option<String>,
    pub actions: Vec<ActionSpec>,
    pub push_category: Option<PushCategory>,
    pub read: bool,
    pub created_at: i64,
}

fn row_to_notification(r: &Row) -> rusqlite::Result<StoredNotification> {
    let category: String = r.get(1)?;
    let event: String = r.get(2)?;
    let params: String = r.get(5)?;
    let actions: String = r.get(8)?;
    let push_category: Option<String> = r.get(9)?;
    let read_at: Option<i64> = r.get(10)?;
    Ok(StoredNotification {
        id: r.get(0)?,
        // Unknown category (written by a newer build): fall back rather than drop the row.
        category: NotificationCategory::parse(&category).unwrap_or(NotificationCategory::System),
        // An unknown event is exactly what `Custom` means.
        event: NotificationEvent::parse(&event).unwrap_or(NotificationEvent::Custom),
        title_key: r.get(3)?,
        body_key: r.get(4)?,
        params: serde_json::from_str(&params).unwrap_or_default(),
        link: r.get(6)?,
        image_url: r.get(7)?,
        actions: serde_json::from_str(&actions).unwrap_or_default(),
        push_category: push_category.as_deref().and_then(PushCategory::parse),
        read: read_at.is_some(),
        created_at: r.get(11)?,
    })
}

/// Every image a stored notification still points at, so the size-based cache
/// trimmer knows an uploaded image is spoken for and must not evict it.
pub fn referenced_images(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT DISTINCT image_url FROM notifications WHERE image_url IS NOT NULL")?;
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
          push_category, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
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
            n.created_at
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
    let unread = if only_unread { " AND read_at IS NULL" } else { "" };
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

/// Mark some (or, with `None`, all) of a user's notifications read. Scoped to
/// `user_id` so an id guessed from another account is a no-op, not a leak.
/// Returns how many rows changed.
pub fn mark_read(pool: &Pool, user_id: &str, ids: Option<&[String]>, now_ms: i64) -> Result<usize> {
    let conn = pool.get()?;
    let changed = match ids {
        None => conn.execute(
            "UPDATE notifications SET read_at = ?2 WHERE user_id = ?1 AND read_at IS NULL",
            params![user_id, now_ms],
        )?,
        Some([]) => 0,
        Some(ids) => {
            let placeholders = vec!["?"; ids.len()].join(",");
            let sql = format!(
                "UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL \
                 AND id IN ({placeholders})"
            );
            let mut args: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(ids.len() + 2);
            args.push(&now_ms);
            args.push(&user_id);
            for id in ids {
                args.push(id);
            }
            conn.execute(&sql, args.as_slice())?
        }
    };
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

/// Every account, for audience resolution: a household-sized table, scanned and
/// filtered in Rust rather than queried with `LIKE` on the permissions JSON.
/// Returns the full [`User`] since callers need both `permissions` (to filter)
/// and `language` (to render).
pub fn recipients(conn: &Connection) -> rusqlite::Result<Vec<User>> {
    let mut stmt = conn.prepare(
        "SELECT id,email,username,avatar_url,created_at,permissions,language,\
         (pin_hash IS NOT NULL),audio_language,subtitle_language FROM users ORDER BY created_at",
    )?;
    let rows = stmt.query_map([], crate::row_to_user)?;
    rows.collect()
}

/// The users who follow a show: it is in their list, they marked it watched, or
/// they have playback progress on one of its episodes. Drives "a new episode of
/// something you actually watch" without spamming the whole household.
pub fn followers_of_show(conn: &Connection, show_id: &str) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT user_id FROM my_list WHERE item_id = ?1 \
         UNION SELECT user_id FROM watched WHERE item_id = ?1 \
         UNION SELECT p.user_id FROM progress p JOIN items i ON i.id = p.item_id \
         WHERE i.show_id = ?1",
    )?;
    let rows = stmt.query_map(params![show_id], |r| r.get::<_, String>(0))?;
    rows.collect()
}

/// A catalogue entry that appeared since a watermark, for the media digest.
#[derive(Debug, Clone)]
pub struct AddedTitle {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub show_id: Option<String>,
    pub show_title: Option<String>,
    pub season: Option<u32>,
    pub episode: Option<u32>,
    pub added_at: String,
}

/// Everything added to the catalogue strictly after `since` (ISO-8601, compared
/// lexicographically). `limit` bounds a first import or big re-scan from loading
/// the whole catalogue, since the digest only reports a count and a sample title.
pub fn items_added_since(
    conn: &Connection,
    since: &str,
    limit: usize,
) -> rusqlite::Result<Vec<AddedTitle>> {
    let mut stmt = conn.prepare(
        "SELECT id, kind, title, show_id, show_title, season, episode, added_at FROM items \
         WHERE added_at > ?1 ORDER BY added_at DESC LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![since, limit as i64], |r| {
        Ok(AddedTitle {
            id: r.get(0)?,
            kind: r.get(1)?,
            title: r.get(2)?,
            show_id: r.get(3)?,
            show_title: r.get(4)?,
            season: r.get(5)?,
            episode: r.get(6)?,
            added_at: r.get(7)?,
        })
    })?;
    rows.collect()
}

/// The newest `added_at` in the catalogue, for seeding the digest watermark on a
/// first run so an initial import never notifies anyone about 4000 films.
pub fn newest_added_at(conn: &Connection) -> rusqlite::Result<Option<String>> {
    conn.query_row("SELECT MAX(added_at) FROM items", [], |r| r.get(0))
}

/// One user's full preference matrix, defaults filled in.
///
/// A missing row means "on", so this always returns every category and callers
/// never have to know which ones were explicitly set.
pub fn prefs(conn: &Connection, user_id: &str) -> rusqlite::Result<Vec<CategoryPref>> {
    let mut stmt =
        conn.prepare("SELECT category, in_app, push FROM notification_prefs WHERE user_id = ?1")?;
    let rows = stmt.query_map(params![user_id], |r| {
        let category: String = r.get(0)?;
        let in_app: i64 = r.get(1)?;
        let push: i64 = r.get(2)?;
        Ok((category, (in_app != 0, push != 0)))
    })?;
    let set: BTreeMap<String, (bool, bool)> = rows.collect::<rusqlite::Result<_>>()?;
    Ok(NotificationCategory::ALL
        .into_iter()
        .map(|category| {
            let (in_app, push) = set.get(category.as_str()).copied().unwrap_or((true, true));
            CategoryPref { category, in_app, push }
        })
        .collect())
}

/// Whether a category may be delivered to this user, as `(in_app, push)`.
/// Defined in terms of [`prefs`] so the "missing row means on" rule has one home.
pub fn allows(
    conn: &Connection,
    user_id: &str,
    category: NotificationCategory,
) -> rusqlite::Result<(bool, bool)> {
    Ok(prefs(conn, user_id)?
        .into_iter()
        .find(|p| p.category == category)
        .map_or((true, true), |p| (p.in_app, p.push)))
}

/// Replace a user's preference matrix.
pub fn set_prefs(pool: &Pool, user_id: &str, prefs: &[CategoryPref]) -> Result<()> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    for p in prefs {
        tx.execute(
            "INSERT INTO notification_prefs (user_id, category, in_app, push) \
             VALUES (?1, ?2, ?3, ?4) \
             ON CONFLICT(user_id, category) DO UPDATE SET in_app = ?3, push = ?4",
            params![user_id, p.category.as_str(), p.in_app as i64, p.push as i64],
        )?;
    }
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {

    use super::*;
    use crate::testing::TempPool;
    use kroma_domain::{ActionKind, ActionStyle};

    // Real accounts: notifications.user_id FKs users (and cascades).
    fn pool() -> (TempPool, String, String) {
        let p = crate::testing::temp_pool("notif");
        let u1 = crate::create_user(&p, "ana@test.dev", "Ana", "h", &[]).unwrap().id;
        let u2 = crate::create_user(&p, "bo@test.dev", "Bo", "h", &[]).unwrap().id;
        (p, u1, u2)
    }

    fn new(id: &str, created_at: i64) -> StoredNotification {
        StoredNotification {
            id: id.into(),
            category: NotificationEvent::RequestApproved.category(),
            event: NotificationEvent::RequestApproved,
            title_key: "notifications.request.approved.title".into(),
            body_key: "notifications.request.approved.body".into(),
            params: BTreeMap::from([("title".to_string(), ParamValue::Text("Dune".into()))]),
            link: Some("/movie/ab12".into()),
            image_url: Some("https://img/p.jpg".into()),
            actions: vec![ActionSpec {
                id: "view".into(),
                label_key: "notifications.action.view".into(),
                kind: ActionKind::Link,
                href: "/movie/ab12".into(),
                method: None,
                style: ActionStyle::Primary,
            }],
            push_category: Some(PushCategory::MediaAvailable),
            read: false,
            created_at,
        }
    }

    fn insert(p: &Pool, id: &str, user: &str, at: i64) -> u32 {
        let conn = p.get().unwrap();
        insert_notification(&conn, user, &new(id, at)).unwrap()
    }

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
        assert_eq!(n.params.get("title"), Some(&ParamValue::Text("Dune".into())));
        assert_eq!(n.actions.len(), 1);
        assert_eq!(n.actions[0].id, "view");
        assert_eq!(n.actions[0].kind, ActionKind::Link);
        assert_eq!(n.push_category, Some(PushCategory::MediaAvailable));
        // The category column is derived from the event, not passed in.
        assert_eq!(n.category, NotificationCategory::Requests);
        assert!(!n.read);
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
    fn delete_is_scoped_to_the_owner() {
        let (p, u1, u2) = pool();
        insert(&p, "n1", &u1, 1_000);
        assert!(!delete_notification(&p, &u2, "n1").unwrap());
        assert!(delete_notification(&p, &u1, "n1").unwrap());
        let conn = p.get().unwrap();
        assert!(list_notifications(&conn, &u1, 50, false).unwrap().is_empty());
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
    fn prefs_default_to_on_for_every_category() {
        let (p, u1, _) = pool();
        let conn = p.get().unwrap();
        let prefs = prefs(&conn, &u1).unwrap();
        assert_eq!(prefs.len(), NotificationCategory::ALL.len());
        assert!(prefs.iter().all(|p| p.in_app && p.push));
        assert_eq!(allows(&conn, &u1, NotificationCategory::Media).unwrap(), (true, true));
    }

    #[test]
    fn setting_prefs_persists_and_is_read_back_per_category() {
        let (p, u1, u2) = pool();
        set_prefs(
            &p,
            &u1,
            &[CategoryPref {
                category: NotificationCategory::Media,
                in_app: true,
                push: false,
            }],
        )
        .unwrap();
        let conn = p.get().unwrap();
        assert_eq!(allows(&conn, &u1, NotificationCategory::Media).unwrap(), (true, false));
        assert_eq!(allows(&conn, &u1, NotificationCategory::Requests).unwrap(), (true, true));
        assert_eq!(allows(&conn, &u2, NotificationCategory::Media).unwrap(), (true, true));
    }

    #[test]
    fn setting_prefs_twice_updates_in_place() {
        let (p, u1, _) = pool();
        let off = CategoryPref {
            category: NotificationCategory::System,
            in_app: false,
            push: false,
        };
        set_prefs(&p, &u1, &[off]).unwrap();
        set_prefs(
            &p,
            &u1,
            &[CategoryPref {
                category: NotificationCategory::System,
                in_app: true,
                push: false,
            }],
        )
        .unwrap();
        let conn = p.get().unwrap();
        assert_eq!(allows(&conn, &u1, NotificationCategory::System).unwrap(), (true, false));
    }

    #[test]
    fn deleting_a_user_takes_their_notifications_with_them() {
        let (p, u1, _) = pool();
        insert(&p, "n1", &u1, 1_000);
        let conn = p.get().unwrap();
        conn.execute("DELETE FROM users WHERE id = ?1", params![u1]).unwrap();
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

    #[test]
    fn the_digest_queries_report_a_missing_table_rather_than_an_empty_library() {
        let (p, _, _) = pool();
        let conn = p.get().unwrap();
        conn.execute_batch("DROP TABLE my_list; DROP TABLE items").unwrap();

        assert!(followers_of_show(&conn, "s1").is_err());
        assert!(items_added_since(&conn, "2020-01-01", 10).is_err());
    }
}

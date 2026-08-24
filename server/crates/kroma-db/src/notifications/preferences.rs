//! The per-user delivery matrix: which categories reach which channel.

use std::collections::BTreeMap;

use crate::Pool;
use anyhow::Result;
use rusqlite::{params, Connection};

use kroma_domain::{CategoryPref, NotificationCategory};

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
            CategoryPref {
                category,
                in_app,
                push,
            }
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
    use crate::notifications::test_support::*;

    #[test]
    fn prefs_default_to_on_for_every_category() {
        let (p, u1, _) = pool();
        let conn = p.get().unwrap();
        let prefs = prefs(&conn, &u1).unwrap();
        assert_eq!(prefs.len(), NotificationCategory::ALL.len());
        assert!(prefs.iter().all(|p| p.in_app && p.push));
        assert_eq!(
            allows(&conn, &u1, NotificationCategory::Media).unwrap(),
            (true, true)
        );
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
        assert_eq!(
            allows(&conn, &u1, NotificationCategory::Media).unwrap(),
            (true, false)
        );
        assert_eq!(
            allows(&conn, &u1, NotificationCategory::Requests).unwrap(),
            (true, true)
        );
        assert_eq!(
            allows(&conn, &u2, NotificationCategory::Media).unwrap(),
            (true, true)
        );
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
        assert_eq!(
            allows(&conn, &u1, NotificationCategory::System).unwrap(),
            (true, false)
        );
    }
}

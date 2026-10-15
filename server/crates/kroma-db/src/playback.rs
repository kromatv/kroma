//! Per-user playback state: resume positions, and everything derived from them.
//!
//! Re-exported flat here so the public `db::<item>` paths resolve unchanged:
//! [`continue_watching`] turns resume rows into cards, [`watch_state`] holds the
//! watched / my-list flags, [`show_progress`] the percent through a show, and
//! [`up_next`] which episode comes next.

use super::{now_or_blank, params, Pool, Result, Row};
use kroma_domain::ProgressEntry;
use rusqlite::OptionalExtension;

mod continue_watching;
mod on_deck;
mod show_progress;
mod up_next;
mod watch_state;

#[cfg(test)]
mod test_support;

pub use continue_watching::*;
pub use show_progress::*;
pub use up_next::*;
pub use watch_state::*;

pub(crate) const RESUME_FLOOR_MS: i64 = 15_000;

pub(crate) fn finished_sql(played_percent: i64) -> String {
    format!(
        "((p.duration_ms IS NOT NULL AND p.position_ms * 100 >= p.duration_ms * {played_percent}) \
          OR EXISTS (SELECT 1 FROM markers m WHERE m.item_id = p.item_id \
                      AND m.kind = 'credits' AND p.position_ms >= m.start_ms))"
    )
}

pub(crate) fn resumable_sql(played_percent: i64) -> String {
    format!(
        "p.position_ms > {RESUME_FLOOR_MS} AND NOT {}",
        finished_sql(played_percent)
    )
}

/// Save a position and apply the watched rule to it: past the credits marker or
/// `played_percent` of the runtime the item is flagged watched, position kept.
/// The runtime is the one the player reports, else the catalogue's. Returns
/// whether the item counts as watched now.
pub fn save_progress(
    pool: &Pool,
    user_id: &str,
    item_id: &str,
    position_ms: i64,
    duration_ms: Option<i64>,
    played_percent: i64,
) -> Result<bool> {
    upsert_progress(pool, user_id, item_id, position_ms, duration_ms)?;
    let conn = pool.get()?;
    let runtime = match duration_ms.filter(|d| *d > 0) {
        Some(d) => Some(d),
        None => conn
            .query_row(
                "SELECT duration_ms FROM items WHERE id = ?1",
                params![item_id],
                |r| r.get::<_, Option<i64>>(0),
            )
            .optional()?
            .flatten(),
    };
    let credits = crate::markers::credits_start_ms(&conn, item_id)?;
    drop(conn);
    let finished = kroma_domain::finished(position_ms, runtime, credits, played_percent);
    if finished {
        mark_finished(pool, user_id, item_id)?;
    }
    Ok(finished)
}

/// Upsert one item's playback position for a user.
pub fn upsert_progress(
    pool: &Pool,
    user_id: &str,
    item_id: &str,
    position_ms: i64,
    duration_ms: Option<i64>,
) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO progress (user_id,item_id,position_ms,duration_ms,updated_at) \
         VALUES (?1,?2,?3,?4,?5) \
         ON CONFLICT(user_id,item_id) DO UPDATE SET \
            position_ms=excluded.position_ms, duration_ms=excluded.duration_ms, \
            updated_at=excluded.updated_at",
        params![user_id, item_id, position_ms, duration_ms, now_or_blank()],
    )?;
    Ok(())
}

/// One item's saved progress for a user, if any.
pub fn get_progress(pool: &Pool, user_id: &str, item_id: &str) -> Result<Option<ProgressEntry>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT item_id,position_ms,duration_ms,updated_at FROM progress \
         WHERE user_id = ?1 AND item_id = ?2",
    )?;
    let mut rows = stmt.query_map(params![user_id, item_id], row_to_progress)?;
    match rows.next() {
        Some(p) => Ok(Some(p?)),
        None => Ok(None),
    }
}

/// Every saved progress row for a user (newest first).
pub fn list_progress(pool: &Pool, user_id: &str) -> Result<Vec<ProgressEntry>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT item_id,position_ms,duration_ms,updated_at FROM progress \
         WHERE user_id = ?1 ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map(params![user_id], row_to_progress)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Remove a saved position (e.g. finished, or "remove from Continue Watching").
pub fn delete_progress(pool: &Pool, user_id: &str, item_id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "DELETE FROM progress WHERE user_id = ?1 AND item_id = ?2",
        params![user_id, item_id],
    )?;
    Ok(())
}

// Map a row of `item_id,position_ms,duration_ms,updated_at` to a [`ProgressEntry`].
fn row_to_progress(r: &Row) -> rusqlite::Result<ProgressEntry> {
    Ok(ProgressEntry {
        item_id: r.get(0)?,
        position_ms: r.get(1)?,
        duration_ms: r.get(2)?,
        updated_at: r.get(3)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::playback::test_support::*;
    use kroma_domain::MarkerKind;

    #[test]
    fn progress_upsert_get_list_delete() {
        let (pool, uid) = pool_with_user(); // has item m1
        seed_movie(&pool, "m2");
        seed_movie(&pool, "m3");

        // Nothing saved yet.
        assert!(get_progress(&pool, &uid, "m1").unwrap().is_none());
        assert!(list_progress(&pool, &uid).unwrap().is_empty());

        // Insert path.
        upsert_progress(&pool, &uid, "m1", 1000, Some(2000)).unwrap();
        let p = get_progress(&pool, &uid, "m1").unwrap().unwrap();
        assert_eq!(p.item_id, "m1");
        assert_eq!(p.position_ms, 1000);
        assert_eq!(p.duration_ms, Some(2000));

        // ON CONFLICT update path: new position, duration cleared to NULL, still one row.
        upsert_progress(&pool, &uid, "m1", 5000, None).unwrap();
        let p = get_progress(&pool, &uid, "m1").unwrap().unwrap();
        assert_eq!(p.position_ms, 5000);
        assert_eq!(p.duration_ms, None);
        assert_eq!(list_progress(&pool, &uid).unwrap().len(), 1);

        // list_progress is newest (updated_at DESC) first; control timestamps for a
        // deterministic order (RFC3339 text sorts chronologically).
        upsert_progress(&pool, &uid, "m2", 100, Some(1000)).unwrap();
        upsert_progress(&pool, &uid, "m3", 200, Some(1000)).unwrap();
        {
            let conn = pool.get().unwrap();
            for (id, at) in [
                ("m1", "2021-01-01T00:00:00Z"),
                ("m2", "2021-01-03T00:00:00Z"),
                ("m3", "2021-01-02T00:00:00Z"),
            ] {
                conn.execute(
                    "UPDATE progress SET updated_at=?2 WHERE item_id=?1",
                    params![id, at],
                )
                .unwrap();
            }
        }
        let ids: Vec<String> = list_progress(&pool, &uid)
            .unwrap()
            .into_iter()
            .map(|p| p.item_id)
            .collect();
        assert_eq!(
            ids,
            vec!["m2".to_string(), "m3".to_string(), "m1".to_string()]
        );

        // Delete one; deleting a missing id is a harmless no-op.
        delete_progress(&pool, &uid, "m2").unwrap();
        let ids: Vec<String> = list_progress(&pool, &uid)
            .unwrap()
            .into_iter()
            .map(|p| p.item_id)
            .collect();
        assert_eq!(ids, vec!["m3".to_string(), "m1".to_string()]);
        delete_progress(&pool, &uid, "does-not-exist").unwrap();
        assert_eq!(list_progress(&pool, &uid).unwrap().len(), 2);
    }

    #[test]
    fn saving_past_the_threshold_flags_the_item_watched_and_keeps_the_position() {
        let (pool, uid) = pool_with_user();

        assert!(!save_progress(&pool, &uid, "m1", 80_000, Some(100_000), 90).unwrap());
        assert!(list_watched(&pool, &uid).unwrap().is_empty());
        assert!(save_progress(&pool, &uid, "m1", 91_000, Some(100_000), 90).unwrap());

        assert_eq!(list_watched(&pool, &uid).unwrap(), vec!["m1".to_string()]);
        let kept = get_progress(&pool, &uid, "m1").unwrap().unwrap();
        assert_eq!(kept.position_ms, 91_000);
    }

    #[test]
    fn saving_into_the_credits_flags_the_item_watched_below_the_threshold() {
        let (pool, uid) = pool_with_user();
        crate::set_marker(&pool, "m1", MarkerKind::Credits, 70_000, 100_000, "video").unwrap();

        assert!(!save_progress(&pool, &uid, "m1", 69_000, Some(100_000), 90).unwrap());
        assert!(save_progress(&pool, &uid, "m1", 70_000, Some(100_000), 90).unwrap());

        assert_eq!(list_watched(&pool, &uid).unwrap(), vec!["m1".to_string()]);
    }

    #[test]
    fn a_player_that_reports_no_duration_borrows_the_catalogue_runtime() {
        let (pool, uid) = pool_with_user();
        pool.get()
            .unwrap()
            .execute("UPDATE items SET duration_ms = 100000 WHERE id = 'm1'", [])
            .unwrap();
        seed_movie(&pool, "m2");

        assert!(save_progress(&pool, &uid, "m1", 95_000, None, 90).unwrap());
        assert!(!save_progress(&pool, &uid, "m2", 95_000, None, 90).unwrap());
    }

    // Guards the `cast` reserved-keyword quoting in season_meta SQL.
    #[test]
    fn season_cast_round_trips() {
        use kroma_domain::CastMember;
        let (pool, _uid) = pool_with_user();
        {
            let conn = pool.get().unwrap();
            conn.execute(
                "INSERT INTO shows (id,library,title,added_at) VALUES ('s1','lib','Show','t')",
                [],
            )
            .unwrap();
        }
        assert!(crate::seasons_with_cast(&pool, "s1").unwrap().is_empty());
        let cast = vec![CastMember {
            name: "Alice".into(),
            tmdb_id: None,
            character: Some("Lead".into()),
            profile_url: None,
        }];
        crate::set_season_cast(&pool, "s1", 1, &cast).unwrap();
        crate::set_season_cast(&pool, "s1", 1, &cast).unwrap(); // idempotent upsert
        assert!(crate::seasons_with_cast(&pool, "s1").unwrap().contains(&1));
        let casts = crate::season_casts(&pool, "s1").unwrap();
        assert_eq!(casts.get(&1).map(|c| c.len()), Some(1));
        assert_eq!(casts[&1][0].name, "Alice");
    }
}

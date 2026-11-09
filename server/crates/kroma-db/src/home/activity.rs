//! A cheap stamp of everything a viewer's home is computed from that the catalog
//! events do not announce: their own resume points, watched marks and AI rows,
//! the household's plays, and the embeddings.

use anyhow::Result;
use rusqlite::params;

use crate::Pool;

/// Counts plus newest timestamps, so an insert, an update and a delete all move
/// it. Two equal stamps mean the rows behind them are the same.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HomeActivity {
    pub progress: (i64, Option<String>),
    pub watched: (i64, Option<String>),
    pub plays: (i64, Option<i64>),
    pub taste: Option<i64>,
    pub vectors: Option<String>,
}

/// One statement whose every read is an index seek or an index-only count, so
/// it costs a fraction of the home it guards.
pub fn home_activity(pool: &Pool, user_id: &str) -> Result<HomeActivity> {
    let conn = pool.get()?;
    let stamp = conn.query_row(
        "SELECT \
           (SELECT COUNT(*) FROM progress WHERE user_id = ?1), \
           (SELECT MAX(updated_at) FROM progress WHERE user_id = ?1), \
           (SELECT COUNT(*) FROM watched WHERE user_id = ?1), \
           (SELECT MAX(watched_at) FROM watched WHERE user_id = ?1), \
           (SELECT COUNT(*) FROM play_history), \
           (SELECT MAX(ended_at) FROM play_history), \
           (SELECT updated_at FROM user_taste WHERE user_id = ?1), \
           (SELECT MAX(updated_at) FROM item_vectors)",
        params![user_id],
        |r| {
            Ok(HomeActivity {
                progress: (r.get(0)?, r.get(1)?),
                watched: (r.get(2)?, r.get(3)?),
                plays: (r.get(4)?, r.get(5)?),
                taste: r.get(6)?,
                vectors: r.get(7)?,
            })
        },
    )?;
    Ok(stamp)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::home::test_support::{seeded, seeded_user};

    fn play(pool: &Pool, id: &str, user: &str, ended_at: i64) {
        pool.get()
            .unwrap()
            .execute(
                "INSERT INTO play_history (id,user_id,item_id,kind,title,started_at,ended_at) \
                 VALUES (?1,?2,'c1','movie','T',0,?3)",
                params![id, user, ended_at],
            )
            .unwrap();
    }

    #[test]
    fn a_resume_point_saved_again_moves_the_stamp() {
        let pool = seeded();
        let user = seeded_user(&pool);
        crate::upsert_progress(&pool, &user, "c1", 1_000, Some(10_000)).unwrap();
        let before = home_activity(&pool, &user).unwrap();

        crate::upsert_progress(&pool, &user, "c1", 2_000, Some(10_000)).unwrap();

        let after = home_activity(&pool, &user).unwrap();
        assert_ne!(before.progress, after.progress);
    }

    #[test]
    fn a_title_unmarked_watched_moves_the_stamp() {
        let pool = seeded();
        let user = seeded_user(&pool);
        crate::mark_watched(&pool, &user, "c1").unwrap();
        crate::mark_watched(&pool, &user, "c2").unwrap();
        let before = home_activity(&pool, &user).unwrap();

        crate::unmark_watched(&pool, &user, "c1").unwrap();

        assert_ne!(before, home_activity(&pool, &user).unwrap());
    }

    #[test]
    fn another_accounts_play_moves_every_stamp_because_trending_is_shared() {
        let pool = seeded();
        let user = seeded_user(&pool);
        let before = home_activity(&pool, &user).unwrap();

        play(&pool, "p1", "someone-else", 100);

        assert_ne!(before.plays, home_activity(&pool, &user).unwrap().plays);
    }

    #[test]
    fn another_accounts_resume_point_leaves_the_stamp_alone() {
        let pool = seeded();
        let user = seeded_user(&pool);
        let other = crate::create_user(&pool, "o@e.com", "o", "hash", &[])
            .unwrap()
            .id;
        let before = home_activity(&pool, &user).unwrap();

        crate::upsert_progress(&pool, &other, "c1", 1_000, Some(10_000)).unwrap();
        crate::mark_watched(&pool, &other, "c2").unwrap();

        assert_eq!(before, home_activity(&pool, &user).unwrap());
    }

    #[test]
    fn a_re_embedded_title_moves_the_stamp() {
        let pool = seeded();
        let user = seeded_user(&pool);
        let before = home_activity(&pool, &user).unwrap();

        crate::set_item_vector(&pool, "c1", &[1.0, 0.0]).unwrap();

        assert_ne!(before.vectors, home_activity(&pool, &user).unwrap().vectors);
    }

    #[test]
    fn the_rows_written_for_a_viewer_move_their_stamp() {
        let pool = seeded();
        let user = seeded_user(&pool);
        let before = home_activity(&pool, &user).unwrap();

        crate::set_user_taste(&pool, &user, Some("slow cinema"), "[]").unwrap();

        assert_ne!(before.taste, home_activity(&pool, &user).unwrap().taste);
    }
}

use anyhow::Result;
use rusqlite::OptionalExtension;

use crate::Pool;

/// The id of the viewer seen last and the language they chose, `None` while
/// nobody has been seen: whose home is worth building before anyone asks.
pub fn last_viewer(pool: &Pool) -> Result<Option<(String, Option<String>)>> {
    let conn = pool.get()?;
    let viewer = conn
        .query_row(
            "SELECT id, language FROM users WHERE last_seen IS NOT NULL \
             ORDER BY last_seen DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    Ok(viewer)
}

#[cfg(test)]
mod tests {
    use kroma_domain::Permission;

    use super::*;
    use crate::testing::temp_pool;

    fn user(pool: &Pool, name: &str) -> String {
        let email = format!("{name}@example.com");
        crate::create_user(pool, &email, name, "hash", &[Permission::Playback])
            .unwrap()
            .id
    }

    fn seen_at(pool: &Pool, id: &str, at: &str) {
        pool.get()
            .unwrap()
            .execute(
                "UPDATE users SET last_seen = ?2, language = 'de' WHERE id = ?1",
                rusqlite::params![id, at],
            )
            .unwrap();
    }

    #[test]
    fn nobody_seen_yet_is_no_viewer() {
        let pool = temp_pool("last-viewer");
        user(&pool, "never");

        assert_eq!(last_viewer(&pool).unwrap(), None);
    }

    #[test]
    fn the_viewer_seen_last_comes_with_their_language() {
        let pool = temp_pool("last-viewer");
        let earlier = user(&pool, "earlier");
        let later = user(&pool, "later");
        seen_at(&pool, &earlier, "2026-11-26T09:00:00Z");
        seen_at(&pool, &later, "2026-11-26T18:00:00Z");

        let viewer = last_viewer(&pool).unwrap();

        assert_eq!(viewer, Some((later, Some("de".to_string()))));
    }
}

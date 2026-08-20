//! The play log, and the analytics read off it.

use anyhow::Result;
use rusqlite::params;

use crate::rows::parse_kind;
use crate::Pool;

/// Append one finished playback to the history log.
#[allow(clippy::too_many_arguments)]
pub fn record_play(
    pool: &Pool,
    user_id: Option<&str>,
    username: Option<&str>,
    item_id: Option<&str>,
    kind: &str,
    title: &str,
    library: Option<&str>,
    started_at: i64,
    ended_at: i64,
    watched_ms: i64,
) -> Result<()> {
    let conn = pool.get()?;
    let id = kroma_primitives::short_hash(&format!(
        "play|{}|{}|{started_at}|{}",
        user_id.unwrap_or("?"),
        item_id.unwrap_or("?"),
        kroma_primitives::random_token()
    ));
    conn.execute(
        "INSERT INTO play_history \
         (id,user_id,username,item_id,kind,title,library,started_at,ended_at,watched_ms) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![id, user_id, username, item_id, kind, title, library, started_at, ended_at, watched_ms],
    )?;
    Ok(())
}

/// Per-user watch aggregates since `since` (unix-seconds), best watchers first.
pub fn top_users(pool: &Pool, since: i64, limit: usize) -> Result<Vec<kroma_domain::TopUser>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT COALESCE(username,'?') AS u, COUNT(*) AS plays, \
            SUM(watched_ms) AS total, \
            SUM(CASE WHEN kind='movie' THEN watched_ms ELSE 0 END) AS films, \
            SUM(CASE WHEN kind IN ('episode','video') THEN watched_ms ELSE 0 END) AS tv \
         FROM play_history WHERE ended_at >= ?1 \
         GROUP BY username ORDER BY total DESC LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![since, limit as i64], |r| {
        Ok(kroma_domain::TopUser {
            username: r.get(0)?,
            plays: r.get(1)?,
            watched_ms: r.get::<_, Option<i64>>(2)?.unwrap_or(0),
            films_ms: r.get::<_, Option<i64>>(3)?.unwrap_or(0),
            tv_ms: r.get::<_, Option<i64>>(4)?.unwrap_or(0),
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Raw history rows since `since` (unix-seconds) for client/server-side bucketing.
pub fn history_since(pool: &Pool, since: i64) -> Result<Vec<kroma_domain::HistoryRow>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT ended_at,kind,watched_ms FROM play_history WHERE ended_at >= ?1 ORDER BY ended_at",
    )?;
    let rows = stmt.query_map(params![since], |r| {
        Ok(kroma_domain::HistoryRow {
            ended_at: r.get(0)?,
            kind: parse_kind(&r.get::<_, String>(1)?),
            watched_ms: r.get(2)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::admin::test_support::*;

    #[test]
    fn play_history_aggregates() {
        let p = pool();
        record_play(&p, Some("u1"), Some("alice"), Some("m1"), "movie", "Dune", Some("lib"), 0, 100, 60_000).unwrap();
        record_play(&p, Some("u1"), Some("alice"), Some("m2"), "episode", "Ep", Some("lib"), 0, 200, 30_000).unwrap();
        record_play(&p, Some("u2"), Some("bob"), Some("m1"), "movie", "Dune", Some("lib"), 0, 150, 10_000).unwrap();

        let top = top_users(&p, 0, 10).unwrap();
        assert_eq!(top.len(), 2);
        // alice watched 90s total > bob's 10s, so she ranks first.
        assert_eq!(top[0].username, "alice");
        assert_eq!(top[0].plays, 2);
        assert_eq!(top[0].watched_ms, 90_000);
        assert_eq!(top[0].films_ms, 60_000);
        assert_eq!(top[0].tv_ms, 30_000);

        // The `since` gate excludes older rows.
        assert!(top_users(&p, 1000, 10).unwrap().is_empty());
        assert_eq!(history_since(&p, 0).unwrap().len(), 3);
        assert!(history_since(&p, 1000).unwrap().is_empty());
    }
}

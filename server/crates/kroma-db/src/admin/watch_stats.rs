//! The watch aggregates the dashboard panels read off the play log.

use std::collections::HashMap;

use anyhow::Result;
use kroma_domain::{
    HistoryRow, MostWatchedColumn, MostWatchedEntry, TopUser, WatchKind, WatchTotals,
};
use rusqlite::params;

use crate::Pool;

// Enough groups that a per-kind ranking is never starved by another kind's
// long tail, and few enough that one window cannot page the whole catalog in.
const GROUP_SCAN_LIMIT: i64 = 2_000;

/// Per-account watch aggregates since `since` (unix-seconds), most time first.
/// Every account is listed, an account that watched nothing in the window
/// included, and a play logged against an account since deleted keeps the name
/// it had rather than vanishing.
pub fn top_users(pool: &Pool, since: i64, limit: usize) -> Result<Vec<TopUser>> {
    let conn = pool.get()?;
    let mut accounts = conn.prepare("SELECT id,username,avatar_url FROM users")?;
    let mut ranked: Vec<TopUser> = accounts
        .query_map([], |r| {
            Ok(TopUser {
                username: r.get(1)?,
                user_id: Some(r.get(0)?),
                avatar_url: r.get(2)?,
                plays: 0,
                watched_ms: 0,
                films_ms: 0,
                tv_ms: 0,
                by_kind: WatchTotals::default(),
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut seat: HashMap<String, usize> = ranked
        .iter()
        .enumerate()
        .filter_map(|(i, u)| u.user_id.clone().map(|id| (id, i)))
        .collect();

    let mut watched = conn.prepare(
        "SELECT COALESCE(user_id,username,'?'), MAX(user_id), COALESCE(MAX(username),'?'), \
                kind, COUNT(*), SUM(watched_ms) \
         FROM play_history WHERE ended_at >= ?1 GROUP BY 1, kind",
    )?;
    let rows = watched.query_map(params![since], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, Option<String>>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, String>(3)?,
            r.get::<_, i64>(4)?,
            r.get::<_, Option<i64>>(5)?.unwrap_or(0),
        ))
    })?;

    for row in rows {
        let (who, user_id, username, kind, plays, ms) = row?;
        let at = *seat.entry(who).or_insert_with(|| {
            ranked.push(TopUser {
                username,
                user_id,
                avatar_url: None,
                plays: 0,
                watched_ms: 0,
                films_ms: 0,
                tv_ms: 0,
                by_kind: WatchTotals::default(),
            });
            ranked.len() - 1
        });
        let kind = WatchKind::from_media_kind(&kind);
        let user = &mut ranked[at];
        user.plays += plays;
        user.watched_ms += ms;
        user.by_kind.add(kind, ms);
        user.films_ms = user.by_kind.movie;
        user.tv_ms = user.by_kind.tv;
    }

    ranked.sort_by(|a, b| {
        b.watched_ms
            .cmp(&a.watched_ms)
            .then_with(|| a.username.cmp(&b.username))
    });
    ranked.truncate(limit);
    Ok(ranked)
}

/// Raw history rows since `since` (unix-seconds), oldest first.
pub fn history_since(
    pool: &Pool,
    since: i64,
    user: Option<&str>,
    kind: Option<WatchKind>,
) -> Result<Vec<HistoryRow>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT ended_at,kind,watched_ms FROM play_history \
         WHERE ended_at >= ?1 AND (?2 IS NULL OR user_id = ?2) ORDER BY ended_at",
    )?;
    let rows = stmt.query_map(params![since, user], |r| {
        Ok(HistoryRow {
            ended_at: r.get(0)?,
            kind: WatchKind::from_media_kind(&r.get::<_, String>(1)?),
            watched_ms: r.get(2)?,
        })
    })?;
    let rows = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(match kind {
        Some(wanted) => rows.into_iter().filter(|r| r.kind == wanted).collect(),
        None => rows,
    })
}

/// The titles played most since `since` (unix-seconds), `per_kind` of them per
/// column, most plays first. Episodes roll up into the series they belong to,
/// and every kind gets a column even when nobody watched it.
pub fn most_watched(
    pool: &Pool,
    since: i64,
    user: Option<&str>,
    per_kind: usize,
) -> Result<Vec<MostWatchedColumn>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "WITH rolled AS ( \
           SELECT COALESCE('show:' || h.show_title, h.item_id, 'title:' || h.title) AS group_id, \
                  h.item_id AS item_id, i.show_id AS show_id, \
                  COALESCE(s.title, h.show_title, i.title, h.title) AS title, \
                  h.kind AS kind, \
                  COALESCE(s.year, i.year) AS year, \
                  COALESCE(ms.poster_url, json_extract(s.metadata,'$.posterUrl'), \
                           mi.poster_url, json_extract(i.metadata,'$.posterUrl')) AS poster_url, \
                  COALESCE(h.user_id, h.username) AS who \
           FROM play_history h \
           LEFT JOIN items i ON i.id = h.item_id \
           LEFT JOIN shows s ON s.id = i.show_id \
           LEFT JOIN metadata_core ms \
             ON ms.subject_kind = 'show' AND ms.subject_id = i.show_id \
           LEFT JOIN metadata_core mi \
             ON mi.subject_kind = 'item' AND mi.subject_id = h.item_id \
           WHERE h.ended_at >= ?1 AND (?2 IS NULL OR h.user_id = ?2) \
         ) \
         SELECT COALESCE(MAX(show_id), MIN(item_id), group_id), MIN(title), kind, \
                MAX(year), MAX(poster_url), COUNT(*), COUNT(DISTINCT who) \
         FROM rolled GROUP BY group_id, kind \
         ORDER BY 6 DESC, 2 ASC LIMIT ?3",
    )?;
    let rows = stmt.query_map(params![since, user, GROUP_SCAN_LIMIT], |r| {
        Ok(MostWatchedEntry {
            item_id: r.get(0)?,
            title: r.get(1)?,
            kind: WatchKind::from_media_kind(&r.get::<_, String>(2)?),
            year: r.get(3)?,
            poster_url: r.get(4)?,
            plays: r.get(5)?,
            viewers: r.get(6)?,
        })
    })?;

    let mut columns: Vec<MostWatchedColumn> = WatchKind::ALL
        .into_iter()
        .map(|kind| MostWatchedColumn {
            kind,
            entries: Vec::new(),
        })
        .collect();
    for row in rows {
        let entry = row?;
        if let Some(column) = columns.iter_mut().find(|c| c.kind == entry.kind) {
            if column.entries.len() < per_kind {
                column.entries.push(entry);
            }
        }
    }
    Ok(columns)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::admin::play_history::record_play;
    use crate::admin::test_support::*;
    use kroma_domain::PlayRecord;

    fn watched(pool: &Pool, user: &str, username: &str, item: &str, kind: &str, ms: i64) {
        record_play(
            pool,
            &PlayRecord {
                item_id: Some(item.into()),
                ..play(user, username, item, kind, ms)
            },
        )
        .unwrap();
    }

    fn episode_of(pool: &Pool, user: &str, username: &str, item: &str, show_title: &str) {
        record_play(
            pool,
            &PlayRecord {
                item_id: Some(item.into()),
                show_title: Some(show_title.into()),
                ..play(user, username, item, "episode", 1_000)
            },
        )
        .unwrap();
    }

    fn column(columns: &[MostWatchedColumn], kind: WatchKind) -> &MostWatchedColumn {
        columns.iter().find(|c| c.kind == kind).unwrap()
    }

    fn seed_poster(pool: &Pool, subject_kind: &str, subject_id: &str, url: &str) {
        pool.get()
            .unwrap()
            .execute(
                "INSERT INTO metadata_core (subject_kind,subject_id,poster_url,updated_at) \
                 VALUES (?1,?2,?3,0)",
                rusqlite::params![subject_kind, subject_id, url],
            )
            .unwrap();
    }

    #[test]
    fn the_panel_ranks_accounts_by_time_watched() {
        let p = pool();
        seed_user(&p, "u1", "alice", Some("/avatars/alice.webp"));
        seed_user(&p, "u2", "bob", None);
        watched(&p, "u1", "alice", "dune", "movie", 60_000);
        watched(&p, "u1", "alice", "ep1", "episode", 30_000);
        watched(&p, "u2", "bob", "dune", "movie", 10_000);

        let top = top_users(&p, 0, 10).unwrap();

        assert_eq!(top.len(), 2);
        assert_eq!(top[0].username, "alice");
        assert_eq!(top[0].user_id.as_deref(), Some("u1"));
        assert_eq!(top[0].avatar_url.as_deref(), Some("/avatars/alice.webp"));
        assert_eq!(top[0].plays, 2);
        assert_eq!(top[0].watched_ms, 90_000);
        assert_eq!(top[0].films_ms, 60_000);
        assert_eq!(top[0].tv_ms, 30_000);
        assert!(top_users(&p, 1_000, 10)
            .unwrap()
            .iter()
            .all(|u| u.plays == 0));
    }

    #[test]
    fn a_card_carries_every_kind_including_the_ones_at_zero() {
        let p = pool();
        seed_user(&p, "u1", "alice", None);
        watched(&p, "u1", "alice", "clip", "video", 5_000);

        let top = top_users(&p, 0, 10).unwrap();

        assert_eq!(
            top[0].by_kind,
            WatchTotals {
                movie: 0,
                tv: 5_000
            }
        );
        assert_eq!(top[0].by_kind.get(WatchKind::Tv), 5_000);
    }

    #[test]
    fn an_account_that_watched_nothing_still_appears_with_zeroes() {
        let p = pool();
        seed_user(&p, "u1", "alice", None);
        seed_user(&p, "u2", "bob", None);
        watched(&p, "u1", "alice", "dune", "movie", 60_000);

        let top = top_users(&p, 0, 10).unwrap();

        let bob = top.iter().find(|u| u.username == "bob").unwrap();
        assert_eq!(bob.plays, 0);
        assert_eq!(bob.watched_ms, 0);
        assert_eq!(bob.by_kind, WatchTotals::default());
    }

    #[test]
    fn a_play_by_an_account_since_deleted_keeps_the_name_it_had() {
        let p = pool();
        watched(&p, "gone", "ghost", "dune", "movie", 42_000);

        let top = top_users(&p, 0, 10).unwrap();

        assert_eq!(top.len(), 1);
        assert_eq!(top[0].username, "ghost");
        assert_eq!(top[0].watched_ms, 42_000);
        assert!(top[0].avatar_url.is_none());
    }

    #[test]
    fn the_chart_reads_one_account_or_one_kind_at_a_time() {
        let p = pool();
        watched(&p, "u1", "alice", "dune", "movie", 60_000);
        watched(&p, "u1", "alice", "ep1", "episode", 30_000);
        watched(&p, "u2", "bob", "arrival", "movie", 10_000);

        let everyone = history_since(&p, 0, None, None).unwrap();

        assert_eq!(everyone.len(), 3);
        assert_eq!(history_since(&p, 0, Some("u1"), None).unwrap().len(), 2);
        assert_eq!(
            history_since(&p, 0, None, Some(WatchKind::Tv))
                .unwrap()
                .iter()
                .map(|r| r.watched_ms)
                .collect::<Vec<_>>(),
            [30_000]
        );
        assert_eq!(
            history_since(&p, 0, None, Some(WatchKind::Movie))
                .unwrap()
                .len(),
            2
        );
        assert!(history_since(&p, 1_000, None, None).unwrap().is_empty());
    }

    #[test]
    fn a_series_is_one_entry_rather_than_one_per_episode() {
        let p = pool();
        seed_show(&p, "sev", "lib-tv", "Severance", 2022);
        seed_episode(&p, "ep1", "sev", "lib-tv", "Good News About Hell");
        seed_episode(&p, "ep2", "sev", "lib-tv", "Half Loop");
        seed_movie(&p, "dune", "lib-films", "Dune", 2021);
        episode_of(&p, "u1", "alice", "ep1", "Severance");
        episode_of(&p, "u1", "alice", "ep2", "Severance");
        episode_of(&p, "u2", "bob", "ep2", "Severance");
        watched(&p, "u1", "alice", "dune", "movie", 1_000);

        let columns = most_watched(&p, 0, None, 10).unwrap();

        let tv = &column(&columns, WatchKind::Tv).entries;
        assert_eq!(tv.len(), 1);
        assert_eq!(tv[0].title, "Severance");
        assert_eq!(tv[0].item_id, "sev");
        assert_eq!(tv[0].year, Some(2022));
        assert_eq!(tv[0].plays, 3);
        let films = &column(&columns, WatchKind::Movie).entries;
        assert_eq!(films[0].item_id, "dune");
        assert_eq!(films[0].year, Some(2021));
    }

    #[test]
    fn two_sessions_by_one_account_are_two_plays_and_one_viewer() {
        let p = pool();
        seed_movie(&p, "dune", "lib-films", "Dune", 2021);
        watched(&p, "u1", "alice", "dune", "movie", 1_000);
        watched(&p, "u1", "alice", "dune", "movie", 2_000);
        watched(&p, "u2", "bob", "dune", "movie", 3_000);

        let columns = most_watched(&p, 0, None, 10).unwrap();

        let films = &column(&columns, WatchKind::Movie).entries;
        assert_eq!(films[0].plays, 3);
        assert_eq!(films[0].viewers, 2);
    }

    #[test]
    fn a_kind_nobody_watched_keeps_its_column() {
        let p = pool();
        watched(&p, "u1", "alice", "dune", "movie", 1_000);

        let columns = most_watched(&p, 0, None, 10).unwrap();

        assert_eq!(
            columns.iter().map(|c| c.kind).collect::<Vec<_>>(),
            WatchKind::ALL
        );
        assert!(column(&columns, WatchKind::Tv).entries.is_empty());
    }

    #[test]
    fn the_panel_reads_one_account_at_a_time() {
        let p = pool();
        seed_movie(&p, "dune", "lib-films", "Dune", 2021);
        seed_movie(&p, "arrival", "lib-films", "Arrival", 2016);
        watched(&p, "u1", "alice", "dune", "movie", 1_000);
        watched(&p, "u2", "bob", "arrival", "movie", 1_000);

        let columns = most_watched(&p, 0, Some("u1"), 10).unwrap();

        let films = &column(&columns, WatchKind::Movie).entries;
        assert_eq!(films.len(), 1);
        assert_eq!(films[0].item_id, "dune");
        assert_eq!(films[0].title, "Dune");
    }

    #[test]
    fn a_column_stops_at_the_length_the_panel_asked_for() {
        let p = pool();
        for title in ["a", "b", "c"] {
            seed_movie(&p, title, "lib-films", title, 2020);
            watched(&p, "u1", "alice", title, "movie", 1_000);
        }

        let columns = most_watched(&p, 0, None, 2).unwrap();

        assert_eq!(column(&columns, WatchKind::Movie).entries.len(), 2);
    }

    #[test]
    fn an_entry_carries_the_artwork_the_catalogue_holds_for_it() {
        let p = pool();
        seed_movie(&p, "dune", "lib-films", "Dune", 2021);
        seed_poster(&p, "item", "dune", "/api/images/dune.webp");
        watched(&p, "u1", "alice", "dune", "movie", 1_000);

        let columns = most_watched(&p, 0, None, 10).unwrap();

        assert_eq!(
            column(&columns, WatchKind::Movie).entries[0]
                .poster_url
                .as_deref(),
            Some("/api/images/dune.webp")
        );
    }

    #[test]
    fn a_series_carries_the_shows_artwork_rather_than_an_episodes() {
        let p = pool();
        seed_show(&p, "sev", "lib-tv", "Severance", 2022);
        seed_episode(&p, "ep1", "sev", "lib-tv", "Good News About Hell");
        seed_poster(&p, "show", "sev", "/api/images/severance.webp");
        seed_poster(&p, "item", "ep1", "/api/images/episode.webp");
        episode_of(&p, "u1", "alice", "ep1", "Severance");

        let columns = most_watched(&p, 0, None, 10).unwrap();

        assert_eq!(
            column(&columns, WatchKind::Tv).entries[0]
                .poster_url
                .as_deref(),
            Some("/api/images/severance.webp")
        );
    }

    #[test]
    fn a_title_the_catalogue_has_no_art_for_carries_no_poster() {
        let p = pool();
        seed_movie(&p, "dune", "lib-films", "Dune", 2021);
        watched(&p, "u1", "alice", "dune", "movie", 1_000);

        let columns = most_watched(&p, 0, None, 10).unwrap();

        assert!(column(&columns, WatchKind::Movie).entries[0]
            .poster_url
            .is_none());
    }
}

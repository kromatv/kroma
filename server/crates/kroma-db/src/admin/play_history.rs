//! The play log: appending a finished session, and reading it back.

use anyhow::Result;
use kroma_domain::{HistoryLibrary, PlayEntry, PlayRecord};
use rusqlite::{params, Row};

use super::play_sort::PlaySort;
use crate::Pool;

/// Append one finished playback to the history log.
pub fn record_play(pool: &Pool, play: &PlayRecord) -> Result<()> {
    let conn = pool.get()?;
    let id = kroma_primitives::short_hash(&format!(
        "play|{}|{}|{}|{}",
        play.user_id.as_deref().unwrap_or("?"),
        play.item_id.as_deref().unwrap_or("?"),
        play.started_at,
        kroma_primitives::random_token()
    ));
    conn.execute(
        "INSERT INTO play_history \
         (id,user_id,username,item_id,kind,title,library,started_at,ended_at,watched_ms,\
          device,player,mode,network,video_label,audio_label,show_title,season,episode) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)",
        params![
            id,
            play.user_id,
            play.username,
            play.item_id,
            play.kind,
            play.title,
            play.library,
            play.started_at,
            play.ended_at,
            play.watched_ms,
            play.device,
            play.player,
            play.mode,
            play.network,
            play.video_label,
            play.audio_label,
            play.show_title,
            play.season,
            play.episode,
        ],
    )?;
    Ok(())
}

/// `item_or_show` matches one item, or every episode of one show when a show id
/// is given.
#[derive(Debug, Clone, Default)]
pub struct PlayFilter {
    pub since: i64,
    pub user: Option<String>,
    pub library: Option<String>,
    pub item_or_show: Option<String>,
    pub sort: PlaySort,
}

const COLUMNS: &str = "h.id,h.user_id,COALESCE(h.username,'?'),h.item_id,h.kind,h.title,\
                       h.show_title,h.season,h.episode,h.device,h.player,h.mode,h.network,\
                       h.video_label,h.audio_label,COALESCE(h.library,i.library),\
                       h.started_at,h.ended_at,h.watched_ms,i.show_id,i.id IS NOT NULL";

const SCOPE: &str = "FROM play_history h LEFT JOIN items i ON i.id = h.item_id \
                     WHERE h.ended_at >= ?1 \
                     AND (?2 IS NULL OR h.user_id = ?2) \
                     AND (?3 IS NULL OR COALESCE(h.library,i.library) = ?3) \
                     AND (?4 IS NULL OR h.item_id = ?4 \
                          OR h.item_id IN (SELECT id FROM items WHERE show_id = ?4))";

pub fn plays(
    pool: &Pool,
    filter: &PlayFilter,
    limit: usize,
    offset: usize,
) -> Result<Vec<PlayEntry>> {
    let conn = pool.get()?;
    let order = filter.sort.clause();
    let sql = format!("SELECT {COLUMNS} {SCOPE} ORDER BY {order} LIMIT ?5 OFFSET ?6");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        params![
            filter.since,
            filter.user,
            filter.library,
            filter.item_or_show,
            limit as i64,
            offset as i64
        ],
        entry,
    )?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// How many rows [`plays`] would page through.
pub fn plays_count(pool: &Pool, filter: &PlayFilter) -> Result<i64> {
    let conn = pool.get()?;
    let sql = format!("SELECT COUNT(*) {SCOPE}");
    Ok(conn.query_row(
        &sql,
        params![
            filter.since,
            filter.user,
            filter.library,
            filter.item_or_show
        ],
        |r| r.get(0),
    )?)
}

/// The libraries the watch log references, named. A library with no history is
/// left out; one deleted since keeps its id as its name.
pub fn history_libraries(pool: &Pool) -> Result<Vec<HistoryLibrary>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT h.lib, COALESCE(l.name, h.lib) AS name FROM \
           (SELECT DISTINCT COALESCE(p.library, i.library) AS lib FROM play_history p \
            LEFT JOIN items i ON i.id = p.item_id) h \
         LEFT JOIN libraries l ON l.id = h.lib \
         WHERE h.lib IS NOT NULL ORDER BY name",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(HistoryLibrary {
            id: r.get(0)?,
            name: r.get(1)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn entry(r: &Row<'_>) -> rusqlite::Result<PlayEntry> {
    Ok(PlayEntry {
        id: r.get(0)?,
        user_id: r.get(1)?,
        username: r.get(2)?,
        item_id: r.get(3)?,
        kind: r.get(4)?,
        title: r.get(5)?,
        show_title: r.get(6)?,
        season: r.get(7)?,
        episode: r.get(8)?,
        device: r.get(9)?,
        player: r.get(10)?,
        mode: r.get(11)?,
        network: r.get(12)?,
        video_label: r.get(13)?,
        audio_label: r.get(14)?,
        library: r.get(15)?,
        started_at: r.get(16)?,
        ended_at: r.get(17)?,
        watched_ms: r.get(18)?,
        show_id: r.get(19)?,
        in_catalog: r.get(20)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::admin::test_support::*;

    fn since(at: i64) -> PlayFilter {
        PlayFilter {
            since: at,
            ..PlayFilter::default()
        }
    }

    #[test]
    fn the_log_keeps_the_device_and_the_treatment_the_stream_got() {
        let p = pool();

        record_play(
            &p,
            &PlayRecord {
                device: Some("Chrome · Windows".into()),
                player: Some("web".into()),
                mode: Some("transcode".into()),
                network: Some("WAN".into()),
                video_label: Some("1080p · H.265".into()),
                audio_label: Some("Surround · 5.1 · DTS".into()),
                show_title: Some("Severance".into()),
                season: Some(2),
                episode: Some(4),
                library: Some("lib-tv".into()),
                ..play("u1", "alice", "Chikhai Bardo", "episode", 42_000)
            },
        )
        .unwrap();

        let row = &plays(&p, &since(0), 50, 0).unwrap()[0];

        assert_eq!(row.device.as_deref(), Some("Chrome · Windows"));
        assert_eq!(row.mode.as_deref(), Some("transcode"));
        assert_eq!(row.network.as_deref(), Some("WAN"));
        assert_eq!(row.show_title.as_deref(), Some("Severance"));
        assert_eq!(row.library.as_deref(), Some("lib-tv"));
        assert_eq!((row.season, row.episode), (Some(2), Some(4)));
        assert_eq!(row.watched_ms, 42_000);
    }

    #[test]
    fn the_log_reads_newest_first_and_pages() {
        let p = pool();
        for (title, ended) in [("first", 100), ("second", 200), ("third", 300)] {
            record_play(
                &p,
                &PlayRecord {
                    ended_at: ended,
                    ..play("u1", "alice", title, "movie", 1)
                },
            )
            .unwrap();
        }

        let page = plays(&p, &since(0), 2, 0).unwrap();

        assert_eq!(
            page.iter().map(|r| r.title.as_str()).collect::<Vec<_>>(),
            ["third", "second"]
        );
        assert_eq!(plays(&p, &since(0), 2, 2).unwrap()[0].title, "first");
        assert_eq!(plays_count(&p, &since(0)).unwrap(), 3);
        assert_eq!(plays_count(&p, &since(1000)).unwrap(), 0);
    }

    #[test]
    fn one_members_log_holds_only_their_own_plays() {
        let p = pool();
        record_play(&p, &play("u1", "alice", "Dune", "movie", 1)).unwrap();
        record_play(&p, &play("u2", "bob", "Arrival", "movie", 1)).unwrap();
        let mine = PlayFilter {
            user: Some("u1".into()),
            ..PlayFilter::default()
        };

        let alice = plays(&p, &mine, 50, 0).unwrap();

        assert_eq!(alice.len(), 1);
        assert_eq!(alice[0].title, "Dune");
        assert_eq!(plays_count(&p, &mine).unwrap(), 1);
    }

    #[test]
    fn a_show_id_matches_every_episode_of_that_show() {
        let p = pool();
        seed_show(&p, "sev", "lib-tv", "Severance", 2022);
        seed_episode(&p, "ep1", "sev", "lib-tv", "Good News About Hell");
        seed_episode(&p, "ep2", "sev", "lib-tv", "Half Loop");
        seed_movie(&p, "dune", "lib-films", "Dune", 2021);
        for item in ["ep1", "ep2", "dune"] {
            record_play(
                &p,
                &PlayRecord {
                    item_id: Some(item.into()),
                    ..play("u1", "alice", item, "episode", 1)
                },
            )
            .unwrap();
        }
        let show = PlayFilter {
            item_or_show: Some("sev".into()),
            ..PlayFilter::default()
        };

        let episodes = plays(&p, &show, 50, 0).unwrap();

        assert_eq!(episodes.len(), 2);
        assert_eq!(plays_count(&p, &show).unwrap(), 2);
        assert_eq!(
            plays_count(
                &p,
                &PlayFilter {
                    item_or_show: Some("ep1".into()),
                    ..PlayFilter::default()
                }
            )
            .unwrap(),
            1
        );
    }

    #[test]
    fn a_row_logged_before_the_library_was_recorded_still_answers_the_filter() {
        let p = pool();
        seed_movie(&p, "dune", "lib-films", "Dune", 2021);
        seed_library(&p, "lib-tv", "Séries");
        record_play(
            &p,
            &PlayRecord {
                item_id: Some("dune".into()),
                library: None,
                ..play("u1", "alice", "Dune", "movie", 1)
            },
        )
        .unwrap();
        let films = PlayFilter {
            library: Some("lib-films".into()),
            ..PlayFilter::default()
        };

        let rows = plays(&p, &films, 50, 0).unwrap();

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].library.as_deref(), Some("lib-films"));
        assert_eq!(
            plays_count(
                &p,
                &PlayFilter {
                    library: Some("lib-tv".into()),
                    ..PlayFilter::default()
                }
            )
            .unwrap(),
            0
        );
    }

    #[test]
    fn the_library_filter_lists_only_libraries_the_log_names() {
        let p = pool();
        seed_library(&p, "lib-films", "Films");
        seed_library(&p, "lib-empty", "Jamais lue");
        seed_movie(&p, "dune", "lib-films", "Dune", 2021);
        record_play(
            &p,
            &PlayRecord {
                item_id: Some("dune".into()),
                ..play("u1", "alice", "Dune", "movie", 1)
            },
        )
        .unwrap();

        let libraries = history_libraries(&p).unwrap();

        assert_eq!(libraries.len(), 1);
        assert_eq!(libraries[0].id, "lib-films");
        assert_eq!(libraries[0].name, "Films");
    }

    #[test]
    fn the_table_orders_by_the_column_the_reader_picked() {
        let p = pool();
        for (title, watched) in [("Arrival", 30_000), ("Dune", 10_000), ("Sicario", 20_000)] {
            record_play(&p, &play("u1", "alice", title, "movie", watched)).unwrap();
        }
        let by_length = PlayFilter {
            sort: PlaySort::parse("watchedMs:asc").unwrap(),
            ..PlayFilter::default()
        };

        let rows = plays(&p, &by_length, 50, 0).unwrap();

        assert_eq!(
            rows.iter().map(|r| r.title.as_str()).collect::<Vec<_>>(),
            ["Dune", "Sicario", "Arrival"]
        );
    }
}

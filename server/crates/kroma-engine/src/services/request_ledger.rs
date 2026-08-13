//! The requested title as TMDB describes it, joined with the request's own
//! ledger and the library. Wider than [`crate::services::requests`]'s wanted
//! rows on purpose: an admin has to see the seasons and episodes the request
//! left out to decide whether to go and get them, and has to see what the
//! library already holds of each one to decide whether it is worth replacing.
//!
//! Synchronous and does network/DB work: call it from a blocking context.

use std::collections::HashMap;

use anyhow::{anyhow, Result};

use kroma_module_host::HostCtx;

use crate::db;
use crate::infra::metadata::{self, discover};
use crate::model::{
    LedgerEpisode, LedgerSeason, MediaRequest, RequestCoverage, RequestKind, RequestLedgerView,
    SeasonLedgerView, VideoStream,
};
use crate::services::requests::today_ymd;

type OnDisk = HashMap<(u32, u32), db::EpisodeOnDisk>;

/// The request's seasons, tallied against the ledger and the library. Costs one
/// TMDB detail call; the per-episode rows are fetched a season at a time by
/// [`season_ledger`].
pub fn ledger<S: HostCtx>(state: &S, request_id: &str) -> Result<RequestLedgerView> {
    let req = load_request(state, request_id)?;
    let detail = fetch_detail(state, &req)?;
    let conn = state.db().get()?;
    let wanted = db::wanted_for_request(&conn, &req.id)?;
    let present = on_disk(&conn, &req)?;
    let local_id = match req.kind {
        RequestKind::Movie => db::movie_item_by_tmdb(&conn, req.tmdb_id)?,
        RequestKind::Show => db::show_by_tmdb(&conn, req.tmdb_id)?,
    };
    drop(conn);

    let seasons = detail
        .seasons
        .iter()
        .map(|s| LedgerSeason {
            season: s.season,
            name: s.name.clone(),
            air_date: s.air_date.clone(),
            episode_count: s.episode_count,
            requested: wanted.iter().filter(|w| w.season == Some(s.season)).count() as u32,
            on_disk: present.keys().filter(|(season, _)| *season == s.season).count() as u32,
        })
        .collect();

    Ok(RequestLedgerView {
        kind: req.kind,
        tmdb_id: req.tmdb_id,
        title: req.title.clone(),
        year: req.year,
        today: today_ymd(),
        coverage: RequestCoverage {
            seasons: req.seasons.clone(),
            episodes: req.episodes.clone(),
        },
        poster_url: detail.poster_url.clone(),
        backdrop_url: detail.backdrop_url.clone(),
        overview: detail.overview.clone(),
        seasons,
        on_disk: req.kind == RequestKind::Movie && local_id.is_some(),
        local_id,
        air_date: detail.available_date.clone(),
    })
}

/// One season's episodes, from TMDB, flagged with what the request covers and
/// what the library holds.
pub fn season_ledger<S: HostCtx>(
    state: &S,
    request_id: &str,
    season: u32,
) -> Result<SeasonLedgerView> {
    let req = load_request(state, request_id)?;
    if req.kind != RequestKind::Show {
        return Ok(SeasonLedgerView { season, episodes: Vec::new() });
    }
    let conn = state.db().get()?;
    let wanted = db::wanted_for_request(&conn, &req.id)?;
    let present = on_disk(&conn, &req)?;
    drop(conn);

    let episodes = season_episodes(state, req.tmdb_id, season)?
        .into_iter()
        .map(|ep| {
            let row = wanted
                .iter()
                .find(|w| w.season == Some(season) && w.episode == Some(ep.episode));
            let file = present.get(&(season, ep.episode));
            LedgerEpisode {
                season,
                episode: ep.episode,
                name: ep.name,
                overview: ep.overview,
                air_date: ep.air_date,
                still_url: ep.still_url,
                rating: ep.rating,
                on_disk: file.is_some(),
                wanted_id: row.map(|w| w.id.clone()),
                wanted_status: row.map(|w| w.status.clone()),
                item_id: file.map(|f| f.item_id.clone()),
                video: file.and_then(video_of),
                duration_ms: file.and_then(|f| f.duration_ms),
            }
        })
        .collect();
    Ok(SeasonLedgerView { season, episodes })
}

/// The wanted rows a season WOULD get, for a season the request does not cover.
/// Persists nothing: it exists so an interactive search can be aimed at a season
/// outside the request, which is most of what an admin looks for.
pub fn preview_season_rows<S: HostCtx>(
    state: &S,
    req: &MediaRequest,
    season: u32,
) -> Result<Vec<db::WantedRow>> {
    if req.kind != RequestKind::Show {
        return Ok(Vec::new());
    }
    let detail = fetch_detail(state, req)?;
    Ok(season_episodes(state, req.tmdb_id, season)?
        .into_iter()
        .map(|ep| db::WantedRow {
            id: format!("preview|{}|s{season:02}e{:03}", req.id, ep.episode),
            request_id: req.id.clone(),
            kind: "episode".into(),
            tmdb_id: req.tmdb_id,
            imdb_id: detail.imdb_id.clone(),
            title: req.title.clone(),
            year: req.year,
            season: Some(season),
            episode: Some(ep.episode),
            air_date: ep.air_date,
            status: "wanted".into(),
            last_search_at: None,
        })
        .collect())
}

fn video_of(file: &db::EpisodeOnDisk) -> Option<VideoStream> {
    file.codec.as_ref().map(|codec| VideoStream {
        codec: codec.clone(),
        width: file.width,
        height: file.height,
        hdr: file.hdr,
        bit_depth: file.bit_depth,
    })
}

fn load_request<S: HostCtx>(state: &S, request_id: &str) -> Result<MediaRequest> {
    let conn = state.db().get()?;
    db::get_request(&conn, request_id)?.ok_or_else(|| anyhow!("request not found"))
}

fn fetch_detail<S: HostCtx>(state: &S, req: &MediaRequest) -> Result<discover::DiscoverRawDetail> {
    let key = tmdb_key(state)?;
    discover::detail(&key, &state.metadata_language(), req.kind, req.tmdb_id)
        .map_err(|()| anyhow!("TMDB lookup failed"))?
        .ok_or_else(|| anyhow!("title not found on TMDB"))
}

fn season_episodes<S: HostCtx>(
    state: &S,
    tmdb_id: u64,
    season: u32,
) -> Result<Vec<metadata::EpisodeArt>> {
    let key = tmdb_key(state)?;
    Ok(metadata::season_episodes(&key, &state.metadata_language(), tmdb_id, season).episodes)
}

fn tmdb_key<S: HostCtx>(state: &S) -> Result<String> {
    state.tmdb_api_key().ok_or_else(|| anyhow!("TMDB is not configured"))
}

fn on_disk(conn: &db::PooledConn, req: &MediaRequest) -> Result<OnDisk> {
    if req.kind != RequestKind::Show {
        return Ok(OnDisk::new());
    }
    let Some(show_id) = db::show_by_tmdb(conn, req.tmdb_id)? else {
        return Ok(OnDisk::new());
    };
    Ok(db::episodes_on_disk(conn, &show_id)?
        .into_iter()
        .map(|row| ((row.season, row.episode), row))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::RequestStatus;
    use crate::test_support::FakeTmdb;
    use kroma_module_host::testing::StubHost;

    fn host(key: Option<&str>) -> StubHost {
        let host = StubHost::with_db("ledger").with_metadata_language("en-US");
        match key {
            Some(k) => host.with_tmdb_key(k),
            None => host,
        }
    }

    fn exec(host: &StubHost, sql: &str) {
        host.db().get().unwrap().execute(sql, []).unwrap();
    }

    fn seed_show(host: &StubHost, show_id: &str, tmdb: u64, present: &[(u32, u32)]) {
        exec(host, "INSERT OR IGNORE INTO libraries (id,name,kind,path,added_at) VALUES ('lib1','L','mixed','/x','now')");
        exec(host, &format!("INSERT INTO shows (id,library,title,added_at) VALUES ('{show_id}','lib1','Show','now')"));
        exec(host, &format!("INSERT INTO metadata_core (subject_kind,subject_id,tmdb_id,updated_at) VALUES ('show','{show_id}',{tmdb},0)"));
        for (s, e) in present {
            exec(host, &format!(
                "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,v_codec,v_width,v_height,duration_ms,added_at) \
                 VALUES ('{show_id}-s{s}e{e}','episode','E','mkv','lib1','{show_id}',{s},{e},'hevc',3840,2160,1200000,'now')"
            ));
        }
    }

    fn seed_request(host: &StubHost, id: &str, kind: RequestKind, tmdb: u64, seasons: Option<Vec<u32>>) {
        db::insert_request(
            host.db(),
            &db::NewRequest {
                id: id.into(),
                kind,
                tmdb_id: tmdb,
                title: "Show".into(),
                year: Some(2020),
                poster_url: None,
                seasons,
                episodes: None,
                status: RequestStatus::Approved,
                requested_by: None,
            },
            0,
        )
        .unwrap();
    }

    fn wanted(host: &StubHost, request_id: &str, eps: &[(u32, u32, &str)]) {
        let rows: Vec<db::WantedRow> = eps
            .iter()
            .map(|(s, e, status)| db::WantedRow {
                id: format!("w-{s}-{e}"),
                request_id: request_id.into(),
                kind: "episode".into(),
                tmdb_id: 1,
                imdb_id: None,
                title: "Show".into(),
                year: None,
                season: Some(*s),
                episode: Some(*e),
                air_date: None,
                status: (*status).into(),
                last_search_at: None,
            })
            .collect();
        db::replace_wanted(host.db(), request_id, &rows, 0).unwrap();
    }

    fn show_json(seasons: &[(u32, u32)]) -> serde_json::Value {
        serde_json::json!({
            "name": "Show",
            "first_air_date": "2020-01-01",
            "seasons": seasons
                .iter()
                .map(|(n, count)| serde_json::json!({ "season_number": n, "episode_count": count }))
                .collect::<Vec<_>>(),
        })
    }

    fn episodes_json(eps: &[u32]) -> serde_json::Value {
        serde_json::json!({
            "episodes": eps
                .iter()
                .map(|n| serde_json::json!({
                    "episode_number": n,
                    "name": format!("E{n}"),
                    "air_date": "2020-02-01",
                }))
                .collect::<Vec<_>>(),
        })
    }

    #[test]
    fn a_ledger_needs_tmdb_to_describe_anything() {
        let host = host(None);
        seed_request(&host, "r1", RequestKind::Show, 42, None);
        let err = ledger(&host, "r1").unwrap_err();
        assert!(err.to_string().contains("TMDB is not configured"), "{err}");
    }

    #[test]
    fn an_unknown_request_is_an_error_not_an_empty_ledger() {
        let host = host(Some("k"));
        assert!(ledger(&host, "nope").unwrap_err().to_string().contains("request not found"));
    }

    #[test]
    fn a_season_is_tallied_against_the_request_and_the_library() {
        let host = host(Some("k"));
        seed_show(&host, "show1", 42, &[(1, 1), (1, 2)]);
        seed_request(&host, "r1", RequestKind::Show, 42, Some(vec![1]));
        wanted(&host, "r1", &[(1, 1, "available"), (1, 2, "available"), (1, 3, "wanted")]);
        let _tmdb = FakeTmdb::start(|path| match path {
            "/tv/42" => (200, show_json(&[(1, 3), (2, 8)])),
            _ => (404, serde_json::json!({})),
        });

        let view = ledger(&host, "r1").unwrap();
        let s1 = view.seasons.iter().find(|s| s.season == 1).expect("season 1");
        assert_eq!(s1.episode_count, 3, "what TMDB says the season holds");
        assert_eq!(s1.requested, 3, "the request covers three of them");
        assert_eq!(s1.on_disk, 2, "the library holds two");

        let s2 = view.seasons.iter().find(|s| s.season == 2).expect("season 2");
        assert_eq!((s2.requested, s2.on_disk), (0, 0), "a season outside the request still shows");

        assert_eq!(view.coverage.seasons, Some(vec![1]), "the editor reads the coverage back");
        assert_eq!(view.local_id.as_deref(), Some("show1"), "linked to the show it already is");
        assert!(!view.on_disk, "on_disk answers for a movie, never for a show");
    }

    #[test]
    fn a_movie_ledger_has_no_seasons_and_says_whether_the_film_is_held() {
        let host = host(Some("k"));
        exec(&host, "INSERT OR IGNORE INTO libraries (id,name,kind,path,added_at) VALUES ('lib1','L','mixed','/x','now')");
        exec(&host, "INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('m1','movie','T','mkv','lib1','now')");
        exec(&host, "INSERT INTO metadata_core (subject_kind,subject_id,tmdb_id,updated_at) VALUES ('item','m1',7,0)");
        seed_request(&host, "r1", RequestKind::Movie, 7, None);
        let _tmdb = FakeTmdb::start(|path| match path {
            "/movie/7" => (200, serde_json::json!({ "title": "Film", "release_date": "2020-01-01" })),
            _ => (404, serde_json::json!({})),
        });

        let view = ledger(&host, "r1").unwrap();
        assert!(view.seasons.is_empty());
        assert!(view.on_disk, "the library holds the film");
        assert_eq!(view.local_id.as_deref(), Some("m1"));
    }

    #[test]
    fn a_season_row_carries_what_the_request_and_the_library_know() {
        let host = host(Some("k"));
        seed_show(&host, "show1", 42, &[(1, 1)]);
        seed_request(&host, "r1", RequestKind::Show, 42, Some(vec![1]));
        wanted(&host, "r1", &[(1, 1, "available"), (1, 2, "grabbed")]);
        let _tmdb = FakeTmdb::start(|path| match path {
            "/tv/42" => (200, show_json(&[(1, 3)])),
            "/tv/42/season/1" => (200, episodes_json(&[1, 2, 3])),
            _ => (404, serde_json::json!({})),
        });

        let view = season_ledger(&host, "r1", 1).unwrap();
        assert_eq!(view.episodes.len(), 3);

        let e1 = &view.episodes[0];
        assert!(e1.on_disk, "on disk");
        assert_eq!(e1.item_id.as_deref(), Some("show1-s1e1"), "links to the file it already is");
        assert_eq!(e1.video.as_ref().map(|v| v.codec.as_str()), Some("hevc"));
        assert_eq!(e1.duration_ms, Some(1_200_000));
        assert_eq!(e1.wanted_status.as_deref(), Some("available"));

        let e2 = &view.episodes[1];
        assert!(!e2.on_disk);
        assert_eq!(e2.wanted_status.as_deref(), Some("grabbed"), "a download is queued for it");
        assert!(e2.item_id.is_none());

        let e3 = &view.episodes[2];
        assert!(e3.wanted_id.is_none(), "the request does not cover it, so it is untracked");
        assert_eq!(e3.name.as_deref(), Some("E3"), "TMDB still describes it");
    }

    #[test]
    fn a_movie_has_no_season_to_open() {
        let host = host(Some("k"));
        seed_request(&host, "r1", RequestKind::Movie, 7, None);
        assert!(season_ledger(&host, "r1", 1).unwrap().episodes.is_empty());
    }

    #[test]
    fn preview_rows_describe_a_season_the_request_never_covered() {
        let host = host(Some("k"));
        seed_request(&host, "r1", RequestKind::Show, 42, Some(vec![1]));
        let _tmdb = FakeTmdb::start(|path| match path {
            "/tv/42" => (200, show_json(&[(1, 3), (2, 2)])),
            "/tv/42/season/2" => (200, episodes_json(&[1, 2])),
            _ => (404, serde_json::json!({})),
        });
        let conn = host.db().get().unwrap();
        let req = db::get_request(&conn, "r1").unwrap().unwrap();
        drop(conn);

        let rows = preview_season_rows(&host, &req, 2).unwrap();
        assert_eq!(rows.len(), 2, "a searchable row per episode of the season");
        assert!(rows.iter().all(|r| r.season == Some(2) && r.status == "wanted"));
        // Never persisted: the request still covers only what it covered.
        let conn = host.db().get().unwrap();
        assert!(db::wanted_for_request(&conn, "r1").unwrap().is_empty());
    }

    #[test]
    fn a_movie_request_previews_no_season_rows() {
        let host = host(Some("k"));
        seed_request(&host, "r1", RequestKind::Movie, 7, None);
        let conn = host.db().get().unwrap();
        let req = db::get_request(&conn, "r1").unwrap().unwrap();
        drop(conn);
        assert!(preview_season_rows(&host, &req, 1).unwrap().is_empty());
    }
}

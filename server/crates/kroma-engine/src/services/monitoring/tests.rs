pub(super) use serde_json::json;

pub(super) use kroma_module_host::HostStorage;
pub(super) use kroma_module_host::testing::StubHost;

pub(super) use super::*;
pub(super) use crate::model::{EpisodeRef, EpisodeSwitch, MinAvailability, SeasonSwitch};
pub(super) use crate::test_support::FakeTmdb;

pub(super) const SHOW: u64 = 77;
pub(super) const MOVIE: u64 = 603;
pub(super) const CINEMA_MOVIE: u64 = 604;

pub(super) fn host() -> StubHost {
    StubHost::with_core(crate::db::testing::temp_pool("monitoring"))
        .with_module_enabled(false)
        .with_metadata_language("en-US")
        .with_tmdb_key("k")
}

pub(super) fn exec(host: &StubHost, sql: &str) {
    host.db().get().unwrap().execute(sql, []).unwrap();
}

pub(super) fn episode(n: u32, air: &str) -> serde_json::Value {
    json!({ "episode_number": n, "name": format!("E{n}"), "air_date": air })
}

pub(super) fn tmdb() -> FakeTmdb {
    FakeTmdb::start(|path| match path {
        "/tv/77" => (
            200,
            json!({
                "name": "Show",
                "first_air_date": "2020-01-01",
                "status": "Returning Series",
                "original_language": "en",
                "origin_country": ["US"],
                "seasons": [
                    { "season_number": 0 },
                    { "season_number": 1 },
                    { "season_number": 2 }
                ],
            }),
        ),
        "/tv/77/season/0" => (200, json!({ "episodes": [episode(1, "2020-06-01")] })),
        "/tv/77/season/1" => (
            200,
            json!({ "episodes": [episode(1, "2020-01-01"), episode(2, "2020-01-08")] }),
        ),
        "/tv/77/season/2" => (
            200,
            json!({ "episodes": [episode(1, "2021-01-01"), episode(2, "2999-01-01")] }),
        ),
        "/movie/603" => (
            200,
            json!({
                "title": "The Matrix",
                "release_date": "1999-03-31",
                "original_language": "en",
                "release_dates": { "results": [{ "iso_3166_1": "US", "release_dates": [
                    { "type": 3, "release_date": "1999-03-31T00:00:00.000Z" },
                    { "type": 4, "release_date": "1999-09-21T00:00:00.000Z" }
                ]}]},
            }),
        ),
        "/movie/604" => (200, in_cinemas(None)),
        _ => (404, json!({})),
    })
}

pub(super) fn in_cinemas(home: Option<&str>) -> serde_json::Value {
    let mut dates = vec![json!({ "type": 3, "release_date": "2026-03-01T00:00:00.000Z" })];
    if let Some(home) = home {
        dates.push(json!({ "type": 4, "release_date": format!("{home}T00:00:00.000Z") }));
    }
    json!({
        "title": "Still Showing",
        "release_date": "2026-03-01",
        "original_language": "en",
        "release_dates": { "results": [{ "iso_3166_1": "US", "release_dates": dates }]},
    })
}

pub(super) fn air_date(host: &StubHost, tmdb_id: u64) -> Option<String> {
    let conn = host.db().get().unwrap();
    db::wanted_for_title(&conn, RequestKind::Movie, tmdb_id).unwrap()[0]
        .air_date
        .clone()
}

pub(super) fn seed_show_on_disk(host: &StubHost, episodes: &[(u32, u32)]) {
    exec(
        host,
        "INSERT OR IGNORE INTO libraries (id,name,kind,path,added_at) VALUES ('lib1','L','shows','/x','now')",
    );
    exec(
        host,
        "INSERT OR IGNORE INTO shows (id,library,title,added_at) VALUES ('s1','lib1','Show','now')",
    );
    exec(
        host,
        &format!(
            "INSERT OR IGNORE INTO metadata_core (subject_kind,subject_id,tmdb_id,updated_at) VALUES ('show','s1',{SHOW},0)"
        ),
    );
    for (s, e) in episodes {
        exec(
            host,
            &format!(
                "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at) \
             VALUES ('e{s}{e}','episode','E','mkv','lib1','s1',{s},{e},'now')"
            ),
        );
    }
}

pub(super) fn units(
    host: &StubHost,
    kind: RequestKind,
    tmdb_id: u64,
) -> Vec<(Option<u32>, Option<u32>, String)> {
    let conn = host.db().get().unwrap();
    db::wanted_for_title(&conn, kind, tmdb_id)
        .unwrap()
        .into_iter()
        .map(|w| (w.season, w.episode, w.status))
        .collect()
}

pub(super) fn held(host: &StubHost) -> Vec<(Option<u32>, Option<u32>)> {
    units(host, RequestKind::Show, SHOW)
        .into_iter()
        .map(|(s, e, _)| (s, e))
        .collect()
}

pub(super) fn monitored(
    host: &StubHost,
    kind: RequestKind,
    tmdb_id: u64,
) -> Option<MonitoredTitle> {
    let conn = host.db().get().unwrap();
    db::get_monitored(&conn, kind, tmdb_id).unwrap()
}

pub(super) fn asked_for(host: &StubHost, season: u32, episode: u32) {
    db::insert_request(
        host.db(),
        &db::NewRequest {
            id: "r1".into(),
            kind: RequestKind::Show,
            tmdb_id: SHOW,
            title: "Show".into(),
            year: None,
            poster_url: None,
            seasons: Some(vec![season]),
            episodes: None,
            status: RequestStatus::Approved,
            requested_by: None,
        },
        1,
    )
    .unwrap();
    let asked = db::WantedRow {
        id: db::unit_id("episode", SHOW, Some(season), Some(episode)),
        request_id: Some("r1".into()),
        kind: "episode".into(),
        tmdb_id: SHOW,
        imdb_id: None,
        title: "Show".into(),
        year: None,
        season: Some(season),
        episode: Some(episode),
        air_date: None,
        status: "wanted".into(),
        last_search_at: None,
    };
    db::claim_wanted(host.db(), "r1", &[asked], 1).unwrap();
}

pub(super) fn with_preset(preset: MonitorPreset) -> MonitorBody {
    MonitorBody {
        preset: Some(preset),
        ..MonitorBody::default()
    }
}

pub(super) fn wanted(status: &str) -> String {
    status.to_string()
}

mod monitor;
mod reconcile;
mod refresh;

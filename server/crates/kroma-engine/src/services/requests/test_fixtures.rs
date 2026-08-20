use serde_json::json;

use kroma_domain::ParamValue;

use crate::db;
use crate::infra::metadata::discover;
use crate::model::{
    CreateRequestBody, EpisodeRef, MediaRequest, Permission, RequestKind, RequestStatus, User,
};
use crate::test_support::FakeTmdb;

pub(super) fn ep(season: u32, episode: u32) -> EpisodeRef {
    EpisodeRef { season, episode }
}

pub(super) fn req(kind: RequestKind, status: RequestStatus) -> MediaRequest {
    MediaRequest {
        id: "r1".into(),
        kind,
        tmdb_id: 42,
        title: "Title".into(),
        year: Some(2020),
        poster_url: None,
        seasons: None,
        episodes: None,
        status,
        requested_by: None,
        requested_by_name: None,
        reviewed_by: None,
        note: None,
        created_at: 0,
        updated_at: 0,
        progress: None,
        air_status: None,
        next_air_date: None,
        last_refresh_at: None,
    }
}

pub(super) fn wr(season: u32, episode: u32, air: Option<&str>, status: &str) -> db::WantedRow {
    db::WantedRow {
        id: format!("s{season}e{episode}"),
        request_id: "r1".into(),
        kind: "episode".into(),
        tmdb_id: 42,
        imdb_id: None,
        title: "Title".into(),
        year: Some(2020),
        season: Some(season),
        episode: Some(episode),
        air_date: air.map(str::to_string),
        status: status.into(),
        last_search_at: None,
    }
}

pub(super) fn param(params: &std::collections::BTreeMap<String, ParamValue>, key: &str) -> Option<String> {
    params.get(key).map(|v| v.resolve(|k| Some(k.to_string())))
}

pub(super) fn wanted(id: &str, req_id: &str, season: Option<u32>, episode: Option<u32>, air: Option<&str>, status: &str) -> db::WantedRow {
    db::WantedRow {
        id: id.into(),
        request_id: req_id.into(),
        kind: if season.is_some() { "episode".into() } else { "movie".into() },
        tmdb_id: 100,
        imdb_id: None,
        title: "T".into(),
        year: None,
        season,
        episode,
        air_date: air.map(str::to_string),
        status: status.into(),
        last_search_at: None,
    }
}

pub(super) fn raw_detail(imdb: Option<&str>, avail: Option<&str>) -> discover::DiscoverRawDetail {
    discover::DiscoverRawDetail {
        kind: RequestKind::Movie,
        tmdb_id: 42,
        title: "T".into(),
        year: Some(2020),
        poster_url: None,
        backdrop_url: None,
        overview: None,
        tagline: None,
        genres: Vec::new(),
        rating: None,
        runtime_min: None,
        imdb_id: imdb.map(str::to_string),
        seasons: Vec::new(),
        cast: Vec::new(),
        crew: Vec::new(),
        similar: Vec::new(),
        status: None,
        next_air: None,
        available_date: avail.map(str::to_string),
    }
}

pub(super) fn user(id: &str, permissions: Vec<Permission>) -> User {
    crate::test_support::test_user(id, permissions)
}

pub(super) fn req_by(kind: RequestKind, status: RequestStatus, requester: &str) -> MediaRequest {
    let mut r = req(kind, status);
    r.requested_by = Some(requester.into());
    r
}

pub(super) fn detail(kind: RequestKind, tmdb_id: u64, available: Option<&str>) -> discover::DiscoverRawDetail {
    discover::DiscoverRawDetail {
        kind,
        tmdb_id,
        title: "T".into(),
        year: Some(2020),
        poster_url: None,
        backdrop_url: None,
        overview: None,
        tagline: None,
        genres: Vec::new(),
        rating: None,
        runtime_min: None,
        imdb_id: Some("tt0000001".into()),
        seasons: Vec::new(),
        cast: Vec::new(),
        crew: Vec::new(),
        similar: Vec::new(),
        status: None,
        next_air: None,
        available_date: available.map(str::to_string),
    }
}

pub(super) fn movie_detail(title: &str, year: &str) -> serde_json::Value {
    json!({
        "title": title,
        "overview": "A film.",
        "release_date": year,
        "poster_path": "/p.jpg",
        "imdb_id": "tt0000001",
        "genres": [{ "id": 28, "name": "Action" }],
    })
}

pub(super) fn show_detail(title: &str, seasons: &[u32]) -> serde_json::Value {
    json!({
        "name": title,
        "overview": "A show.",
        "first_air_date": "2020-01-01",
        "status": "Returning Series",
        "seasons": seasons
            .iter()
            .map(|n| json!({ "season_number": n, "name": format!("Season {n}") }))
            .collect::<Vec<_>>(),
    })
}

pub(super) fn episodes(nums: &[u32], air: &str) -> serde_json::Value {
    json!({
        "episodes": nums
            .iter()
            .map(|n| json!({ "episode_number": n, "name": format!("E{n}"), "air_date": air }))
            .collect::<Vec<_>>(),
    })
}

pub(super) fn body(user: &str) -> CreateRequestBody {
    let _ = user;
    CreateRequestBody { kind: RequestKind::Movie, tmdb_id: 603, seasons: None, episodes: None }
}

pub(super) fn breaking_bad() -> FakeTmdb {
    FakeTmdb::start(|path| match path {
        "/tv/1396" => (200, show_detail("Breaking Bad", &[1, 2])),
        "/tv/1396/season/1" => (200, episodes(&[1, 2, 3], "2008-01-20")),
        "/tv/1396/season/2" => (200, episodes(&[1, 2], "2009-03-08")),
        _ => (404, json!({})),
    })
}

pub(super) fn show_body(seasons: Option<Vec<u32>>, eps: Option<Vec<EpisodeRef>>) -> CreateRequestBody {
    CreateRequestBody { kind: RequestKind::Show, tmdb_id: 1396, seasons, episodes: eps }
}

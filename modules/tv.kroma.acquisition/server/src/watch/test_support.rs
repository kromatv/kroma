use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use kroma_module_sdk::host::testing::StubHost;
use serde_json::{json, Value};

use crate::peers::downloads::{DOWNLOAD_DB, DOWNLOAD_GRAB};
use crate::peers::indexers::{Release, INDEXER_DB, INDEXER_SEARCH};
use crate::search::test_support::{indexer, profile};
use crate::search::{score_release, CachedRelease, SearchTarget};

use super::{watch, WatchLocks, WatchReply, WatchRequest};
use anyhow::Result;

#[derive(Clone, Default)]
pub(super) struct Peers {
    pub live: Option<Value>,
    pub releases: Vec<Value>,
    pub contents: HashMap<String, Vec<Value>>,
    pub refusals: HashMap<String, String>,
    pub lookups: Arc<Mutex<Vec<Value>>>,
    pub grabs: Arc<Mutex<Vec<Value>>>,
    pub removals: Arc<Mutex<Vec<Value>>>,
    pub queued: Arc<Mutex<Vec<Value>>>,
}

impl Peers {
    pub fn looked_up(&self) -> Vec<Value> {
        self.lookups.lock().unwrap().clone()
    }

    pub fn grabbed(&self) -> Vec<Value> {
        self.grabs.lock().unwrap().clone()
    }

    pub fn removed(&self) -> Vec<String> {
        self.removals
            .lock()
            .unwrap()
            .iter()
            .map(|call| call["id"].as_str().unwrap_or_default().to_string())
            .collect()
    }
}

pub(super) fn dune() -> WatchRequest {
    WatchRequest {
        tmdb_id: 438631,
        kind: "movie".into(),
        title: "Dune".into(),
        year: Some(2021),
        season: None,
        episode: None,
    }
}

pub(super) fn severance_s01e02() -> WatchRequest {
    WatchRequest {
        tmdb_id: 95396,
        kind: "show".into(),
        title: "Severance".into(),
        season: Some(1),
        episode: Some(2),
        ..dune()
    }
}

pub(super) fn sintel() -> WatchRequest {
    WatchRequest {
        tmdb_id: 45745,
        title: "Sintel".into(),
        year: Some(2010),
        ..dune()
    }
}

pub(super) fn big_buck_bunny() -> WatchRequest {
    WatchRequest {
        tmdb_id: 10378,
        title: "Big Buck Bunny".into(),
        year: Some(2008),
        ..dune()
    }
}

pub(super) fn holding(paths: &[(&str, u64)]) -> Vec<Value> {
    paths
        .iter()
        .enumerate()
        .map(|(index, (path, size_bytes))| {
            json!({ "index": index, "path": path, "size_bytes": size_bytes })
        })
        .collect()
}

pub(super) fn archive_hits(titles: &[(&str, u64)]) -> Peers {
    let releases = titles.iter().map(|(title, size_bytes)| {
        json!({
            "title": title,
            "guid": title,
            "link": format!("http://archive/{title}.torrent"),
            "seeders": 1,
            "size_bytes": size_bytes,
        })
    });
    Peers {
        releases: releases.collect(),
        ..Peers::default()
    }
}

pub(super) fn found(titles: &[(&str, u64)]) -> Peers {
    let releases = titles.iter().map(|(title, gib)| {
        json!({
            "title": title,
            "guid": title,
            "link": format!("http://indexer/{title}.torrent"),
            "seeders": 40,
            "size_bytes": gib * 1_073_741_824,
        })
    });
    Peers {
        releases: releases.collect(),
        ..Peers::default()
    }
}

pub(super) fn candidate(title: &str) -> CachedRelease {
    let link = format!("http://archive/{title}.torrent");
    let found = Release {
        title: title.into(),
        guid: title.into(),
        link: Some(link.clone()),
        size_bytes: Some(566_514_982),
        seeders: Some(40),
        ..Release::default()
    };
    CachedRelease {
        view: score_release(
            &found,
            &indexer(0),
            &SearchTarget::movie(45745, None, "Sintel".into(), Some(2010)),
            &profile(),
        ),
        magnet_or_url: link,
        torrent_url: None,
        tmdb_id: 45745,
    }
}

pub(super) async fn watched(peers: &Peers, request: WatchRequest) -> Result<WatchReply> {
    let host = host_over(peers.clone()).await;
    one_watch(&host, &Arc::new(WatchLocks::default()), request).await
}

pub(super) async fn watched_at_once(
    peers: &Peers,
    requests: [WatchRequest; 2],
) -> [Result<WatchReply>; 2] {
    let host = host_over(peers.clone()).await;
    let locks = Arc::new(WatchLocks::default());
    let [first, second] = requests;
    let answers = tokio::join!(
        one_watch(&host, &locks, first),
        one_watch(&host, &locks, second)
    );
    [answers.0, answers.1]
}

async fn one_watch(
    host: &StubHost,
    locks: &Arc<WatchLocks>,
    request: WatchRequest,
) -> Result<WatchReply> {
    let (host, locks) = (host.clone(), Arc::clone(locks));
    kroma_module_sdk::testing::blocking(move || watch(&host, &locks, &request)).await
}

pub(super) async fn host_over(peers: Peers) -> StubHost {
    let torznab =
        json!({ "id": "a", "name": "A", "kind": "torznab", "priority": 0, "enabled": true });
    let found = json!({ "releases": peers.releases, "errors": [] });
    let answer = |value: Value| post(move || std::future::ready(Json(json!({ "Ok": value }))));
    let router = Router::new()
        .route("/_port/tv.kroma.torrents/db/live-for-title", post(live))
        .route("/_port/tv.kroma.torrents/grab/grab", post(grab))
        .route("/_port/tv.kroma.torrents/grab/files", post(files))
        .route("/_port/tv.kroma.torrents/grab/remove", post(remove))
        .route(
            "/_port/tv.kroma.torrents/grab/activate",
            answer(json!(true)),
        )
        .route(
            "/_port/tv.kroma.indexer/db/enabled",
            answer(json!([torznab])),
        )
        .route("/_port/tv.kroma.indexer/db/get", answer(torznab))
        .route(
            "/_port/tv.kroma.indexer/db/note-result",
            answer(Value::Null),
        )
        .route("/_port/tv.kroma.indexer/search/search", answer(found));
    let resolve = kroma_module_sdk::testing::serve(router, peers).await;
    let (base, token) = resolve().expect("the fake peers are up");
    StubHost::new()
        .with_point(DOWNLOAD_GRAB, None, &base, &token)
        .with_point(DOWNLOAD_DB, None, &base, &token)
        .with_point(INDEXER_DB, None, &base, &token)
        .with_point(INDEXER_SEARCH, None, &base, &token)
}

async fn live(State(peers): State<Peers>, Json(body): Json<Value>) -> Json<Result<Value, String>> {
    peers.lookups.lock().unwrap().push(body);
    let newest = peers.queued.lock().unwrap().last().cloned();
    Json(Ok(newest.or(peers.live).unwrap_or(Value::Null)))
}

async fn grab(State(peers): State<Peers>, Json(spec): Json<Value>) -> Json<Result<Value, String>> {
    let title = spec["release_title"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    peers.grabs.lock().unwrap().push(spec.clone());
    if let Some(refusal) = peers.refusals.get(&title) {
        return Json(Err(refusal.clone()));
    }
    let mut queued = peers.queued.lock().unwrap();
    if queued
        .iter()
        .any(|row| row["magnet_or_url"] == spec["magnet_or_url"])
    {
        return Json(Err(format!(
            "this release is already in the queue (\"{title}\", status: queued)"
        )));
    }
    let row = json!({
        "id": title,
        "kind": spec["kind"],
        "tmdb_id": spec["tmdb_id"],
        "release_title": title,
        "magnet_or_url": spec["magnet_or_url"],
        "status": "queued",
    });
    queued.push(row.clone());
    Json(Ok(row))
}

async fn files(State(peers): State<Peers>, Json(req): Json<Value>) -> Json<Result<Value, String>> {
    let id = req["id"].as_str().unwrap_or_default().to_string();
    let held = peers.contents.get(&id).cloned().unwrap_or_else(|| {
        vec![json!({ "index": 0, "path": format!("{id}.mkv"), "size_bytes": 1_000_000 })]
    });
    Json(Ok(Value::Array(held)))
}

async fn remove(State(peers): State<Peers>, Json(req): Json<Value>) -> Json<Result<bool, String>> {
    peers
        .queued
        .lock()
        .unwrap()
        .retain(|row| row["id"] != req["id"]);
    peers.removals.lock().unwrap().push(req);
    Json(Ok(true))
}

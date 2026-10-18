use std::sync::{Arc, Mutex};

use axum::Json;
use axum::routing::post;
use kroma_module_sdk::db::{self, WantedRow};
use kroma_module_sdk::engine::model::{MonitoredTitle, RequestKind};
use kroma_module_sdk::host::testing::StubHost;
use kroma_module_sdk::host::HostStorage;
use kroma_module_sdk::testing::serve;
use serde_json::{Value, json};

use crate::peers::downloads::DOWNLOAD_GRAB;
use crate::peers::indexers::{INDEXER_DB, INDEXER_SEARCH};

#[derive(Clone)]
pub(crate) struct Fakes {
    pub(crate) gate: bool,
    pub(crate) indexers: Vec<Value>,
    pub(crate) releases: Vec<Value>,
    pub(crate) search_error: Option<String>,
    pub(crate) grab_error: Option<String>,
    pub(crate) grabs: Arc<Mutex<Vec<Value>>>,
}

impl Fakes {
    pub(crate) fn new() -> Self {
        Self {
            gate: true,
            indexers: vec![json!({
                "id": "idx1", "name": "Tracker", "kind": "torznab", "priority": 30, "enabled": true
            })],
            releases: Vec::new(),
            search_error: None,
            grab_error: None,
            grabs: Arc::default(),
        }
    }

    pub(crate) fn offering(mut self, titles: &[&str]) -> Self {
        self.releases = titles.iter().map(|t| release_json(t)).collect();
        self
    }

    pub(crate) fn grabbed_titles(&self) -> Vec<String> {
        self.grabs
            .lock()
            .unwrap()
            .iter()
            .map(|g| g["release_title"].as_str().unwrap().to_string())
            .collect()
    }

    pub(crate) fn grabbed_rows(&self) -> Vec<Vec<String>> {
        self.grabs
            .lock()
            .unwrap()
            .iter()
            .map(|g| {
                g["wanted_ids"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|id| id.as_str().unwrap().to_string())
                    .collect()
            })
            .collect()
    }
}

pub(crate) fn release_json(title: &str) -> Value {
    json!({
        "title": title,
        "guid": title,
        "magnet": format!("magnet:?xt={title}"),
        "size_bytes": 1_073_741_824u64,
        "seeders": 20,
        "leechers": 2,
    })
}

pub(crate) async fn host(fakes: &Fakes) -> StubHost {
    let releases = fakes.releases.clone();
    let indexers = fakes.indexers.clone();
    let search_error = fakes.search_error.clone();
    let grab_error = fakes.grab_error.clone();
    let grabs = fakes.grabs.clone();
    let gate = fakes.gate;
    let router = axum::Router::new()
        .route(
            "/_port/tv.kroma.torrents/grab/gate-open",
            post(move |Json(_): Json<Value>| async move { Json(gate) }),
        )
        .route(
            "/_port/tv.kroma.torrents/grab/grab",
            post(move |Json(spec): Json<Value>| {
                let grabs = grabs.clone();
                let grab_error = grab_error.clone();
                async move {
                    if let Some(e) = grab_error {
                        return Json(Err::<Value, String>(e));
                    }
                    grabs.lock().unwrap().push(spec);
                    Json(Ok(json!({ "id": "dl1" })))
                }
            }),
        )
        .route(
            "/_port/tv.kroma.torrents/grab/activate",
            post(|Json(_): Json<Value>| async { Json(Ok::<_, String>(true)) }),
        )
        .route(
            "/_port/tv.kroma.indexer/db/enabled",
            post(move |Json(_): Json<Value>| {
                let indexers = indexers.clone();
                async move { Json(Ok::<_, String>(indexers)) }
            }),
        )
        .route(
            "/_port/tv.kroma.indexer/db/note-result",
            post(|Json(_): Json<Value>| async { Json(Ok::<_, String>(())) }),
        )
        .route(
            "/_port/tv.kroma.indexer/search/search",
            post(move |Json(_): Json<Value>| {
                let releases = releases.clone();
                let search_error = search_error.clone();
                async move {
                    match search_error {
                        Some(e) => Json(Err::<Value, String>(e)),
                        None => Json(Ok(json!({ "releases": releases, "errors": [] }))),
                    }
                }
            }),
        );
    let resolve = serve(router, ()).await;
    let (base, token) = resolve().expect("the fakes are up");
    let host = StubHost::with_core(db::testing::temp_pool("acq-world"))
        .with_setting("acqEnabled", json!(true))
        .with_point(DOWNLOAD_GRAB, None, &base, &token)
        .with_point(INDEXER_DB, None, &base, &token)
        .with_point(INDEXER_SEARCH, None, &base, &token);
    db::apply_migrations(
        &host.store().get().unwrap(),
        crate::rules::schema::MIGRATIONS,
    )
    .unwrap();
    host
}

pub(crate) fn monitored(
    kind: RequestKind,
    tmdb_id: u64,
    name: &str,
    year: Option<u32>,
) -> MonitoredTitle {
    MonitoredTitle {
        kind,
        tmdb_id,
        title: name.into(),
        year,
        poster_url: None,
        seasons: vec![1],
        monitor_new_seasons: true,
        min_availability: Default::default(),
        last_season: Some(1),
        added_by: None,
        added_at: 0,
        updated_at: 0,
        original_language: None,
        air_status: None,
        refreshed_at: None,
        known_episodes: Default::default(),
        aliases: Vec::new(),
    }
}

pub(crate) fn monitor(host: &StubHost, title: &MonitoredTitle) {
    db::upsert_monitored(host.db(), title).unwrap();
}

pub(crate) fn wanted_row(
    id: &str,
    title: &MonitoredTitle,
    season: Option<u32>,
    episode: Option<u32>,
    status: &str,
) -> WantedRow {
    WantedRow {
        id: id.into(),
        request_id: None,
        kind: if title.kind == RequestKind::Movie {
            "movie"
        } else {
            "episode"
        }
        .into(),
        tmdb_id: title.tmdb_id,
        imdb_id: None,
        title: title.title.clone(),
        year: title.year,
        season,
        episode,
        air_date: None,
        status: status.into(),
        last_search_at: None,
    }
}

pub(crate) fn want(host: &StubHost, rows: &[WantedRow]) {
    db::insert_wanted(host.db(), rows, 1).unwrap();
}

pub(crate) fn hold_file(
    host: &StubHost,
    title: &MonitoredTitle,
    season: Option<u32>,
    episode: Option<u32>,
    file_name: &str,
) {
    let conn = host.db().get().unwrap();
    conn.execute_batch(
        "INSERT OR IGNORE INTO libraries (id, name, kind, path, added_at) \
         VALUES ('lib', 'Lib', 'movies', '/lib', '2026-01-01');",
    )
    .unwrap();
    let tmdb = title.tmdb_id;
    let item = format!("item-{tmdb}-{season:?}-{episode:?}");
    match title.kind {
        RequestKind::Movie => {
            conn.execute(
                "INSERT INTO items (id, kind, title, container, library, added_at) \
                 VALUES (?1, 'movie', 'T', 'mkv', 'lib', '2026-01-01')",
                [&item],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO metadata_core (subject_kind, subject_id, tmdb_id, updated_at) \
                 VALUES ('item', ?1, ?2, 0)",
                rusqlite::params![item, tmdb as i64],
            )
            .unwrap();
        }
        RequestKind::Show => {
            let show = format!("show-{tmdb}");
            conn.execute(
                "INSERT OR IGNORE INTO shows (id, library, title, added_at) \
                 VALUES (?1, 'lib', 'Show', '2026-01-01')",
                [&show],
            )
            .unwrap();
            conn.execute(
                "INSERT OR IGNORE INTO metadata_core (subject_kind, subject_id, tmdb_id, updated_at) \
                 VALUES ('show', ?1, ?2, 0)",
                rusqlite::params![show, tmdb as i64],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO items (id, kind, title, container, library, show_id, season, episode, added_at) \
                 VALUES (?1, 'episode', 'E', 'mkv', 'lib', ?2, ?3, ?4, '2026-01-01')",
                rusqlite::params![item, show, season, episode],
            )
            .unwrap();
        }
    }
    conn.execute(
        "INSERT INTO files (id, item_id, abs_path, rel_path, container) \
         VALUES (?1, ?2, ?3, ?3, 'mkv')",
        rusqlite::params![format!("f-{item}"), item, file_name],
    )
    .unwrap();
}

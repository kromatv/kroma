//! The `download-grab` and `download-db` points this module answers: the grab
//! spec a consumer hands over, the ledger row it gets back, and the reads and
//! writes an import pass needs.

use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use serde::Deserialize;

use kroma_module_sdk::host::{port_reply, HostStorage};

use super::manager;
use crate::db::DownloadRow;
use crate::downloads::Asked;
use crate::{DownloadDb, GrabSpec, TorrentFileEntry};

pub const DOWNLOAD_GRAB: &str = "tv.kroma.torrents/grab";

pub const DOWNLOAD_DB: &str = "tv.kroma.torrents/db";

pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/_port/tv.kroma.torrents/grab/grab", post(grab::<S>))
        .route(
            "/_port/tv.kroma.torrents/grab/list-files",
            post(list_files::<S>),
        )
        .route("/_port/tv.kroma.torrents/grab/files", post(files::<S>))
        .route("/_port/tv.kroma.torrents/grab/remove", post(remove::<S>))
        .route(
            "/_port/tv.kroma.torrents/grab/gate-open",
            post(gate_open::<S>),
        )
        .route(
            "/_port/tv.kroma.torrents/grab/activate",
            post(activate::<S>),
        )
        .route(
            "/_port/tv.kroma.torrents/grab/drop-data",
            post(drop_data::<S>),
        )
        .route(
            "/_port/tv.kroma.torrents/db/completed",
            post(completed::<S>),
        )
        .route(
            "/_port/tv.kroma.torrents/db/mark-imported",
            post(mark_imported::<S>),
        )
        .route(
            "/_port/tv.kroma.torrents/db/set-status",
            post(set_status::<S>),
        )
        .route(
            "/_port/tv.kroma.torrents/db/live-for-title",
            post(live_for_title::<S>),
        )
}

fn ledger<S: HostStorage>(host: &S) -> DownloadDb {
    DownloadDb::new(host.db().clone(), host.store().clone())
}

async fn grab<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(spec): Json<GrabSpec>,
) -> Json<Result<DownloadRow, String>> {
    port_reply(move || manager(&host)?.grab(&host, spec)).await
}

#[derive(Deserialize)]
struct MagnetReq {
    magnet_or_url: String,
}

async fn list_files<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(req): Json<MagnetReq>,
) -> Json<Result<Vec<TorrentFileEntry>, String>> {
    port_reply(move || manager(&host)?.list_files(&host, &req.magnet_or_url)).await
}

// Not fallible: a closed gate and an absent manager both mean "do not grab".
async fn gate_open<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
) -> Json<bool> {
    Json(manager(&host).map(|m| m.gate_open()).unwrap_or(false))
}

#[derive(Deserialize)]
struct IdReq {
    id: String,
}

async fn activate<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(req): Json<IdReq>,
) -> Json<Result<bool, String>> {
    port_reply(move || {
        let manager = manager(&host)?;
        let Some(row) = ledger(&host).get(&req.id)? else {
            return Ok(false);
        };
        manager.activate(&host, &row);
        Ok(true)
    })
    .await
}

async fn drop_data<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(req): Json<IdReq>,
) -> Json<Result<bool, String>> {
    port_reply(move || {
        let manager = manager(&host)?;
        let Some(row) = ledger(&host).get(&req.id)? else {
            return Ok(false);
        };
        manager.drop_data(&row);
        Ok(true)
    })
    .await
}

async fn files<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(req): Json<IdReq>,
) -> Json<Result<Vec<TorrentFileEntry>, String>> {
    port_reply(move || manager(&host)?.resolved_files(&req.id)).await
}

#[derive(Deserialize)]
struct RemoveReq {
    id: String,
    #[serde(default)]
    delete_data: bool,
}

async fn remove<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(req): Json<RemoveReq>,
) -> Json<Result<bool, String>> {
    port_reply(move || {
        let manager = manager(&host)?;
        let Some(row) = ledger(&host).get(&req.id)? else {
            return Ok(false);
        };
        manager.remove(&row.id, req.delete_data)?;
        Ok(true)
    })
    .await
}

async fn completed<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
) -> Json<Result<Vec<DownloadRow>, String>> {
    port_reply(move || crate::downloads::importable(&host, ledger(&host).completed()?)).await
}

#[derive(Deserialize)]
struct ImportedReq {
    id: String,
    paths: Vec<String>,
    now_ms: i64,
}

async fn mark_imported<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(req): Json<ImportedReq>,
) -> Json<Result<(), String>> {
    port_reply(move || ledger(&host).mark_imported(&req.id, &req.paths, req.now_ms)).await
}

#[derive(Deserialize)]
struct StatusReq {
    id: String,
    status: String,
    #[serde(default)]
    error: Option<String>,
}

async fn set_status<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(req): Json<StatusReq>,
) -> Json<Result<bool, String>> {
    port_reply(move || ledger(&host).set_status(&req.id, &req.status, req.error.as_deref())).await
}

#[derive(Deserialize)]
struct TitleReq {
    kind: String,
    tmdb_id: u64,
    client_id: String,
    season: Option<u32>,
    episode: Option<u32>,
}

async fn live_for_title<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(req): Json<TitleReq>,
) -> Json<Result<Option<DownloadRow>, String>> {
    port_reply(move || {
        manager(&host)?.live_for_title(Asked {
            kind: &req.kind,
            tmdb_id: req.tmdb_id,
            client_id: &req.client_id,
            episode: req.season.zip(req.episode),
        })
    })
    .await
}

#[cfg(test)]
mod tests;

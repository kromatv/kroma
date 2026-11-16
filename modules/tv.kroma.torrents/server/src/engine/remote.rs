//! A [`DownloadClient`](super::DownloadClient) that lives in another process.
//!
//! This module defines the `download-client` point and answers it itself with the
//! embedded engine. Every other engine is a module that answers the same point
//! under its own kind: it declares `download-client` with an id in its manifest,
//! serves `/_port/tv.kroma.torrents/client/<method>`, and links nothing of this crate.
//!
//! So a download client nobody here has written can be installed at runtime, and
//! neither the core nor this module is edited to accept it. That is the whole
//! point of the point.

use serde::Deserialize;
use serde_json::json;

use kroma_module_sdk::host::{call, call_raw, pinned_resolver, HostCtx, Resolver};

#[cfg(test)]
use super::TorrentState;
use super::{AddTorrentReq, ClientDef, DownloadClient, TorrentFileEntry, TorrentStatus, TORRENT};

/// The point an engine answers, under an instance name that is its client `kind`.
pub const DOWNLOAD_CLIENT: &str = "tv.kroma.torrents/client";

/// An engine reached over the point. `kind` is both the client kind and the
/// instance to resolve, so two engines can answer at once and a download goes to
/// the one its client row names.
pub struct RemoteEngine {
    def: ClientDef,
    resolve: Resolver,
}

impl RemoteEngine {
    /// `None` when no installed, enabled module answers under `def.kind`, so an
    /// absent engine reads as absent rather than failing on the first grab.
    ///
    /// The endpoint is pinned for this engine's lifetime, which is one call: the
    /// caller builds one per operation, and the monitor does that per active
    /// download every few seconds, so re-resolving per method would double the
    /// callbacks on a hot path to learn the same answer twice.
    pub fn new(host: &dyn HostCtx, def: ClientDef) -> Option<Self> {
        let resolve = pinned_resolver(host, DOWNLOAD_CLIENT, Some(&def.kind))?;
        Some(Self { def, resolve })
    }

    fn ask<T: serde::de::DeserializeOwned>(
        &self,
        method: &str,
        args: serde_json::Value,
    ) -> anyhow::Result<T> {
        call(
            &self.resolve,
            &format!("{DOWNLOAD_CLIENT}/{method}"),
            &json!({ "client": &self.def, "args": args }),
        )
    }
}

// The engine reports its own kind; asking it over the wire would be a round trip
// to learn what the client row already said.
impl DownloadClient for RemoteEngine {
    fn kind(&self) -> &'static str {
        // The trait wants a `'static` name and this one is per-instance, so the
        // honest answer is the point rather than a leaked string.
        DOWNLOAD_CLIENT
    }

    fn test(&self) -> anyhow::Result<String> {
        self.ask("test", json!({}))
    }

    fn protocols(&self) -> Vec<String> {
        #[derive(Deserialize, Default)]
        #[serde(default)]
        struct Caps {
            protocols: Vec<String>,
        }
        match self.ask::<Caps>("caps", json!({})) {
            Ok(caps) if !caps.protocols.is_empty() => caps.protocols,
            _ => vec![TORRENT.to_string()],
        }
    }

    fn add(&self, req: &AddTorrentReq) -> anyhow::Result<String> {
        // `only_files` and `torrent_bytes` are not sent: no external engine reads
        // them (file selection is the embedded engine's, and a pre-fetched
        // `.torrent` is a URL to an external client). An engine that wants either
        // gets a new key, which is additive.
        self.ask(
            "add",
            json!({
                "magnet_or_url": req.magnet_or_url,
                "protocol": req.protocol,
                "name": req.name,
                "download_dir": req.download_dir,
                "label": req.label,
            }),
        )
    }

    fn list_files(
        &self,
        _magnet_or_url: &str,
        _torrent_bytes: Option<&[u8]>,
    ) -> anyhow::Result<Vec<TorrentFileEntry>> {
        // Answered here rather than over the wire: no external client exposes a
        // list-only add, so this would be a round trip to the same error.
        anyhow::bail!("this download client cannot list a torrent's files before adding it")
    }

    fn status(&self, client_ref: &str) -> anyhow::Result<Option<TorrentStatus>> {
        // `Option` is the answer, not an error: a torrent the engine has forgotten
        // is a normal state the queue reconciles.
        call_raw(
            &self.resolve,
            &format!("{DOWNLOAD_CLIENT}/status"),
            &json!({ "client": &self.def, "args": { "client_ref": client_ref } }),
        )
    }

    fn pause(&self, client_ref: &str) -> anyhow::Result<()> {
        self.ask("pause", json!({ "client_ref": client_ref }))
    }

    fn resume(&self, client_ref: &str) -> anyhow::Result<()> {
        self.ask("resume", json!({ "client_ref": client_ref }))
    }

    fn reannounce(&self, client_ref: &str) -> anyhow::Result<()> {
        self.ask("reannounce", json!({ "client_ref": client_ref }))
    }

    fn remove(&self, client_ref: &str, delete_data: bool) -> anyhow::Result<()> {
        self.ask(
            "remove",
            json!({ "client_ref": client_ref, "delete_data": delete_data }),
        )
    }
}

/// The wire shape an engine parses, which this module also serves for its own
/// embedded engine (see [`routes`]).
#[derive(Debug, Deserialize)]
pub struct EngineCall {
    pub client: ClientDef,
    #[serde(default)]
    pub args: serde_json::Value,
}

/// The point's routes for the EMBEDDED engine, so `download-client` is uniformly
/// resolvable: `provides` names `rqbit`, and a consumer resolving that instance
/// has to reach an engine rather than a 404. This module's own code takes the
/// in-process path instead and never comes through here.
pub fn routes<S: kroma_module_sdk::host::HostCtx + Clone + Send + Sync + 'static>(
) -> axum::Router<S> {
    use axum::routing::post;

    axum::Router::new()
        .route("/_port/tv.kroma.torrents/client/caps", post(caps_h))
        .route("/_port/tv.kroma.torrents/client/test", post(test_h::<S>))
        .route("/_port/tv.kroma.torrents/client/add", post(add_h::<S>))
        .route(
            "/_port/tv.kroma.torrents/client/status",
            post(status_h::<S>),
        )
        .route("/_port/tv.kroma.torrents/client/pause", post(pause_h::<S>))
        .route(
            "/_port/tv.kroma.torrents/client/resume",
            post(resume_h::<S>),
        )
        .route(
            "/_port/tv.kroma.torrents/client/reannounce",
            post(reannounce_h::<S>),
        )
        .route(
            "/_port/tv.kroma.torrents/client/remove",
            post(remove_h::<S>),
        )
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Args {
    magnet_or_url: String,
    protocol: String,
    name: String,
    download_dir: Option<String>,
    label: String,
    client_ref: String,
    delete_data: bool,
}

#[derive(Deserialize)]
struct Call {
    #[serde(default)]
    args: Args,
}

fn embedded<S: kroma_module_sdk::host::HostCtx>(
    host: &S,
) -> anyhow::Result<Box<dyn DownloadClient>> {
    let manager = kroma_module_sdk::host::service::<crate::DownloadManager>(host)
        .ok_or_else(|| anyhow::anyhow!("the download manager is not running yet"))?;
    let engine = manager
        .rqbit()
        .ok_or_else(|| anyhow::anyhow!("the embedded engine is not started"))?;
    Ok(engine.client())
}

async fn caps_h() -> axum::Json<Result<serde_json::Value, String>> {
    axum::Json(Ok(json!({ "protocols": [TORRENT] })))
}

async fn test_h<S: kroma_module_sdk::host::HostCtx + Clone + Send + Sync + 'static>(
    axum::extract::State(host): axum::extract::State<S>,
    axum::Json(_call): axum::Json<Call>,
) -> axum::Json<Result<String, String>> {
    kroma_module_sdk::host::port_reply(move || embedded(&host)?.test()).await
}

async fn add_h<S: kroma_module_sdk::host::HostCtx + Clone + Send + Sync + 'static>(
    axum::extract::State(host): axum::extract::State<S>,
    axum::Json(call): axum::Json<Call>,
) -> axum::Json<Result<String, String>> {
    kroma_module_sdk::host::port_reply(move || {
        embedded(&host)?.add(&AddTorrentReq {
            magnet_or_url: &call.args.magnet_or_url,
            protocol: &call.args.protocol,
            name: &call.args.name,
            download_dir: call.args.download_dir.as_deref(),
            label: &call.args.label,
            only_files: None,
            torrent_bytes: None,
        })
    })
    .await
}

async fn status_h<S: kroma_module_sdk::host::HostCtx + Clone + Send + Sync + 'static>(
    axum::extract::State(host): axum::extract::State<S>,
    axum::Json(call): axum::Json<Call>,
) -> axum::Json<Option<TorrentStatus>> {
    let found = kroma_module_sdk::host::run_blocking(move || {
        embedded(&host)
            .ok()?
            .status(&call.args.client_ref)
            .ok()
            .flatten()
    })
    .await
    .ok()
    .flatten();
    axum::Json(found)
}

async fn pause_h<S: kroma_module_sdk::host::HostCtx + Clone + Send + Sync + 'static>(
    axum::extract::State(host): axum::extract::State<S>,
    axum::Json(call): axum::Json<Call>,
) -> axum::Json<Result<(), String>> {
    kroma_module_sdk::host::port_reply(move || embedded(&host)?.pause(&call.args.client_ref)).await
}

async fn resume_h<S: kroma_module_sdk::host::HostCtx + Clone + Send + Sync + 'static>(
    axum::extract::State(host): axum::extract::State<S>,
    axum::Json(call): axum::Json<Call>,
) -> axum::Json<Result<(), String>> {
    kroma_module_sdk::host::port_reply(move || embedded(&host)?.resume(&call.args.client_ref)).await
}

async fn reannounce_h<S: kroma_module_sdk::host::HostCtx + Clone + Send + Sync + 'static>(
    axum::extract::State(host): axum::extract::State<S>,
    axum::Json(call): axum::Json<Call>,
) -> axum::Json<Result<(), String>> {
    kroma_module_sdk::host::port_reply(move || embedded(&host)?.reannounce(&call.args.client_ref))
        .await
}

async fn remove_h<S: kroma_module_sdk::host::HostCtx + Clone + Send + Sync + 'static>(
    axum::extract::State(host): axum::extract::State<S>,
    axum::Json(call): axum::Json<Call>,
) -> axum::Json<Result<(), String>> {
    kroma_module_sdk::host::port_reply(move || {
        embedded(&host)?.remove(&call.args.client_ref, call.args.delete_data)
    })
    .await
}

#[cfg(test)]
mod tests;

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

use super::{AddTorrentReq, ClientDef, DownloadClient, TorrentFileEntry, TorrentStatus};
#[cfg(test)]
use super::TorrentState;

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

    fn add(&self, req: &AddTorrentReq) -> anyhow::Result<String> {
        // `only_files` and `torrent_bytes` are not sent: no external engine reads
        // them (file selection is the embedded engine's, and a pre-fetched
        // `.torrent` is a URL to an external client). An engine that wants either
        // gets a new key, which is additive.
        self.ask(
            "add",
            json!({
                "magnet_or_url": req.magnet_or_url,
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
        self.ask("remove", json!({ "client_ref": client_ref, "delete_data": delete_data }))
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
        .route("/_port/tv.kroma.torrents/client/test", post(test_h::<S>))
        .route("/_port/tv.kroma.torrents/client/add", post(add_h::<S>))
        .route("/_port/tv.kroma.torrents/client/status", post(status_h::<S>))
        .route("/_port/tv.kroma.torrents/client/pause", post(pause_h::<S>))
        .route("/_port/tv.kroma.torrents/client/resume", post(resume_h::<S>))
        .route("/_port/tv.kroma.torrents/client/reannounce", post(reannounce_h::<S>))
        .route("/_port/tv.kroma.torrents/client/remove", post(remove_h::<S>))
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Args {
    magnet_or_url: String,
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
    let found = tokio::task::spawn_blocking(move || {
        embedded(&host).ok()?.status(&call.args.client_ref).ok().flatten()
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
    kroma_module_sdk::host::port_reply(move || {
        embedded(&host)?.reannounce(&call.args.client_ref)
    })
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
mod tests {
    use super::*;

    use kroma_module_sdk::host::testing::StubHost;

    fn def(kind: &str) -> ClientDef {
        ClientDef {
            kind: kind.into(),
            url: "http://nas:8080".into(),
            username: "u".into(),
            password: "p".into(),
        }
    }

    #[test]
    fn an_engine_nobody_answers_for_does_not_build() {
        let host = StubHost::new();

        assert!(RemoteEngine::new(&host, def("qbittorrent")).is_none());
    }

    // An engine is picked by INSTANCE, so two of them answering at once each get
    // the downloads their own client row names.
    #[test]
    fn each_kind_resolves_to_its_own_engine() {
        let host = StubHost::new()
            .with_point(DOWNLOAD_CLIENT, Some("qbittorrent"), "http://127.0.0.1:1", "t")
            .with_point(DOWNLOAD_CLIENT, Some("transmission"), "http://127.0.0.1:2", "t");

        assert!(RemoteEngine::new(&host, def("qbittorrent")).is_some());
        assert!(RemoteEngine::new(&host, def("transmission")).is_some());
        assert!(RemoteEngine::new(&host, def("deluge")).is_none(), "nothing answers for deluge");
    }

    // The engine needs the client row's credentials with every call: it is
    // stateless about which of the operator's clients it is serving.
    #[test]
    fn every_call_carries_the_client_it_is_for() {
        let body = json!({ "client": def("qbittorrent"), "args": { "client_ref": "abc" } });

        let parsed: EngineCall = serde_json::from_value(body).unwrap();

        assert_eq!(parsed.client.kind, "qbittorrent");
        assert_eq!(parsed.client.url, "http://nas:8080");
        assert_eq!(parsed.client.password, "p");
        assert_eq!(parsed.args["client_ref"], "abc");
    }

    #[test]
    fn an_add_sends_the_three_fields_an_external_engine_reads() {
        let req = AddTorrentReq {
            magnet_or_url: "magnet:?xt=urn:btih:AB",
            download_dir: Some("/downloads"),
            label: "kroma",
            only_files: Some(&[0, 2]),
            torrent_bytes: Some(b"d8:announce"),
        };

        let sent = json!({
            "magnet_or_url": req.magnet_or_url,
            "download_dir": req.download_dir,
            "label": req.label,
        });

        assert_eq!(sent["magnet_or_url"], "magnet:?xt=urn:btih:AB");
        assert_eq!(sent["download_dir"], "/downloads");
        assert_eq!(sent["label"], "kroma");
        assert_eq!(sent.as_object().unwrap().len(), 3);
    }

    // A fake engine module: the routes a `download-client` provider serves, with
    // its own hand-written JSON. Driving the client against THIS is the only way
    // to catch a key renamed on one side only, because the two ends share no type.
    fn fake_engine() -> axum::Router<()> {
        use axum::routing::post;
        use axum::Json;
        use serde_json::Value;

        // Every method echoes what it was handed, so a test can assert the client
        // sent the right thing rather than only that the call returned.
        async fn test(Json(call): Json<Value>) -> Json<Result<String, String>> {
            Json(Ok(format!(
                "engine at {} as {}",
                call["client"]["url"].as_str().unwrap_or("?"),
                call["client"]["username"].as_str().unwrap_or("?")
            )))
        }

        async fn add(Json(call): Json<Value>) -> Json<Result<String, String>> {
            let args = &call["args"];
            assert!(args["only_files"].is_null(), "only_files must not cross");
            assert!(args["torrent_bytes"].is_null(), "torrent_bytes must not cross");
            Json(Ok(format!(
                "{}|{}|{}",
                args["magnet_or_url"].as_str().unwrap_or("?"),
                args["download_dir"].as_str().unwrap_or("-"),
                args["label"].as_str().unwrap_or("?")
            )))
        }

        async fn status(Json(call): Json<Value>) -> Json<Option<serde_json::Value>> {
            if call["args"]["client_ref"] == "forgotten" {
                return Json(None);
            }
            Json(Some(serde_json::json!({
                "client_ref": call["args"]["client_ref"],
                "name": "The.Matrix",
                "info_hash": "ab",
                "progress": 0.25,
                "state": "downloading",
                "down_bps": 11,
                "up_bps": 22,
                "peers": 3,
                "peers_seen": 9,
                "size_bytes": 42,
                "save_path": "/downloads/x",
                "files": ["a.mkv"],
                "error": null,
            })))
        }

        async fn ok(Json(_): Json<Value>) -> Json<Result<(), String>> {
            Json(Ok(()))
        }

        async fn refuse(Json(_): Json<Value>) -> Json<Result<(), String>> {
            Json(Err("the daemon said no".into()))
        }

        axum::Router::new()
            .route("/_port/tv.kroma.torrents/client/test", post(test))
            .route("/_port/tv.kroma.torrents/client/add", post(add))
            .route("/_port/tv.kroma.torrents/client/status", post(status))
            .route("/_port/tv.kroma.torrents/client/pause", post(ok))
            .route("/_port/tv.kroma.torrents/client/resume", post(ok))
            .route("/_port/tv.kroma.torrents/client/reannounce", post(ok))
            .route("/_port/tv.kroma.torrents/client/remove", post(refuse))
    }

    async fn engine_on(port_name: &str) -> (StubHost, String) {
        let resolve = kroma_module_host::test_serve::serve(fake_engine(), ()).await;
        let (base, token) = resolve().expect("the fake engine is up");
        let host = StubHost::new().with_point(DOWNLOAD_CLIENT, Some(port_name), &base, &token);
        (host, base)
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn the_client_row_reaches_the_engine_with_every_call() {
        let (host, _) = engine_on("qbittorrent").await;
        let engine = RemoteEngine::new(&host, def("qbittorrent")).unwrap();

        let reported = kroma_module_host::test_serve::blocking(move || engine.test()).await.unwrap();

        // The engine is stateless about which client it serves, so an operator with
        // two qBittorrents gets the right one only if this crosses per call.
        assert_eq!(reported, "engine at http://nas:8080 as u");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn an_add_sends_the_link_the_directory_and_the_label_and_nothing_else() {
        let (host, _) = engine_on("qbittorrent").await;
        let engine = RemoteEngine::new(&host, def("qbittorrent")).unwrap();

        let reference = kroma_module_host::test_serve::blocking(move || {
            engine.add(&AddTorrentReq {
                magnet_or_url: "magnet:?xt=urn:btih:AB",
                download_dir: Some("/downloads"),
                label: "kroma",
                only_files: Some(&[0, 2]),
                torrent_bytes: Some(b"d8:announce"),
            })
        })
        .await
        .unwrap();

        assert_eq!(reference, "magnet:?xt=urn:btih:AB|/downloads|kroma");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_status_crosses_field_for_field() {
        let (host, _) = engine_on("qbittorrent").await;
        let engine = RemoteEngine::new(&host, def("qbittorrent")).unwrap();

        let status = kroma_module_host::test_serve::blocking(move || engine.status("abc"))
            .await
            .unwrap()
            .expect("the engine knows this torrent");

        assert_eq!(status.client_ref, "abc");
        assert_eq!(status.name, "The.Matrix");
        assert_eq!(status.progress, 0.25);
        assert_eq!(status.state, TorrentState::Downloading);
        assert_eq!(status.down_bps, 11);
        assert_eq!(status.up_bps, 22);
        assert_eq!(status.peers, 3);
        assert_eq!(status.peers_seen, 9);
        assert_eq!(status.size_bytes, 42);
        assert_eq!(status.save_path.as_deref(), Some("/downloads/x"));
        assert_eq!(status.files, vec!["a.mkv".to_string()]);
        assert_eq!(status.error, None);
    }

    // A torrent the engine has forgotten is `None`, not an error: the queue
    // reconciles it, and an error here would fail the whole monitor tick.
    #[tokio::test(flavor = "multi_thread")]
    async fn a_torrent_the_engine_forgot_is_none_rather_than_an_error() {
        let (host, _) = engine_on("qbittorrent").await;
        let engine = RemoteEngine::new(&host, def("qbittorrent")).unwrap();

        let status = kroma_module_host::test_serve::blocking(move || engine.status("forgotten"))
            .await
            .unwrap();

        assert!(status.is_none());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn the_lifecycle_calls_reach_the_engine_and_a_refusal_comes_back()
    {
        let (host, _) = engine_on("qbittorrent").await;
        let engine = RemoteEngine::new(&host, def("qbittorrent")).unwrap();

        let outcome = kroma_module_host::test_serve::blocking(move || {
            (
                engine.pause("abc"),
                engine.resume("abc"),
                engine.reannounce("abc"),
                engine.remove("abc", true),
            )
        })
        .await;

        assert!(outcome.0.is_ok());
        assert!(outcome.1.is_ok());
        assert!(outcome.2.is_ok());
        // The provider's `Err` envelope has to surface as an error, or a failed
        // removal would read as a successful one.
        let refused = outcome.3.unwrap_err().to_string();
        assert!(refused.contains("the daemon said no"), "{refused}");
    }

    // Resolution is by INSTANCE, so an engine answering under another kind must
    // not be handed this client's downloads.
    #[tokio::test(flavor = "multi_thread")]
    async fn a_client_whose_kind_nothing_answers_does_not_reach_the_engine_that_is_up() {
        let (host, _) = engine_on("transmission").await;

        assert!(RemoteEngine::new(&host, def("qbittorrent")).is_none());
        assert!(RemoteEngine::new(&host, def("transmission")).is_some());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn an_engine_that_stopped_answering_fails_the_call_rather_than_hanging() {
        // Resolved while it was up, then pointed at a port with nothing on it.
        let host = StubHost::new().with_point(
            DOWNLOAD_CLIENT,
            Some("qbittorrent"),
            "http://127.0.0.1:1",
            "t",
        );
        let engine = RemoteEngine::new(&host, def("qbittorrent")).unwrap();

        let failed = kroma_module_host::test_serve::blocking(move || engine.test()).await;

        assert!(failed.is_err());
    }

    #[test]
    fn the_kind_reported_is_the_point_rather_than_a_leaked_name() {
        let host = StubHost::new().with_point(
            DOWNLOAD_CLIENT,
            Some("qbittorrent"),
            "http://127.0.0.1:1",
            "t",
        );

        let engine = RemoteEngine::new(&host, def("qbittorrent")).unwrap();

        assert_eq!(engine.kind(), DOWNLOAD_CLIENT);
    }

    #[test]
    fn listing_files_fails_without_a_round_trip() {
        let host = StubHost::new().with_point(
            DOWNLOAD_CLIENT,
            Some("qbittorrent"),
            "http://127.0.0.1:0",
            "t",
        );
        let engine = RemoteEngine::new(&host, def("qbittorrent")).unwrap();

        // Port 0 is not listening, so a round trip would fail differently.
        let err = engine.list_files("magnet:?xt=1", None).unwrap_err().to_string();

        assert!(err.contains("cannot list a torrent's files"), "{err}");
    }
}

//! Bridges for the downloads module's provider ports: `DownloadGrabPort` (grab /
//! list-files / gate / activate / drop) and `DownloadDbPort` (the ledger
//! reads/writes acquisition's import pass needs). Provided by the torrents
//! sidecar, consumed by the acquisition sidecar. Every `&dyn HostCtx` argument is
//! dropped from the wire and re-supplied locally on the provider side (which runs
//! the call against its OWN host: the download manager + engine live there).

use std::sync::Arc;

use axum::extract::State;
use axum::routing::post;
use axum::{Extension, Json, Router};
use kroma_module_host::HostCtx;
use kroma_module_sdk::ports::{
    DownloadDbPort, DownloadGrabPort, DownloadRow, GrabSpec, TorrentFileEntry,
};
use serde::Deserialize;
use serde_json::json;

use crate::{call, call_raw, Resolver};

/// Routes the torrents sidecar mounts for its two download provider ports.
pub fn download_routes<S: HostCtx + Clone + Send + Sync + 'static>(
    grab: Arc<dyn DownloadGrabPort>,
    db: Arc<dyn DownloadDbPort>,
) -> Router<S> {
    Router::new()
        .route("/_port/downloadgrab/grab", post(grab_h::<S>))
        .route("/_port/downloadgrab/list_files", post(list_files_h::<S>))
        .route("/_port/downloadgrab/gate_open", post(gate_open_h::<S>))
        .route("/_port/downloadgrab/activate", post(activate_h::<S>))
        .route("/_port/downloadgrab/drop_data", post(drop_data_h::<S>))
        .route("/_port/downloaddb/completed", post(completed_h::<S>))
        .route("/_port/downloaddb/mark_imported", post(mark_imported_h::<S>))
        .route("/_port/downloaddb/set_status", post(set_status_h::<S>))
        .layer(Extension(grab))
        .layer(Extension(db))
}

/// Run a blocking provider call into the `Result<T, String>` wire envelope.
async fn blocking_env<T: Send + 'static>(
    job: impl FnOnce() -> anyhow::Result<T> + Send + 'static,
) -> Json<Result<T, String>> {
    Json(
        tokio::task::spawn_blocking(job)
            .await
            .map_err(|e| e.to_string())
            .and_then(|r| r.map_err(|e| format!("{e:#}"))),
    )
}

// --- DownloadGrabPort --------------------------------------------------------

async fn grab_h<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Extension(grab): Extension<Arc<dyn DownloadGrabPort>>,
    Json(spec): Json<GrabSpec>,
) -> Json<Result<DownloadRow, String>> {
    blocking_env(move || grab.grab(&host, spec)).await
}

#[derive(Deserialize)]
struct MagnetReq {
    magnet_or_url: String,
}

async fn list_files_h<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Extension(grab): Extension<Arc<dyn DownloadGrabPort>>,
    Json(req): Json<MagnetReq>,
) -> Json<Result<Vec<TorrentFileEntry>, String>> {
    blocking_env(move || grab.list_files(&host, &req.magnet_or_url)).await
}

async fn gate_open_h<S: HostCtx + Clone + Send + Sync + 'static>(
    Extension(grab): Extension<Arc<dyn DownloadGrabPort>>,
) -> Json<bool> {
    Json(grab.gate_open())
}

async fn activate_h<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Extension(grab): Extension<Arc<dyn DownloadGrabPort>>,
    Json(row): Json<DownloadRow>,
) -> Json<()> {
    // Infallible on the contract; run it on a blocking thread (engine add) and ack.
    let _ = tokio::task::spawn_blocking(move || grab.activate(&host, &row)).await;
    Json(())
}

async fn drop_data_h<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Extension(grab): Extension<Arc<dyn DownloadGrabPort>>,
    Json(row): Json<DownloadRow>,
) -> Json<()> {
    let _ = tokio::task::spawn_blocking(move || grab.drop_data(&host, &row)).await;
    Json(())
}

// --- DownloadDbPort ----------------------------------------------------------

async fn completed_h<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Extension(db): Extension<Arc<dyn DownloadDbPort>>,
) -> Json<Result<Vec<DownloadRow>, String>> {
    blocking_env(move || db.completed_downloads(&host)).await
}

#[derive(Deserialize)]
struct MarkImportedReq {
    id: String,
    paths: Vec<String>,
    now_ms: i64,
}

async fn mark_imported_h<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Extension(db): Extension<Arc<dyn DownloadDbPort>>,
    Json(req): Json<MarkImportedReq>,
) -> Json<Result<(), String>> {
    blocking_env(move || db.mark_download_imported(&host, &req.id, &req.paths, req.now_ms)).await
}

#[derive(Deserialize)]
struct SetStatusReq {
    id: String,
    status: String,
    error: Option<String>,
}

async fn set_status_h<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Extension(db): Extension<Arc<dyn DownloadDbPort>>,
    Json(req): Json<SetStatusReq>,
) -> Json<Result<bool, String>> {
    blocking_env(move || db.set_download_status(&host, &req.id, &req.status, req.error.as_deref())).await
}

// --- Consumer-side clients ---------------------------------------------------

pub struct DownloadGrabClient {
    resolve: Resolver,
}
pub struct DownloadDbClient {
    resolve: Resolver,
}

impl DownloadGrabClient {
    pub fn new(resolve: Resolver) -> Self {
        Self { resolve }
    }
}
impl DownloadDbClient {
    pub fn new(resolve: Resolver) -> Self {
        Self { resolve }
    }
}

impl DownloadGrabPort for DownloadGrabClient {
    fn grab(&self, _host: &dyn HostCtx, spec: GrabSpec) -> anyhow::Result<DownloadRow> {
        call(&self.resolve, "downloadgrab/grab", &spec)
    }
    fn list_files(
        &self,
        _host: &dyn HostCtx,
        magnet_or_url: &str,
    ) -> anyhow::Result<Vec<TorrentFileEntry>> {
        call(&self.resolve, "downloadgrab/list_files", &json!({ "magnet_or_url": magnet_or_url }))
    }
    fn gate_open(&self) -> bool {
        // A transient bridge hiccup shouldn't silently disable acquisition; grab()
        // re-checks the gate authoritatively on the provider side, so default open.
        call_raw(&self.resolve, "downloadgrab/gate_open", &json!({})).unwrap_or(true)
    }
    fn activate(&self, _host: &dyn HostCtx, row: &DownloadRow) {
        let _: anyhow::Result<()> = call_raw(&self.resolve, "downloadgrab/activate", row);
    }
    fn drop_data(&self, _host: &dyn HostCtx, row: &DownloadRow) {
        let _: anyhow::Result<()> = call_raw(&self.resolve, "downloadgrab/drop_data", row);
    }
}

impl DownloadDbPort for DownloadDbClient {
    fn completed_downloads(&self, _host: &dyn HostCtx) -> anyhow::Result<Vec<DownloadRow>> {
        call(&self.resolve, "downloaddb/completed", &json!({}))
    }
    fn mark_download_imported(
        &self,
        _host: &dyn HostCtx,
        id: &str,
        paths: &[String],
        now_ms: i64,
    ) -> anyhow::Result<()> {
        call(
            &self.resolve,
            "downloaddb/mark_imported",
            &json!({ "id": id, "paths": paths, "now_ms": now_ms }),
        )
    }
    fn set_download_status(
        &self,
        _host: &dyn HostCtx,
        id: &str,
        status: &str,
        error: Option<&str>,
    ) -> anyhow::Result<bool> {
        call(
            &self.resolve,
            "downloaddb/set_status",
            &json!({ "id": id, "status": status, "error": error }),
        )
    }
}

#[cfg(test)]
mod tests {
    // `use super::*` re-exports the parent imports (Arc, HostCtx, the axum
    // extractors, the ports + wire types, call/call_raw/Resolver).
    use super::*;

    // --- Test doubles ---------------------------------------------------------

    #[derive(Clone)]
    struct MockHost;
    impl HostCtx for MockHost {
        fn db(&self) -> &kroma_module_sdk::db::Pool {
            unimplemented!("db is not touched by the bridge handlers")
        }
        fn data_dir(&self) -> &std::path::Path {
            std::path::Path::new("/tmp")
        }
        fn require(
            &self,
            _user: &kroma_module_sdk::domain::User,
            _perm: kroma_module_sdk::domain::Permission,
        ) -> Result<(), axum::response::Response> {
            Ok(())
        }
        fn require_any_admin(
            &self,
            _user: &kroma_module_sdk::domain::User,
        ) -> Result<(), axum::response::Response> {
            Ok(())
        }
        fn lerr(
            &self,
            _user: &kroma_module_sdk::domain::User,
            _status: axum::http::StatusCode,
            _key: &str,
        ) -> axum::response::Response {
            unimplemented!()
        }
        fn setting_str(&self, _key: &str, default: &str) -> String {
            default.to_string()
        }
        fn setting_bool(&self, _key: &str, default: bool) -> bool {
            default
        }
        fn setting_i64(&self, _key: &str, default: i64) -> i64 {
            default
        }
        fn set_settings(&self, _patch: std::collections::BTreeMap<String, serde_json::Value>) {}
        fn publish(&self, _event: kroma_module_host::Event) {}
        fn trigger_job(&self, _key: &'static str, _reason: &'static str) {}
        fn module_enabled(&self, _id: &str) -> bool {
            true
        }
        fn library_folders(&self) -> Vec<kroma_module_host::LibraryFolders> {
            Vec::new()
        }
        fn tmdb_api_key(&self) -> Option<String> {
            None
        }
        fn metadata_language(&self) -> String {
            "en".into()
        }
        fn get_service(
            &self,
            _type_id: std::any::TypeId,
        ) -> Option<Arc<dyn std::any::Any + Send + Sync>> {
            None
        }
    }

    fn sample_download_row(id: &str) -> DownloadRow {
        DownloadRow {
            id: id.into(),
            client_id: "client".into(),
            client_ref: "hash".into(),
            request_id: None,
            kind: "movie".into(),
            tmdb_id: 1,
            title: Some("Movie".into()),
            year: Some(2020),
            season: None,
            episodes: None,
            release_title: "Movie.2020.1080p".into(),
            indexer_id: None,
            info_hash: Some("hash".into()),
            magnet_or_url: "magnet:?xt=1".into(),
            size_bytes: Some(100),
            score: Some(10),
            score_breakdown: None,
            status: "queued".into(),
            progress: 0.0,
            save_path: None,
            imported_paths: None,
            error: None,
            grabbed_at: 0,
            completed_at: None,
            imported_at: None,
            details_url: None,
            only_files: None,
        }
    }

    struct OkGrab {
        gate: bool,
    }
    impl DownloadGrabPort for OkGrab {
        fn grab(&self, _h: &dyn HostCtx, _spec: GrabSpec) -> anyhow::Result<DownloadRow> {
            Ok(sample_download_row("grabbed"))
        }
        fn list_files(
            &self,
            _h: &dyn HostCtx,
            _magnet_or_url: &str,
        ) -> anyhow::Result<Vec<TorrentFileEntry>> {
            Ok(vec![TorrentFileEntry { index: 0, path: "a.mkv".into(), size_bytes: 10 }])
        }
        fn gate_open(&self) -> bool {
            self.gate
        }
        fn activate(&self, _h: &dyn HostCtx, _row: &DownloadRow) {}
        fn drop_data(&self, _h: &dyn HostCtx, _row: &DownloadRow) {}
    }

    struct ErrGrab;
    impl DownloadGrabPort for ErrGrab {
        fn grab(&self, _h: &dyn HostCtx, _spec: GrabSpec) -> anyhow::Result<DownloadRow> {
            Err(anyhow::anyhow!("boom"))
        }
        fn list_files(
            &self,
            _h: &dyn HostCtx,
            _magnet_or_url: &str,
        ) -> anyhow::Result<Vec<TorrentFileEntry>> {
            Err(anyhow::anyhow!("boom"))
        }
        fn gate_open(&self) -> bool {
            false
        }
        fn activate(&self, _h: &dyn HostCtx, _row: &DownloadRow) {}
        fn drop_data(&self, _h: &dyn HostCtx, _row: &DownloadRow) {}
    }

    struct OkDb;
    impl DownloadDbPort for OkDb {
        fn completed_downloads(&self, _h: &dyn HostCtx) -> anyhow::Result<Vec<DownloadRow>> {
            Ok(vec![sample_download_row("done")])
        }
        fn mark_download_imported(
            &self,
            _h: &dyn HostCtx,
            _id: &str,
            _paths: &[String],
            _now_ms: i64,
        ) -> anyhow::Result<()> {
            Ok(())
        }
        fn set_download_status(
            &self,
            _h: &dyn HostCtx,
            _id: &str,
            _status: &str,
            _error: Option<&str>,
        ) -> anyhow::Result<bool> {
            Ok(true)
        }
    }

    struct ErrDb;
    impl DownloadDbPort for ErrDb {
        fn completed_downloads(&self, _h: &dyn HostCtx) -> anyhow::Result<Vec<DownloadRow>> {
            Err(anyhow::anyhow!("boom"))
        }
        fn mark_download_imported(
            &self,
            _h: &dyn HostCtx,
            _id: &str,
            _paths: &[String],
            _now_ms: i64,
        ) -> anyhow::Result<()> {
            Err(anyhow::anyhow!("boom"))
        }
        fn set_download_status(
            &self,
            _h: &dyn HostCtx,
            _id: &str,
            _status: &str,
            _error: Option<&str>,
        ) -> anyhow::Result<bool> {
            Err(anyhow::anyhow!("boom"))
        }
    }

    fn offline() -> Resolver {
        Arc::new(|| None)
    }

    // --- Provider-side handler tests -----------------------------------------

    #[tokio::test]
    async fn grab_handler_returns_row() {
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(OkGrab { gate: true });
        let spec = GrabSpec { magnet_or_url: "magnet:?xt=1".into(), ..Default::default() };
        let Json(res) = grab_h::<MockHost>(State(MockHost), Extension(grab), Json(spec)).await;
        assert_eq!(res.unwrap().id, "grabbed");
    }

    #[tokio::test]
    async fn grab_handler_maps_error() {
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(ErrGrab);
        let Json(res) =
            grab_h::<MockHost>(State(MockHost), Extension(grab), Json(GrabSpec::default())).await;
        assert_eq!(res.unwrap_err(), "boom");
    }

    #[tokio::test]
    async fn list_files_handler_returns_entries() {
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(OkGrab { gate: true });
        let req = MagnetReq { magnet_or_url: "magnet:?xt=1".into() };
        let Json(res) =
            list_files_h::<MockHost>(State(MockHost), Extension(grab), Json(req)).await;
        let files = res.unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "a.mkv");
    }

    #[tokio::test]
    async fn gate_open_handler_reflects_engine() {
        let open: Arc<dyn DownloadGrabPort> = Arc::new(OkGrab { gate: true });
        let Json(v) = gate_open_h::<MockHost>(Extension(open)).await;
        assert!(v);

        let closed: Arc<dyn DownloadGrabPort> = Arc::new(OkGrab { gate: false });
        let Json(v) = gate_open_h::<MockHost>(Extension(closed)).await;
        assert!(!v);
    }

    #[tokio::test]
    async fn activate_and_drop_handlers_ack() {
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(OkGrab { gate: true });
        let row = sample_download_row("x");
        let Json(()) =
            activate_h::<MockHost>(State(MockHost), Extension(grab.clone()), Json(row.clone())).await;
        let Json(()) = drop_data_h::<MockHost>(State(MockHost), Extension(grab), Json(row)).await;
    }

    #[tokio::test]
    async fn completed_handler_returns_rows() {
        let db: Arc<dyn DownloadDbPort> = Arc::new(OkDb);
        let Json(res) = completed_h::<MockHost>(State(MockHost), Extension(db)).await;
        assert_eq!(res.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn completed_handler_maps_error() {
        let db: Arc<dyn DownloadDbPort> = Arc::new(ErrDb);
        let Json(res) = completed_h::<MockHost>(State(MockHost), Extension(db)).await;
        assert_eq!(res.unwrap_err(), "boom");
    }

    #[tokio::test]
    async fn mark_imported_handler_acks() {
        let db: Arc<dyn DownloadDbPort> = Arc::new(OkDb);
        let req = MarkImportedReq { id: "id".into(), paths: vec!["a".into()], now_ms: 7 };
        let Json(res) = mark_imported_h::<MockHost>(State(MockHost), Extension(db), Json(req)).await;
        assert!(res.is_ok());
    }

    #[tokio::test]
    async fn set_status_handler_returns_bool() {
        let db: Arc<dyn DownloadDbPort> = Arc::new(OkDb);
        let req = SetStatusReq { id: "id".into(), status: "done".into(), error: None };
        let Json(res) = set_status_h::<MockHost>(State(MockHost), Extension(db), Json(req)).await;
        assert!(res.unwrap());
    }

    // --- Consumer-side client tests (offline resolver) ------------------------

    #[test]
    fn grab_client_offline_behavior() {
        let c = DownloadGrabClient::new(offline());
        assert!(c.grab(&MockHost, GrabSpec::default()).is_err());
        assert!(c.list_files(&MockHost, "magnet:?xt=1").is_err());
        // A transport hiccup defaults the gate OPEN (grab re-checks authoritatively).
        assert!(c.gate_open());
        // Infallible fire-and-forget calls must not panic when offline.
        let row = sample_download_row("x");
        c.activate(&MockHost, &row);
        c.drop_data(&MockHost, &row);
    }

    #[test]
    fn db_client_offline_errors() {
        let c = DownloadDbClient::new(offline());
        assert!(c.completed_downloads(&MockHost).is_err());
        assert!(c.mark_download_imported(&MockHost, "id", &["p".to_string()], 0).is_err());
        assert!(c.set_download_status(&MockHost, "id", "done", None).is_err());
    }

    // --- Wire-struct serde ----------------------------------------------------

    #[test]
    fn wire_requests_deserialize() {
        let m: MagnetReq =
            serde_json::from_value(serde_json::json!({ "magnet_or_url": "magnet:?xt=1" })).unwrap();
        assert_eq!(m.magnet_or_url, "magnet:?xt=1");

        let mi: MarkImportedReq = serde_json::from_value(
            serde_json::json!({ "id": "d1", "paths": ["a.mkv", "b.mkv"], "now_ms": 42 }),
        )
        .unwrap();
        assert_eq!(mi.id, "d1");
        assert_eq!(mi.paths, vec!["a.mkv".to_string(), "b.mkv".to_string()]);
        assert_eq!(mi.now_ms, 42);

        // `error` is optional and defaults to absent.
        let ss: SetStatusReq =
            serde_json::from_value(serde_json::json!({ "id": "d1", "status": "failed", "error": "boom" }))
                .unwrap();
        assert_eq!(ss.status, "failed");
        assert_eq!(ss.error.as_deref(), Some("boom"));
        let ss: SetStatusReq =
            serde_json::from_value(serde_json::json!({ "id": "d1", "status": "done" })).unwrap();
        assert!(ss.error.is_none());
    }
    // --- A live round trip over the real bridge -----------------------------------
    //
    // Everything above drives one side or the other. This mounts the REAL router
    // on a real port and points a REAL client at it, so the wire itself is under
    // test: the `/_port/<port>/<method>` paths, the bearer token, the
    // `Result<T, String>` envelope, and the JSON shape of every boundary type.
    // Those only ever disagree at runtime, in a sidecar, which is the worst place
    // to find out.

    /// Serve `router` on an ephemeral port and return a resolver pointing at it.
    async fn serve<S: HostCtx + Clone + Send + Sync + 'static>(
        router: Router<S>,
        state: S,
    ) -> Resolver {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let app = router.with_state(state);
        tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });
        let base = format!("http://{addr}");
        Arc::new(move || Some((base.clone(), "test-token".to_string())))
    }

    /// Run a blocking port call off the runtime thread, so the server can answer.
    async fn blocking<T: Send + 'static>(job: impl FnOnce() -> T + Send + 'static) -> T {
        tokio::task::spawn_blocking(job).await.unwrap()
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn every_grab_verb_survives_the_round_trip() {
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(OkGrab { gate: true });
        let db: Arc<dyn DownloadDbPort> = Arc::new(OkDb);
        let resolve = serve(download_routes::<MockHost>(grab, db), MockHost).await;

        let client = DownloadGrabClient::new(resolve);
        let row = blocking(move || {
            let spec = GrabSpec { magnet_or_url: "magnet:?xt=1".into(), ..Default::default() };
            client.grab(&MockHost, spec)
        })
        .await
        .unwrap();
        // The whole DownloadRow made it across, not just the id: every field here
        // is one the importer reads on the far side.
        assert_eq!(row.id, "grabbed");
        assert_eq!(row.release_title, "Movie.2020.1080p");
        assert_eq!(row.tmdb_id, 1);
        assert_eq!(row.info_hash.as_deref(), Some("hash"));
        assert_eq!(row.size_bytes, Some(100));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_file_listing_survives_the_round_trip() {
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(OkGrab { gate: true });
        let db: Arc<dyn DownloadDbPort> = Arc::new(OkDb);
        let resolve = serve(download_routes::<MockHost>(grab, db), MockHost).await;

        let client = DownloadGrabClient::new(resolve);
        let files =
            blocking(move || client.list_files(&MockHost, "magnet:?xt=1")).await.unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "a.mkv");
        assert_eq!(files[0].size_bytes, 10);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn the_gate_is_read_from_the_provider_when_it_is_reachable() {
        // The client defaults OPEN when the bridge is down, so a closed gate is
        // only ever observable through a working round trip - which makes this
        // the test that proves the default is not masking everything.
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(OkGrab { gate: false });
        let db: Arc<dyn DownloadDbPort> = Arc::new(OkDb);
        let resolve = serve(download_routes::<MockHost>(grab, db), MockHost).await;

        let client = DownloadGrabClient::new(resolve);
        assert!(!blocking(move || client.gate_open()).await);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_provider_error_crosses_the_wire_as_an_error() {
        // The envelope is `Result<T, String>`; losing the Err arm would turn a
        // failed grab into a successful one carrying nonsense.
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(ErrGrab);
        let db: Arc<dyn DownloadDbPort> = Arc::new(ErrDb);
        let resolve = serve(download_routes::<MockHost>(grab, db), MockHost).await;

        let grab_client = DownloadGrabClient::new(resolve.clone());
        let err = blocking(move || {
            let spec = GrabSpec { magnet_or_url: "magnet:?xt=1".into(), ..Default::default() };
            grab_client.grab(&MockHost, spec)
        })
        .await
        .unwrap_err()
        .to_string();
        assert!(err.contains("boom"), "the provider's reason was lost: {err}");

        let db_client = DownloadDbClient::new(resolve);
        let err = blocking(move || db_client.completed_downloads(&MockHost))
            .await
            .unwrap_err()
            .to_string();
        assert!(err.contains("boom"), "{err}");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn the_ledger_verbs_survive_the_round_trip() {
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(OkGrab { gate: true });
        let db: Arc<dyn DownloadDbPort> = Arc::new(OkDb);
        let resolve = serve(download_routes::<MockHost>(grab, db), MockHost).await;

        let client = DownloadDbClient::new(resolve);
        let done = blocking({
            let c = DownloadDbClient::new(client.resolve.clone());
            move || c.completed_downloads(&MockHost)
        })
        .await
        .unwrap();
        assert_eq!(done.len(), 1);
        assert_eq!(done[0].id, "done");

        let c = DownloadDbClient::new(client.resolve.clone());
        blocking(move || {
            c.mark_download_imported(&MockHost, "done", &["/media/a.mkv".to_string()], 42)
        })
        .await
        .unwrap();

        let c = DownloadDbClient::new(client.resolve.clone());
        assert!(blocking(move || c.set_download_status(&MockHost, "done", "imported", None))
            .await
            .unwrap());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn the_fire_and_forget_verbs_reach_the_provider() {
        // `activate` and `drop_data` return nothing, so a broken route would be
        // completely silent. Counting them on the provider side is the only way
        // to see they arrived.
        #[derive(Default)]
        struct CountingGrab {
            activated: std::sync::Mutex<Vec<String>>,
            dropped: std::sync::Mutex<Vec<String>>,
        }
        impl DownloadGrabPort for CountingGrab {
            fn grab(&self, _h: &dyn HostCtx, _s: GrabSpec) -> anyhow::Result<DownloadRow> {
                Ok(sample_download_row("x"))
            }
            fn list_files(
                &self,
                _h: &dyn HostCtx,
                _m: &str,
            ) -> anyhow::Result<Vec<TorrentFileEntry>> {
                Ok(Vec::new())
            }
            fn gate_open(&self) -> bool {
                true
            }
            fn activate(&self, _h: &dyn HostCtx, row: &DownloadRow) {
                self.activated.lock().unwrap().push(row.id.clone());
            }
            fn drop_data(&self, _h: &dyn HostCtx, row: &DownloadRow) {
                self.dropped.lock().unwrap().push(row.id.clone());
            }
        }

        let counting = Arc::new(CountingGrab::default());
        let grab: Arc<dyn DownloadGrabPort> = counting.clone();
        let db: Arc<dyn DownloadDbPort> = Arc::new(OkDb);
        let resolve = serve(download_routes::<MockHost>(grab, db), MockHost).await;

        let client = DownloadGrabClient::new(resolve);
        let row = sample_download_row("moved");
        blocking(move || {
            client.activate(&MockHost, &row);
            client.drop_data(&MockHost, &row);
        })
        .await;

        assert_eq!(&*counting.activated.lock().unwrap(), &["moved".to_string()]);
        assert_eq!(&*counting.dropped.lock().unwrap(), &["moved".to_string()]);
    }
}

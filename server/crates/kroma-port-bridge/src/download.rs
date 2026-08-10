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
    use super::*;

    use crate::testing::{blocking, serve};

    use kroma_module_host::testing::StubHost;

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

    #[derive(Default)]
    struct StubGrab {
        gate: bool,
        fail: bool,
        activated: std::sync::Mutex<Vec<String>>,
        dropped: std::sync::Mutex<Vec<String>>,
    }

    impl StubGrab {
        fn open() -> Self {
            Self { gate: true, ..Default::default() }
        }
        fn closed() -> Self {
            Self::default()
        }
        fn failing() -> Self {
            Self { fail: true, ..Default::default() }
        }
    }

    impl DownloadGrabPort for StubGrab {
        fn grab(&self, _h: &dyn HostCtx, _spec: GrabSpec) -> anyhow::Result<DownloadRow> {
            if self.fail {
                anyhow::bail!("boom");
            }
            Ok(sample_download_row("grabbed"))
        }
        fn list_files(
            &self,
            _h: &dyn HostCtx,
            _magnet_or_url: &str,
        ) -> anyhow::Result<Vec<TorrentFileEntry>> {
            if self.fail {
                anyhow::bail!("boom");
            }
            Ok(vec![TorrentFileEntry { index: 0, path: "a.mkv".into(), size_bytes: 10 }])
        }
        fn gate_open(&self) -> bool {
            self.gate
        }
        fn activate(&self, _h: &dyn HostCtx, row: &DownloadRow) {
            self.activated.lock().unwrap().push(row.id.clone());
        }
        fn drop_data(&self, _h: &dyn HostCtx, row: &DownloadRow) {
            self.dropped.lock().unwrap().push(row.id.clone());
        }
    }

    #[derive(Default)]
    struct StubDb {
        fail: bool,
    }

    impl StubDb {
        fn failing() -> Self {
            Self { fail: true }
        }
    }

    impl DownloadDbPort for StubDb {
        fn completed_downloads(&self, _h: &dyn HostCtx) -> anyhow::Result<Vec<DownloadRow>> {
            if self.fail {
                anyhow::bail!("boom");
            }
            Ok(vec![sample_download_row("done")])
        }
        fn mark_download_imported(
            &self,
            _h: &dyn HostCtx,
            _id: &str,
            _paths: &[String],
            _now_ms: i64,
        ) -> anyhow::Result<()> {
            if self.fail {
                anyhow::bail!("boom");
            }
            Ok(())
        }
        fn set_download_status(
            &self,
            _h: &dyn HostCtx,
            _id: &str,
            _status: &str,
            _error: Option<&str>,
        ) -> anyhow::Result<bool> {
            if self.fail {
                anyhow::bail!("boom");
            }
            Ok(true)
        }
    }

    fn offline() -> Resolver {
        Arc::new(|| None)
    }

    #[tokio::test]
    async fn grab_handler_returns_row() {
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(StubGrab::open());
        let spec = GrabSpec { magnet_or_url: "magnet:?xt=1".into(), ..Default::default() };
        let Json(res) = grab_h::<StubHost>(State(StubHost::new()), Extension(grab), Json(spec)).await;
        assert_eq!(res.unwrap().id, "grabbed");
    }

    #[tokio::test]
    async fn grab_handler_maps_error() {
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(StubGrab::failing());
        let Json(res) =
            grab_h::<StubHost>(State(StubHost::new()), Extension(grab), Json(GrabSpec::default())).await;
        assert_eq!(res.unwrap_err(), "boom");
    }

    #[tokio::test]
    async fn list_files_handler_returns_entries() {
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(StubGrab::open());
        let req = MagnetReq { magnet_or_url: "magnet:?xt=1".into() };
        let Json(res) =
            list_files_h::<StubHost>(State(StubHost::new()), Extension(grab), Json(req)).await;
        let files = res.unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "a.mkv");
    }

    #[tokio::test]
    async fn gate_open_handler_reflects_engine() {
        let open: Arc<dyn DownloadGrabPort> = Arc::new(StubGrab::open());
        let Json(v) = gate_open_h::<StubHost>(Extension(open)).await;
        assert!(v);

        let closed: Arc<dyn DownloadGrabPort> = Arc::new(StubGrab::closed());
        let Json(v) = gate_open_h::<StubHost>(Extension(closed)).await;
        assert!(!v);
    }

    #[tokio::test]
    async fn activate_and_drop_handlers_ack() {
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(StubGrab::open());
        let row = sample_download_row("x");
        let Json(()) =
            activate_h::<StubHost>(State(StubHost::new()), Extension(grab.clone()), Json(row.clone())).await;
        let Json(()) = drop_data_h::<StubHost>(State(StubHost::new()), Extension(grab), Json(row)).await;
    }

    #[tokio::test]
    async fn completed_handler_returns_rows() {
        let db: Arc<dyn DownloadDbPort> = Arc::new(StubDb::default());
        let Json(res) = completed_h::<StubHost>(State(StubHost::new()), Extension(db)).await;
        assert_eq!(res.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn completed_handler_maps_error() {
        let db: Arc<dyn DownloadDbPort> = Arc::new(StubDb::failing());
        let Json(res) = completed_h::<StubHost>(State(StubHost::new()), Extension(db)).await;
        assert_eq!(res.unwrap_err(), "boom");
    }

    #[tokio::test]
    async fn mark_imported_handler_acks() {
        let db: Arc<dyn DownloadDbPort> = Arc::new(StubDb::default());
        let req = MarkImportedReq { id: "id".into(), paths: vec!["a".into()], now_ms: 7 };
        let Json(res) = mark_imported_h::<StubHost>(State(StubHost::new()), Extension(db), Json(req)).await;
        assert!(res.is_ok());
    }

    #[tokio::test]
    async fn set_status_handler_returns_bool() {
        let db: Arc<dyn DownloadDbPort> = Arc::new(StubDb::default());
        let req = SetStatusReq { id: "id".into(), status: "done".into(), error: None };
        let Json(res) = set_status_h::<StubHost>(State(StubHost::new()), Extension(db), Json(req)).await;
        assert!(res.unwrap());
    }

    #[test]
    fn grab_client_offline_behavior() {
        let c = DownloadGrabClient::new(offline());
        assert!(c.grab(&StubHost::new(), GrabSpec::default()).is_err());
        assert!(c.list_files(&StubHost::new(), "magnet:?xt=1").is_err());
        assert!(c.gate_open());
        // Infallible fire-and-forget calls must not panic when offline.
        let row = sample_download_row("x");
        c.activate(&StubHost::new(), &row);
        c.drop_data(&StubHost::new(), &row);
    }

    #[test]
    fn db_client_offline_errors() {
        let c = DownloadDbClient::new(offline());
        assert!(c.completed_downloads(&StubHost::new()).is_err());
        assert!(c.mark_download_imported(&StubHost::new(), "id", &["p".to_string()], 0).is_err());
        assert!(c.set_download_status(&StubHost::new(), "id", "done", None).is_err());
    }

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

    // Everything above drives one side or the other. This mounts the REAL
    // router on a real port and points a REAL client at it, so the wire
    // itself is under test: the `/_port/<port>/<method>` paths, the bearer
    // token, the `Result<T, String>` envelope, and the JSON shape of every
    // boundary type. Those only ever disagree at runtime, in a sidecar,
    // which is the worst place to find out.

    #[tokio::test(flavor = "multi_thread")]
    async fn every_grab_verb_survives_the_round_trip() {
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(StubGrab::open());
        let db: Arc<dyn DownloadDbPort> = Arc::new(StubDb::default());
        let resolve = serve(download_routes::<StubHost>(grab, db), StubHost::new()).await;

        let client = DownloadGrabClient::new(resolve);
        let row = blocking(move || {
            let spec = GrabSpec { magnet_or_url: "magnet:?xt=1".into(), ..Default::default() };
            client.grab(&StubHost::new(), spec)
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
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(StubGrab::open());
        let db: Arc<dyn DownloadDbPort> = Arc::new(StubDb::default());
        let resolve = serve(download_routes::<StubHost>(grab, db), StubHost::new()).await;

        let client = DownloadGrabClient::new(resolve);
        let files =
            blocking(move || client.list_files(&StubHost::new(), "magnet:?xt=1")).await.unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "a.mkv");
        assert_eq!(files[0].size_bytes, 10);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn the_gate_is_read_from_the_provider_when_it_is_reachable() {
        // The client defaults OPEN when the bridge is down, so a closed gate is
        // only ever observable through a working round trip - which makes this
        // the test that proves the default is not masking everything.
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(StubGrab::closed());
        let db: Arc<dyn DownloadDbPort> = Arc::new(StubDb::default());
        let resolve = serve(download_routes::<StubHost>(grab, db), StubHost::new()).await;

        let client = DownloadGrabClient::new(resolve);
        assert!(!blocking(move || client.gate_open()).await);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_provider_error_crosses_the_wire_as_an_error() {
        // The envelope is `Result<T, String>`; losing the Err arm would turn a
        // failed grab into a successful one carrying nonsense.
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(StubGrab::failing());
        let db: Arc<dyn DownloadDbPort> = Arc::new(StubDb::failing());
        let resolve = serve(download_routes::<StubHost>(grab, db), StubHost::new()).await;

        let grab_client = DownloadGrabClient::new(resolve.clone());
        let err = blocking(move || {
            let spec = GrabSpec { magnet_or_url: "magnet:?xt=1".into(), ..Default::default() };
            grab_client.grab(&StubHost::new(), spec)
        })
        .await
        .unwrap_err()
        .to_string();
        assert!(err.contains("boom"), "the provider's reason was lost: {err}");

        let db_client = DownloadDbClient::new(resolve);
        let err = blocking(move || db_client.completed_downloads(&StubHost::new()))
            .await
            .unwrap_err()
            .to_string();
        assert!(err.contains("boom"), "{err}");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn the_ledger_verbs_survive_the_round_trip() {
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(StubGrab::open());
        let db: Arc<dyn DownloadDbPort> = Arc::new(StubDb::default());
        let resolve = serve(download_routes::<StubHost>(grab, db), StubHost::new()).await;

        let client = DownloadDbClient::new(resolve);
        let done = blocking({
            let c = DownloadDbClient::new(client.resolve.clone());
            move || c.completed_downloads(&StubHost::new())
        })
        .await
        .unwrap();
        assert_eq!(done.len(), 1);
        assert_eq!(done[0].id, "done");

        let c = DownloadDbClient::new(client.resolve.clone());
        blocking(move || {
            c.mark_download_imported(&StubHost::new(), "done", &["/media/a.mkv".to_string()], 42)
        })
        .await
        .unwrap();

        let c = DownloadDbClient::new(client.resolve.clone());
        assert!(blocking(move || c.set_download_status(&StubHost::new(), "done", "imported", None))
            .await
            .unwrap());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn the_fire_and_forget_verbs_reach_the_provider() {
        // `activate` and `drop_data` return nothing, so a broken route would be
        // completely silent. Counting them on the provider side is the only way
        // to see they arrived.
        let counting = Arc::new(StubGrab::open());
        let grab: Arc<dyn DownloadGrabPort> = counting.clone();
        let db: Arc<dyn DownloadDbPort> = Arc::new(StubDb::default());
        let resolve = serve(download_routes::<StubHost>(grab, db), StubHost::new()).await;

        let client = DownloadGrabClient::new(resolve);
        let row = sample_download_row("moved");
        blocking(move || {
            client.activate(&StubHost::new(), &row);
            client.drop_data(&StubHost::new(), &row);
        })
        .await;

        assert_eq!(&*counting.activated.lock().unwrap(), &["moved".to_string()]);
        assert_eq!(&*counting.dropped.lock().unwrap(), &["moved".to_string()]);
    }

    #[tokio::test]
    async fn list_files_handler_maps_error() {
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(StubGrab::failing());
        let req = MagnetReq { magnet_or_url: "magnet:?xt=1".into() };
        let Json(res) =
            list_files_h::<StubHost>(State(StubHost::new()), Extension(grab), Json(req)).await;
        assert_eq!(res.unwrap_err(), "boom");
    }

    #[tokio::test]
    async fn a_failing_grab_provider_still_reports_its_gate() {
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(StubGrab::failing());
        let Json(open) = gate_open_h::<StubHost>(Extension(grab)).await;
        assert!(!open, "a provider that cannot grab must not advertise an open gate");
    }

    #[tokio::test]
    async fn the_ledger_writes_map_their_errors() {
        let db: Arc<dyn DownloadDbPort> = Arc::new(StubDb::failing());
        let req = MarkImportedReq { id: "d1".into(), paths: vec!["a.mkv".into()], now_ms: 7 };
        let Json(res) =
            mark_imported_h::<StubHost>(State(StubHost::new()), Extension(db.clone()), Json(req)).await;
        assert_eq!(res.unwrap_err(), "boom");

        let req = SetStatusReq { id: "d1".into(), status: "failed".into(), error: Some("nope".into()) };
        let Json(res) =
            set_status_h::<StubHost>(State(StubHost::new()), Extension(db), Json(req)).await;
        assert_eq!(res.unwrap_err(), "boom");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_ledger_write_failure_crosses_the_wire_as_an_error() {
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(StubGrab::failing());
        let db: Arc<dyn DownloadDbPort> = Arc::new(StubDb::failing());
        let resolve = serve(download_routes::<StubHost>(grab, db), StubHost::new()).await;

        let client = DownloadDbClient::new(resolve.clone());
        let err = blocking(move || {
            client.mark_download_imported(&StubHost::new(), "d1", &["a.mkv".to_string()], 1)
        })
        .await
        .unwrap_err()
        .to_string();
        assert!(err.contains("boom"), "{err}");

        let client = DownloadDbClient::new(resolve.clone());
        let err = blocking(move || client.set_download_status(&StubHost::new(), "d1", "failed", None))
            .await
            .unwrap_err()
            .to_string();
        assert!(err.contains("boom"), "{err}");

        let client = DownloadGrabClient::new(resolve);
        let err = blocking(move || client.list_files(&StubHost::new(), "magnet:?xt=1"))
            .await
            .unwrap_err()
            .to_string();
        assert!(err.contains("boom"), "{err}");
    }
}

//! The provider side of the two download ports: the routes a download module
//! mounts and the handlers behind them.

use std::sync::Arc;

use axum::extract::State;
use axum::routing::post;
use axum::{Extension, Json, Router};
use kroma_module_host::HostCtx;
use serde::Deserialize;

use crate::ports::TorrentFileEntry;

use super::{DownloadDbPort, DownloadGrabPort, DownloadRow, GrabSpec};

/// Routes the torrents sidecar mounts for its two download provider ports.
pub fn download_routes<S: HostCtx + Clone + Send + Sync + 'static>(
    grab: Arc<dyn DownloadGrabPort>,
    db: Arc<dyn DownloadDbPort>,
) -> Router<S> {
    Router::new()
        .route("/_port/downloadgrab/grab", post(grab_h::<S>))
        .route("/_port/downloadgrab/list_files", post(list_files_h::<S>))
        .route("/_port/downloadgrab/gate_open", post(gate_open_h))
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

async fn gate_open_h(Extension(grab): Extension<Arc<dyn DownloadGrabPort>>) -> Json<bool> {
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

#[cfg(test)]
mod tests {
    use super::*;

    use super::super::fixtures::{sample_download_row, StubDb, StubGrab};

    use kroma_module_host::testing::StubHost;

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
        let Json(v) = gate_open_h(Extension(open)).await;
        assert!(v);

        let closed: Arc<dyn DownloadGrabPort> = Arc::new(StubGrab::closed());
        let Json(v) = gate_open_h(Extension(closed)).await;
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
        let Json(open) = gate_open_h(Extension(grab)).await;
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
}

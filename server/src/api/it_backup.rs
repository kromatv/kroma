use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::{Request, StatusCode};
use axum::Router;
use tower::ServiceExt;

use crate::api::test_support::test_app;
use crate::db;
use crate::services::jobs::JobKey;

async fn import(app: &Router, token: &str, backup: Vec<u8>) -> StatusCode {
    let mut req = Request::builder()
        .method("POST")
        .uri("/api/admin/backup/import")
        .header("authorization", format!("Bearer {token}"))
        .body(Body::from(backup))
        .unwrap();
    req.extensions_mut()
        .insert(ConnectInfo(std::net::SocketAddr::from((
            [127, 0, 0, 1],
            40000,
        ))));
    app.clone().oneshot(req).await.unwrap().status()
}

#[tokio::test]
async fn a_cron_override_in_a_backup_is_in_force_as_soon_as_it_is_restored() {
    let source = test_app();
    db::upsert_job_schedule(&source.state.db, "cache.cleanup", Some("0 6 * * *"), true).unwrap();
    let backup =
        crate::services::backup::export(&source.state.db, &source.state.config.data_dir, None)
            .unwrap();
    let target = test_app();

    let status = import(&target.app, &target.token, backup).await;

    let job = target
        .state
        .jobs
        .detail(&target.state, JobKey("cache.cleanup"))
        .unwrap();
    assert_eq!(status, StatusCode::OK);
    assert_eq!(job.info.schedule.as_deref(), Some("0 6 * * *"));
}

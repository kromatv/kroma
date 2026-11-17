use axum::http::StatusCode;

use crate::api::test_support::{test_app, upload};
use crate::db;
use crate::services::jobs::JobKey;

#[tokio::test]
async fn a_cron_override_in_a_backup_is_in_force_as_soon_as_it_is_restored() {
    let source = test_app();
    db::upsert_job_schedule(&source.state.db, "cache.cleanup", Some("0 6 * * *"), true).unwrap();
    let backup =
        crate::services::backup::export(&source.state.db, &source.state.config.data_dir, None)
            .unwrap();
    let target = test_app();

    let status = upload(
        &target.app,
        "/api/admin/backup/import",
        &target.token,
        backup,
    )
    .await;

    let job = target
        .state
        .jobs
        .detail(&target.state, JobKey("cache.cleanup"))
        .unwrap();
    assert_eq!(status, StatusCode::OK);
    assert_eq!(job.info.schedule.as_deref(), Some("0 6 * * *"));
}

use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::{Request, StatusCode};
use serde_json::Value;
use tower::ServiceExt;

use crate::api::test_support::{TestApp, test_app};
use crate::db;
use crate::services::scan::{WalkTurn, rescan_sync, uninterrupted};
use crate::services::settings::{LibraryDef, set_library_defs};

fn library(id: &str, name: &str, root: &std::path::Path) -> LibraryDef {
    LibraryDef {
        id: id.into(),
        name: name.into(),
        kind: "movies".into(),
        folders: vec![root.to_string_lossy().into_owned()],
        auto_scan: true,
    }
}

fn a_backup_naming_only(films: &std::path::Path) -> Vec<u8> {
    let source = test_app();
    set_library_defs(
        &source.state.settings,
        &source.state.db,
        &[library("films", "Films", films)],
    );
    crate::services::backup::export(&source.state.db, &source.state.config.data_dir, None).unwrap()
}

fn walk(target: &TestApp) {
    rescan_sync(&WalkTurn::wait(), &target.state, &mut uninterrupted).unwrap();
}

fn series_with_a_resume_position(target: &TestApp, series: &std::path::Path) -> String {
    std::fs::write(series.join("Heat (1995).mkv"), b"x").unwrap();
    set_library_defs(
        &target.state.settings,
        &target.state.db,
        &[library("series", "Series", series)],
    );
    walk(target);
    let item = db::list_items(&target.state.db, Some("series"))
        .unwrap()
        .remove(0);
    db::upsert_progress(&target.state.db, &target.user_id, &item.id, 600_000, None).unwrap();
    item.id
}

const RESET: &[(&str, &str)] = &[("x-backup-reset", "1")];

async fn restore(
    target: &TestApp,
    uri: &str,
    backup: Vec<u8>,
    headers: &[(&str, &str)],
) -> (StatusCode, Value) {
    let mut request = Request::builder()
        .method("POST")
        .uri(uri)
        .header("authorization", format!("Bearer {}", target.token));
    for (name, value) in headers {
        request = request.header(*name, *value);
    }
    let mut request = request.body(Body::from(backup)).unwrap();
    request
        .extensions_mut()
        .insert(ConnectInfo(std::net::SocketAddr::from((
            [127, 0, 0, 1],
            40000,
        ))));
    let response = target.app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

fn library_ids(target: &TestApp) -> Vec<String> {
    db::list_libraries(&target.state.db)
        .unwrap()
        .into_iter()
        .map(|library| library.id)
        .collect()
}

#[tokio::test]
async fn a_restore_that_is_not_a_reset_keeps_this_servers_library_and_its_watch_state() {
    let disk = kroma_testing::temp_dir("backup-libraries-merge");
    let (films, series) = (disk.path().join("films"), disk.path().join("series"));
    std::fs::create_dir_all(&films).unwrap();
    std::fs::create_dir_all(&series).unwrap();
    let backup = a_backup_naming_only(&films);
    let target = test_app();
    let item = series_with_a_resume_position(&target, &series);

    let (status, _) = restore(&target, "/api/admin/backup/import", backup, &[]).await;
    walk(&target);

    assert_eq!(status, StatusCode::OK);
    assert!(library_ids(&target).contains(&"series".to_string()));
    let kept = db::get_progress(&target.state.db, &target.user_id, &item).unwrap();
    assert_eq!(kept.map(|p| p.position_ms), Some(600_000));
}

#[tokio::test]
async fn a_reset_says_which_libraries_it_removes_and_restores_nothing_while_asked() {
    let disk = kroma_testing::temp_dir("backup-libraries-reset");
    let (films, series) = (disk.path().join("films"), disk.path().join("series"));
    std::fs::create_dir_all(&films).unwrap();
    std::fs::create_dir_all(&series).unwrap();
    let backup = a_backup_naming_only(&films);
    let target = test_app();
    series_with_a_resume_position(&target, &series);

    let (status, answer) =
        restore(&target, "/api/admin/backup/import/preview", backup, RESET).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        answer["removedLibraries"],
        serde_json::json!([{ "id": "series", "name": "Series" }])
    );
    let saved =
        crate::services::settings::library_defs(&target.state.settings, &target.state.config)
            .unwrap();
    assert_eq!(
        saved.iter().map(|def| def.id.as_str()).collect::<Vec<_>>(),
        ["series"]
    );
}

#[tokio::test]
async fn a_restore_that_is_not_a_reset_says_it_removes_nothing() {
    let disk = kroma_testing::temp_dir("backup-libraries-preview");
    let (films, series) = (disk.path().join("films"), disk.path().join("series"));
    std::fs::create_dir_all(&films).unwrap();
    std::fs::create_dir_all(&series).unwrap();
    let backup = a_backup_naming_only(&films);
    let target = test_app();
    series_with_a_resume_position(&target, &series);

    let (_, answer) = restore(&target, "/api/admin/backup/import/preview", backup, &[]).await;

    assert_eq!(answer["removedLibraries"], serde_json::json!([]));
}

#[tokio::test]
async fn a_file_that_is_no_backup_is_refused_by_the_restore_and_its_preview() {
    let target = test_app();

    let (restored, said) = restore(&target, "/api/admin/backup/import", b"no".to_vec(), &[]).await;
    let (previewed, _) = restore(
        &target,
        "/api/admin/backup/import/preview",
        b"no".to_vec(),
        RESET,
    )
    .await;

    assert_eq!(restored, StatusCode::BAD_REQUEST);
    assert_eq!(said["code"], "admin.backupInvalid");
    assert_eq!(previewed, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn an_encrypted_backup_asks_for_its_password_and_refuses_a_wrong_one() {
    let source = test_app();
    let sealed = crate::services::backup::export(
        &source.state.db,
        &source.state.config.data_dir,
        Some("hunter2"),
    )
    .unwrap();
    let target = test_app();
    let wrong = [("x-backup-password", "6e6f7065")];

    let (unopened, asked) = restore(&target, "/api/admin/backup/import", sealed.clone(), &[]).await;
    let (mistyped, refused) = restore(&target, "/api/admin/backup/import", sealed, &wrong).await;

    assert_eq!(unopened, StatusCode::BAD_REQUEST);
    assert_eq!(asked["code"], "admin.backupPasswordRequired");
    assert_eq!(mistyped, StatusCode::BAD_REQUEST);
    assert_eq!(refused["code"], "admin.backupWrongPassword");
}

#[tokio::test]
async fn a_restore_onto_a_library_list_that_cannot_be_read_restores_nothing_and_says_why() {
    let disk = kroma_testing::temp_dir("backup-libraries-unreadable");
    let backup = a_backup_naming_only(disk.path());
    let target = test_app();
    let unreadable = serde_json::json!([{ "name": "Films" }]);
    db::settings_set(&target.state.db, "libraries", &unreadable).unwrap();
    target.state.settings.reload(&target.state.db);

    let (status, answer) = restore(&target, "/api/admin/backup/import", backup, &[]).await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert!(
        answer["code"]
            .as_str()
            .is_some_and(|code| code.starts_with("error.libraryListUnreadable"))
    );
    assert_eq!(target.state.settings.get("libraries"), unreadable);
}

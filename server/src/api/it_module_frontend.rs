use axum::http::StatusCode;

use crate::api::test_support::{raw, test_app};

fn install_frontend(t: &crate::api::test_support::TestApp) {
    let fe = t
        .state
        .config
        .data_dir
        .join("modules/tv.kroma.notes/fe/assets");
    std::fs::create_dir_all(&fe).unwrap();
    std::fs::write(fe.join("../remoteEntry.js"), "export const get = 1;").unwrap();
    std::fs::write(fe.join("Notes-BKMFTghM.js"), "export default 1;").unwrap();
}

#[tokio::test]
async fn a_hashed_module_chunk_is_cached_for_a_year() {
    let t = test_app();
    install_frontend(&t);

    let (status, headers, _) = raw(
        &t.app,
        "GET",
        "/modules/tv.kroma.notes/assets/Notes-BKMFTghM.js",
        None,
        None,
        &[],
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        headers["cache-control"],
        "public, max-age=31536000, immutable"
    );
    assert_eq!(headers["content-type"], "text/javascript; charset=utf-8");
}

#[tokio::test]
async fn a_module_entry_revalidates_and_answers_not_modified_when_unchanged() {
    let t = test_app();
    install_frontend(&t);
    let (_, first, _) = raw(
        &t.app,
        "GET",
        "/modules/tv.kroma.notes/remoteEntry.js",
        None,
        None,
        &[],
    )
    .await;
    let modified = first["last-modified"].to_str().unwrap().to_string();

    let (status, headers, _) = raw(
        &t.app,
        "GET",
        "/modules/tv.kroma.notes/remoteEntry.js",
        None,
        None,
        &[("if-modified-since", &modified)],
    )
    .await;

    assert_eq!(first["cache-control"], "no-cache");
    assert_eq!(status, StatusCode::NOT_MODIFIED);
    assert!(!headers.contains_key("content-length") || headers["content-length"] == "0");
}

#[tokio::test]
async fn a_path_outside_the_module_frontend_is_not_found() {
    let t = test_app();
    install_frontend(&t);

    let (missing, _, _) = raw(
        &t.app,
        "GET",
        "/modules/tv.kroma.notes/nope.js",
        None,
        None,
        &[],
    )
    .await;
    let (escaped, _, _) = raw(
        &t.app,
        "GET",
        "/modules/tv.kroma.notes/..%2F..%2Fkroma.db",
        None,
        None,
        &[],
    )
    .await;
    let (directory, _, _) = raw(
        &t.app,
        "GET",
        "/modules/tv.kroma.notes/assets",
        None,
        None,
        &[],
    )
    .await;

    assert_eq!(missing, StatusCode::NOT_FOUND);
    assert_eq!(escaped, StatusCode::NOT_FOUND);
    assert_eq!(directory, StatusCode::NOT_FOUND);
}

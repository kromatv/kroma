use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{get, installed_module, raw, test_app};

fn install_frontend(t: &crate::api::test_support::TestApp) {
    let fe = t
        .state
        .config
        .data_dir
        .join(kroma_module_supervisor::INSTALLED_DIR)
        .join("tv.kroma.notes/fe/assets");
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

const FE_REMOTE: &str = r#", "feRemote": { "module": "./remoteEntry.js" }"#;

fn listed(body: &serde_json::Value, id: &str) -> serde_json::Value {
    body.as_array()
        .unwrap()
        .iter()
        .find(|m| m["id"] == id)
        .cloned()
        .unwrap()
}

async fn revision_of(t: &crate::api::test_support::TestApp, id: &str) -> String {
    let (_, body) = get(&t.app, "/api/modules", Some(&t.token)).await;
    listed(&body, id)["frontend"]["revision"]
        .as_str()
        .unwrap()
        .to_string()
}

#[tokio::test]
async fn the_module_list_names_the_frontend_and_what_its_entry_reads() {
    let t = test_app();
    installed_module(&t, "tv.kroma.notes", FE_REMOTE);
    install_frontend(&t);
    let fe = t
        .state
        .config
        .data_dir
        .join(kroma_module_supervisor::INSTALLED_DIR)
        .join("tv.kroma.notes/fe");
    std::fs::write(fe.join("shared.json"), r#"{ "react": ["*"] }"#).unwrap();

    let (status, body) = get(&t.app, "/api/modules", Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    let notes = listed(&body, "tv.kroma.notes");
    assert_eq!(notes["feRemote"]["module"], "./remoteEntry.js");
    assert_eq!(notes["frontend"]["shared"], json!({ "react": ["*"] }));
    assert_eq!(notes["frontend"]["revision"].as_str().unwrap().len(), 16);
}

#[tokio::test]
async fn a_module_whose_bundle_carries_no_entry_lists_no_frontend() {
    let t = test_app();
    installed_module(&t, "tv.kroma.parser", FE_REMOTE);

    let (_, body) = get(&t.app, "/api/modules", Some(&t.token)).await;

    let parser = listed(&body, "tv.kroma.parser");
    assert!(parser.get("feRemote").is_none(), "{parser}");
    assert!(parser.get("frontend").is_none(), "{parser}");
}

#[tokio::test]
async fn every_file_under_the_current_revision_is_cached_for_a_year() {
    let t = test_app();
    installed_module(&t, "tv.kroma.notes", FE_REMOTE);
    install_frontend(&t);
    let revision = revision_of(&t, "tv.kroma.notes").await;

    for file in ["remoteEntry.js", "assets/Notes-BKMFTghM.js"] {
        let uri = format!("/modules/tv.kroma.notes@{revision}/{file}");
        let (status, headers, _) = raw(&t.app, "GET", &uri, None, None, &[]).await;

        assert_eq!(status, StatusCode::OK, "{uri}");
        assert_eq!(
            headers["cache-control"], "public, max-age=31536000, immutable",
            "{uri}"
        );
    }
}

#[tokio::test]
async fn a_revision_the_module_no_longer_has_revalidates() {
    let t = test_app();
    installed_module(&t, "tv.kroma.notes", FE_REMOTE);
    install_frontend(&t);

    let (status, headers, _) = raw(
        &t.app,
        "GET",
        "/modules/tv.kroma.notes@0000000000000000/remoteEntry.js",
        None,
        None,
        &[],
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(headers["cache-control"], "no-cache");
}

#[tokio::test]
async fn a_revision_does_not_open_a_path_outside_the_module_frontend() {
    let t = test_app();
    installed_module(&t, "tv.kroma.notes", FE_REMOTE);
    install_frontend(&t);
    let revision = revision_of(&t, "tv.kroma.notes").await;

    let escaped = format!("/modules/..@{revision}/tv.kroma.notes/module.json");
    let (status, _, _) = raw(&t.app, "GET", &escaped, None, None, &[]).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}

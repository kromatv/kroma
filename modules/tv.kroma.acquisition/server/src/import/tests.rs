use std::sync::{Arc, Mutex};

use axum::Json;
use axum::extract::State;
use axum::routing::post;
use serde_json::{Value, json};

use kroma_module_sdk::host::testing::StubHost;

use super::*;
use crate::peers::downloads::DOWNLOAD_DB;

type Moves = Arc<Mutex<Vec<(String, String, String)>>>;

fn season_row(id: &str, save_path: &Path) -> Value {
    json!({
        "id": id,
        "kind": "season",
        "title": "The Sopranos",
        "season": 1,
        "release_title": "The.Sopranos.S01.MULTi.VFF.1080p.Bluray.HDLight.AV1.10bit-RYO.FRENCH",
        "status": "completed",
        "save_path": save_path.to_string_lossy(),
    })
}

fn ledger(rows: Vec<Value>) -> axum::Router<Moves> {
    let completed = move || {
        let rows = rows.clone();
        async move { Json(Ok::<_, String>(rows)) }
    };
    let set_status = |State(moves): State<Moves>, Json(req): Json<Value>| async move {
        let text = |key: &str| req[key].as_str().unwrap_or_default().to_string();
        moves
            .lock()
            .unwrap()
            .push((text("id"), text("status"), text("error")));
        Json(Ok::<_, String>(true))
    };
    axum::Router::new()
        .route("/_port/tv.kroma.torrents/db/completed", post(completed))
        .route("/_port/tv.kroma.torrents/db/set-status", post(set_status))
}

#[tokio::test(flavor = "multi_thread")]
async fn a_download_whose_folder_is_gone_is_marked_removed_and_says_why() {
    let downloads = kroma_module_sdk::testing::temp_dir("import-gone");
    let empty = downloads.path().join("54ed71fbe0318163");
    std::fs::create_dir(&empty).unwrap();
    let rows = vec![
        season_row(
            "68165ad60353d090",
            &downloads.path().join("68165ad60353d090"),
        ),
        season_row("54ed71fbe0318163", &empty),
    ];
    let moves = Moves::default();
    let resolve = kroma_module_sdk::testing::serve(ledger(rows), moves.clone()).await;
    let (base, token) = resolve().expect("the fake ledger is up");
    let host = StubHost::new().with_point(DOWNLOAD_DB, None, &base, &token);

    let summary = kroma_module_sdk::testing::blocking(move || import_pass(&host, &|_| {}))
        .await
        .unwrap();

    assert_eq!(summary.failed, 2);
    let moves = moves.lock().unwrap();
    let gone = &moves[0];
    assert_eq!(
        (gone.0.as_str(), gone.1.as_str()),
        ("68165ad60353d090", "removed")
    );
    assert!(
        gone.2.contains("the downloaded files are gone"),
        "{}",
        gone.2
    );
    let empty = &moves[1];
    assert_eq!(
        (empty.0.as_str(), empty.1.as_str()),
        ("54ed71fbe0318163", "completed")
    );
    assert!(empty.2.contains("no video file found"), "{}", empty.2);
}

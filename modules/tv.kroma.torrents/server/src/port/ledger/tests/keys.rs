//! The JSON keys both ends declare: what a consumer sends and what each
//! method takes, because the two sides ship on separate tags.

use super::*;

#[test]
fn a_grab_spec_arrives_from_the_keys_a_consumer_sends() {
    let body = json!({
        "magnet_or_url": "magnet:?xt=urn:btih:AB",
        "kind": "movie",
        "tmdb_id": 603,
        "release_title": "The.Matrix.1999.1080p",
        "wanted_ids": ["w1"],
        "upgrade": true,
    });

    let spec: GrabSpec = serde_json::from_value(body).unwrap();

    assert_eq!(spec.magnet_or_url, "magnet:?xt=urn:btih:AB");
    assert_eq!(spec.tmdb_id, Some(603));
    assert_eq!(spec.wanted_ids, vec!["w1".to_string()]);
    assert!(spec.upgrade);
    assert_eq!(spec.season, None);
    assert_eq!(spec.only_files, None);
}

#[test]
fn the_lifecycle_methods_take_an_id_and_not_a_row() {
    let req: IdReq = serde_json::from_value(json!({ "id": "d1" })).unwrap();

    assert_eq!(req.id, "d1");
}

#[test]
fn the_two_write_methods_take_the_keys_they_are_documented_with() {
    let imported: ImportedReq =
        serde_json::from_value(json!({ "id": "d1", "paths": ["/m/a.mkv"], "now_ms": 42 })).unwrap();
    assert_eq!(imported.id, "d1");
    assert_eq!(imported.paths, vec!["/m/a.mkv".to_string()]);
    assert_eq!(imported.now_ms, 42);

    let status: StatusReq =
        serde_json::from_value(json!({ "id": "d1", "status": "failed" })).unwrap();
    assert_eq!(status.status, "failed");
    assert_eq!(status.error, None);
}

#[test]
fn a_row_serializes_under_the_keys_an_import_pass_reads() {
    let json = serde_json::to_value(row()).unwrap();

    assert_eq!(json["id"], "d1");
    assert_eq!(json["request_id"], "req-1");
    assert_eq!(json["release_title"], "The.Matrix.1999.1080p");
    assert_eq!(json["save_path"], "/downloads/x");
    assert_eq!(json["status"], "completed");
    assert_eq!(json["upgrade"], false);
    assert_eq!(json["tmdb_id"], 603);
}

#[test]
fn a_row_no_title_was_resolved_for_crosses_as_the_zero_an_import_pass_expects() {
    let unresolved = DownloadRow {
        tmdb_id: None,
        ..row()
    };

    let json = serde_json::to_value(unresolved).unwrap();

    assert_eq!(json["tmdb_id"], 0);
}

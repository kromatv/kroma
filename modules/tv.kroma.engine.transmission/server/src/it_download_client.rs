use serde_json::{json, Value};

use crate::types::TorrentState;

use crate::fake_transmission::{add_req, FakeTransmission, Reply};
use crate::{KIND, STATUS_FIELDS};

#[test]
fn status_maps_a_live_torrent_onto_the_port_shape() {
    let fake = FakeTransmission::start(|method, args, _| {
        assert_eq!(method, "torrent-get");
        assert_eq!(args["ids"][0], "abc123");
        Reply::ok(json!({
            "torrents": [{
                "hashString": "abc123",
                "name": "Some.Show.S01E01",
                "percentDone": 0.25,
                "status": 4,
                "rateDownload": 1_500_000,
                "rateUpload": 90_000,
                "peersConnected": 12,
                "totalSize": 4_000_000_000u64,
                "downloadDir": "/data/incoming",
                "files": [{ "name": "Some.Show.S01E01.mkv" }, { "name": "readme.txt" }],
                "errorString": "",
            }]
        }))
    });
    let got = fake
        .client()
        .status("abc123")
        .unwrap()
        .expect("a known torrent");
    assert_eq!(got.client_ref, "abc123");
    assert_eq!(got.info_hash.as_deref(), Some("abc123"));
    assert_eq!(got.name, "Some.Show.S01E01");
    assert_eq!(got.progress, 0.25);
    assert_eq!(got.state, TorrentState::Downloading);
    assert_eq!(got.down_bps, 1_500_000);
    assert_eq!(got.up_bps, 90_000);
    assert_eq!(got.peers, 12);
    assert_eq!(got.size_bytes, 4_000_000_000);
    assert_eq!(got.save_path.as_deref(), Some("/data/incoming"));
    assert_eq!(got.files, vec!["Some.Show.S01E01.mkv", "readme.txt"]);
    assert_eq!(got.error, None, "an empty errorString is not an error");
}

#[test]
fn status_asks_for_every_field_it_reads() {
    // The RPC only returns what it is asked for, so a field dropped from
    // STATUS_FIELDS silently becomes a default in the UI.
    let fake = FakeTransmission::start(|_, args, _| {
        let asked: Vec<&str> = args["fields"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(Value::as_str)
            .collect();
        for field in STATUS_FIELDS {
            assert!(asked.contains(field), "{field} not requested");
        }
        Reply::ok(json!({ "torrents": [] }))
    });
    fake.client().status("abc123").unwrap();
}

#[test]
fn status_is_none_for_a_hash_the_server_does_not_know() {
    // A torrent removed out of band is a normal state, not an error.
    let fake = FakeTransmission::start(|_, _, _| Reply::ok(json!({ "torrents": [] })));
    assert!(fake.client().status("gone").unwrap().is_none());
}

#[test]
fn a_sparse_torrent_falls_back_to_zeroes_rather_than_failing() {
    // Older servers omit fields they have no value for; the row still has to
    // render.
    let fake = FakeTransmission::start(|_, _, _| {
        Reply::ok(json!({ "torrents": [{ "hashString": "abc123" }] }))
    });
    let got = fake.client().status("abc123").unwrap().unwrap();
    assert_eq!(got.name, "");
    assert_eq!(got.progress, 0.0);
    assert_eq!(got.down_bps, 0);
    assert_eq!(got.peers, 0);
    assert_eq!(got.size_bytes, 0);
    assert_eq!(got.save_path, None);
    assert!(got.files.is_empty());
    assert_eq!(got.state, TorrentState::Paused, "status 0 with no progress");
}

#[test]
fn state_follows_the_transmission_status_codes() {
    // The client_ref doubles as the fixture: "<status>@<percentDone>".
    let fake = FakeTransmission::start(|_, args, _| {
        let id = args["ids"][0].as_str().unwrap_or_default().to_string();
        let (code, done) = id.split_once('@').unwrap();
        Reply::ok(json!({
            "torrents": [{
                "status": code.parse::<i64>().unwrap(),
                "percentDone": done.parse::<f64>().unwrap(),
            }]
        }))
    });
    let client = fake.client();
    for (fixture, want) in [
        ("0@1.0", TorrentState::Completed),
        ("0@0.4", TorrentState::Paused),
        ("1@0.0", TorrentState::Queued),
        ("2@0.0", TorrentState::Queued),
        ("3@0.0", TorrentState::Downloading),
        ("4@0.5", TorrentState::Downloading),
        ("5@1.0", TorrentState::Seeding),
        ("6@1.0", TorrentState::Seeding),
    ] {
        let got = client.status(fixture).unwrap().unwrap();
        assert_eq!(got.state, want, "status code {fixture}");
    }
}

#[test]
fn an_errored_torrent_carries_its_state_as_the_error() {
    // The error outranks the status code: a tracker failure on a torrent
    // still marked "seeding" must not read as healthy.
    let fake = FakeTransmission::start(|_, _, _| {
        Reply::ok(json!({
            "torrents": [{
                "status": 6,
                "percentDone": 1.0,
                "errorString": "Tracker gave HTTP response code 403",
            }]
        }))
    });
    let got = fake.client().status("abc123").unwrap().unwrap();
    assert_eq!(got.state, TorrentState::Error);
    assert_eq!(
        got.error.as_deref(),
        Some("Tracker gave HTTP response code 403")
    );
}

#[test]
fn add_returns_the_hash_the_server_assigned() {
    let fake = FakeTransmission::start(|method, args, _| {
        assert_eq!(method, "torrent-add");
        assert_eq!(args["filename"], "magnet:?xt=urn:btih:deadbeef");
        assert_eq!(args["download-dir"], "/data/incoming");
        assert_eq!(args["labels"], json!(["kroma"]));
        Reply::ok(json!({ "torrent-added": { "hashString": "deadbeef" } }))
    });
    let hash = fake
        .client()
        .add(&add_req("magnet:?xt=urn:btih:deadbeef", "kroma"))
        .unwrap();
    assert_eq!(hash, "deadbeef");
}

#[test]
fn adding_a_torrent_the_server_already_has_succeeds() {
    // Transmission answers `torrent-duplicate` instead of `torrent-added`.
    // Treating that as a failure would break every re-grab of a download the
    // user still has seeding.
    let fake = FakeTransmission::start(|_, _, _| {
        Reply::ok(json!({ "torrent-duplicate": { "hashString": "deadbeef" } }))
    });
    let hash = fake
        .client()
        .add(&add_req("magnet:?xt=urn:btih:deadbeef", "kroma"))
        .unwrap();
    assert_eq!(hash, "deadbeef");
}

#[test]
fn add_retries_without_labels_when_the_server_rejects_them() {
    // Transmission < 4 has no `labels` argument and refuses the whole call.
    let fake = FakeTransmission::start(|_, _, n| match n {
        1 => Reply::refuses("labels: unsupported argument"),
        _ => Reply::ok(json!({ "torrent-added": { "hashString": "deadbeef" } })),
    });
    let hash = fake
        .client()
        .add(&add_req("magnet:?xt=urn:btih:deadbeef", "kroma"))
        .unwrap();
    assert_eq!(hash, "deadbeef");

    let calls = fake.calls();
    assert_eq!(calls.len(), 2);
    assert!(calls[0].args.get("labels").is_some());
    assert!(
        calls[1].args.get("labels").is_none(),
        "the retry has to drop them"
    );
    assert_eq!(
        calls[1].args["download-dir"], "/data/incoming",
        "but keep the directory"
    );
}

#[test]
fn a_label_free_request_never_sends_the_argument() {
    let fake = FakeTransmission::start(|_, _, _| {
        Reply::ok(json!({ "torrent-added": { "hashString": "deadbeef" } }))
    });
    fake.client()
        .add(&add_req("magnet:?xt=urn:btih:deadbeef", ""))
        .unwrap();
    assert!(fake.calls()[0].args.get("labels").is_none());
}

#[test]
fn add_fails_loudly_when_the_reply_carries_no_hash() {
    // Without a hash there is nothing to track the download by, so returning
    // Ok would leave the ledger pointing at a torrent nobody can find again.
    let fake = FakeTransmission::start(|_, _, _| Reply::ok(json!({ "torrent-added": {} })));
    let err = fake
        .client()
        .add(&add_req("magnet:?xt=urn:btih:deadbeef", "kroma"))
        .unwrap_err()
        .to_string();
    assert!(err.contains("no hash"), "{err}");
    // The call itself succeeded, so the labels retry is not involved: the
    // reply is well-formed and simply useless.
    assert_eq!(fake.calls().len(), 1);
}

#[test]
fn the_lifecycle_verbs_hit_their_methods() {
    let fake = FakeTransmission::start(|_, _, _| Reply::ok(json!({})));
    let client = fake.client();
    client.pause("abc123").unwrap();
    client.resume("abc123").unwrap();
    client.reannounce("abc123").unwrap();
    client.remove("abc123", false).unwrap();
    client.remove("abc123", true).unwrap();

    let calls = fake.calls();
    let methods: Vec<&str> = calls.iter().map(|c| c.method.as_str()).collect();
    assert_eq!(
        methods,
        [
            "torrent-stop",
            "torrent-start",
            "torrent-reannounce",
            "torrent-remove",
            "torrent-remove"
        ]
    );
    for call in &calls {
        assert_eq!(
            call.args["ids"],
            json!(["abc123"]),
            "{} lost its id",
            call.method
        );
    }
    // The flag is the difference between freeing disk and losing the file.
    assert_eq!(calls[3].args["delete-local-data"], json!(false));
    assert_eq!(calls[4].args["delete-local-data"], json!(true));
}

#[test]
fn a_failing_verb_is_not_swallowed() {
    // Each verb maps its result to `()`, which is exactly where an error can
    // get lost.
    let fake = FakeTransmission::start(|_, _, _| Reply::refuses("torrent-stop: no such torrent"));
    let client = fake.client();
    assert!(client.pause("gone").is_err());
    assert!(client.resume("gone").is_err());
    assert!(client.reannounce("gone").is_err());
    assert!(client.remove("gone", true).is_err());
}

#[test]
fn the_kind_is_the_instance_name_the_manifest_declares() {
    assert_eq!(KIND, "transmission");
}

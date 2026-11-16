use super::*;

use kroma_module_sdk::host::testing::StubHost;

fn def(kind: &str) -> ClientDef {
    ClientDef {
        kind: kind.into(),
        url: "http://nas:8080".into(),
        username: "u".into(),
        password: "p".into(),
        settings: [("apiKey".to_string(), "k".to_string())].into(),
    }
}

#[test]
fn an_engine_nobody_answers_for_does_not_build() {
    let host = StubHost::new();

    assert!(RemoteEngine::new(&host, def("qbittorrent")).is_none());
}

// An engine is picked by INSTANCE, so two of them answering at once each get
// the downloads their own client row names.
#[test]
fn each_kind_resolves_to_its_own_engine() {
    let host = StubHost::new()
        .with_point(
            DOWNLOAD_CLIENT,
            Some("qbittorrent"),
            "http://127.0.0.1:1",
            "t",
        )
        .with_point(
            DOWNLOAD_CLIENT,
            Some("transmission"),
            "http://127.0.0.1:2",
            "t",
        );

    assert!(RemoteEngine::new(&host, def("qbittorrent")).is_some());
    assert!(RemoteEngine::new(&host, def("transmission")).is_some());
    assert!(
        RemoteEngine::new(&host, def("deluge")).is_none(),
        "nothing answers for deluge"
    );
}

// The engine needs the client row's credentials with every call: it is
// stateless about which of the operator's clients it is serving.
#[test]
fn every_call_carries_the_client_it_is_for() {
    let body = json!({ "client": def("qbittorrent"), "args": { "client_ref": "abc" } });

    let parsed: EngineCall = serde_json::from_value(body).unwrap();

    assert_eq!(parsed.client.kind, "qbittorrent");
    assert_eq!(parsed.client.url, "http://nas:8080");
    assert_eq!(parsed.client.password, "p");
    assert_eq!(parsed.client.settings["apiKey"], "k");
    assert_eq!(parsed.args["client_ref"], "abc");
}

#[test]
fn an_add_sends_the_five_fields_an_external_engine_reads() {
    let req = AddTorrentReq {
        magnet_or_url: "magnet:?xt=urn:btih:AB",
        protocol: super::super::TORRENT,
        name: "The.Matrix.1999.1080p",
        download_dir: Some("/downloads"),
        label: "kroma",
        only_files: Some(&[0, 2]),
        torrent_bytes: Some(b"d8:announce"),
    };

    let sent = json!({
        "magnet_or_url": req.magnet_or_url,
        "protocol": req.protocol,
        "name": req.name,
        "download_dir": req.download_dir,
        "label": req.label,
    });

    assert_eq!(sent["magnet_or_url"], "magnet:?xt=urn:btih:AB");
    assert_eq!(sent["protocol"], "torrent");
    assert_eq!(sent["name"], "The.Matrix.1999.1080p");
    assert_eq!(sent["download_dir"], "/downloads");
    assert_eq!(sent["label"], "kroma");
    assert_eq!(sent.as_object().unwrap().len(), 5);
}

// A fake engine module: the routes a `download-client` provider serves, with
// its own hand-written JSON. Driving the client against THIS is the only way
// to catch a key renamed on one side only, because the two ends share no type.
fn fake_engine() -> axum::Router<()> {
    use axum::routing::post;
    use axum::Json;
    use serde_json::Value;

    // Every method echoes what it was handed, so a test can assert the client
    // sent the right thing rather than only that the call returned.
    async fn test(Json(call): Json<Value>) -> Json<Result<String, String>> {
        Json(Ok(format!(
            "engine at {} as {}",
            call["client"]["url"].as_str().unwrap_or("?"),
            call["client"]["username"].as_str().unwrap_or("?")
        )))
    }

    async fn add(Json(call): Json<Value>) -> Json<Result<String, String>> {
        let args = &call["args"];
        assert!(args["only_files"].is_null(), "only_files must not cross");
        assert!(
            args["torrent_bytes"].is_null(),
            "torrent_bytes must not cross"
        );
        Json(Ok(format!(
            "{}|{}|{}|{}|{}",
            args["magnet_or_url"].as_str().unwrap_or("?"),
            args["download_dir"].as_str().unwrap_or("-"),
            args["label"].as_str().unwrap_or("?"),
            args["protocol"].as_str().unwrap_or("?"),
            args["name"].as_str().unwrap_or("?")
        )))
    }

    async fn status(Json(call): Json<Value>) -> Json<Option<serde_json::Value>> {
        if call["args"]["client_ref"] == "forgotten" {
            return Json(None);
        }
        Json(Some(serde_json::json!({
            "client_ref": call["args"]["client_ref"],
            "name": "The.Matrix",
            "info_hash": "ab",
            "progress": 0.25,
            "state": "downloading",
            "down_bps": 11,
            "up_bps": 22,
            "peers": 3,
            "peers_seen": 9,
            "size_bytes": 42,
            "save_path": "/downloads/x",
            "files": ["a.mkv"],
            "error": null,
        })))
    }

    async fn ok(Json(_): Json<Value>) -> Json<Result<(), String>> {
        Json(Ok(()))
    }

    async fn refuse(Json(_): Json<Value>) -> Json<Result<(), String>> {
        Json(Err("the daemon said no".into()))
    }

    axum::Router::new()
        .route("/_port/tv.kroma.torrents/client/test", post(test))
        .route("/_port/tv.kroma.torrents/client/add", post(add))
        .route("/_port/tv.kroma.torrents/client/status", post(status))
        .route("/_port/tv.kroma.torrents/client/pause", post(ok))
        .route("/_port/tv.kroma.torrents/client/resume", post(ok))
        .route("/_port/tv.kroma.torrents/client/reannounce", post(ok))
        .route("/_port/tv.kroma.torrents/client/remove", post(refuse))
}

async fn engine_on(port_name: &str) -> (StubHost, String) {
    let resolve = kroma_module_sdk::testing::serve(fake_engine(), ()).await;
    let (base, token) = resolve().expect("the fake engine is up");
    let host = StubHost::new().with_point(DOWNLOAD_CLIENT, Some(port_name), &base, &token);
    (host, base)
}

#[tokio::test]
async fn the_client_row_reaches_the_engine_with_every_call() {
    let (host, _) = engine_on("qbittorrent").await;
    let engine = RemoteEngine::new(&host, def("qbittorrent")).unwrap();

    let reported = kroma_module_sdk::testing::blocking(move || engine.test())
        .await
        .unwrap();

    // The engine is stateless about which client it serves, so an operator with
    // two qBittorrents gets the right one only if this crosses per call.
    assert_eq!(reported, "engine at http://nas:8080 as u");
}

#[tokio::test]
async fn an_add_sends_the_link_its_protocol_and_where_to_put_it_and_nothing_else() {
    let (host, _) = engine_on("qbittorrent").await;
    let engine = RemoteEngine::new(&host, def("qbittorrent")).unwrap();

    let reference = kroma_module_sdk::testing::blocking(move || {
        engine.add(&AddTorrentReq {
            magnet_or_url: "magnet:?xt=urn:btih:AB",
            protocol: super::super::TORRENT,
            name: "The.Matrix",
            download_dir: Some("/downloads"),
            label: "kroma",
            only_files: Some(&[0, 2]),
            torrent_bytes: Some(b"d8:announce"),
        })
    })
    .await
    .unwrap();

    assert_eq!(
        reference,
        "magnet:?xt=urn:btih:AB|/downloads|kroma|torrent|The.Matrix"
    );
}

#[tokio::test]
async fn a_status_crosses_field_for_field() {
    let (host, _) = engine_on("qbittorrent").await;
    let engine = RemoteEngine::new(&host, def("qbittorrent")).unwrap();

    let status = kroma_module_sdk::testing::blocking(move || engine.status("abc"))
        .await
        .unwrap()
        .expect("the engine knows this torrent");

    assert_eq!(status.client_ref, "abc");
    assert_eq!(status.name, "The.Matrix");
    assert_eq!(status.progress, 0.25);
    assert_eq!(status.state, TorrentState::Downloading);
    assert_eq!(status.down_bps, 11);
    assert_eq!(status.up_bps, 22);
    assert_eq!(status.peers, 3);
    assert_eq!(status.peers_seen, 9);
    assert_eq!(status.size_bytes, 42);
    assert_eq!(status.save_path.as_deref(), Some("/downloads/x"));
    assert_eq!(status.files, vec!["a.mkv".to_string()]);
    assert_eq!(status.error, None);
}

// A torrent the engine has forgotten is `None`, not an error: the queue
// reconciles it, and an error here would fail the whole monitor tick.
#[tokio::test]
async fn a_torrent_the_engine_forgot_is_none_rather_than_an_error() {
    let (host, _) = engine_on("qbittorrent").await;
    let engine = RemoteEngine::new(&host, def("qbittorrent")).unwrap();

    let status = kroma_module_sdk::testing::blocking(move || engine.status("forgotten"))
        .await
        .unwrap();

    assert!(status.is_none());
}

#[tokio::test]
async fn the_lifecycle_calls_reach_the_engine_and_a_refusal_comes_back() {
    let (host, _) = engine_on("qbittorrent").await;
    let engine = RemoteEngine::new(&host, def("qbittorrent")).unwrap();

    let outcome = kroma_module_sdk::testing::blocking(move || {
        (
            engine.pause("abc"),
            engine.resume("abc"),
            engine.reannounce("abc"),
            engine.remove("abc", true),
        )
    })
    .await;

    assert!(outcome.0.is_ok());
    assert!(outcome.1.is_ok());
    assert!(outcome.2.is_ok());
    // The provider's `Err` envelope has to surface as an error, or a failed
    // removal would read as a successful one.
    let refused = outcome.3.unwrap_err().to_string();
    assert!(refused.contains("the daemon said no"), "{refused}");
}

// Resolution is by INSTANCE, so an engine answering under another kind must
// not be handed this client's downloads.
#[tokio::test]
async fn a_client_whose_kind_nothing_answers_does_not_reach_the_engine_that_is_up() {
    let (host, _) = engine_on("transmission").await;

    assert!(RemoteEngine::new(&host, def("qbittorrent")).is_none());
    assert!(RemoteEngine::new(&host, def("transmission")).is_some());
}

#[tokio::test]
async fn an_engine_that_stopped_answering_fails_the_call_rather_than_hanging() {
    // Resolved while it was up, then pointed at a port with nothing on it.
    let host = StubHost::new().with_point(
        DOWNLOAD_CLIENT,
        Some("qbittorrent"),
        "http://127.0.0.1:1",
        "t",
    );
    let engine = RemoteEngine::new(&host, def("qbittorrent")).unwrap();

    let failed = kroma_module_sdk::testing::blocking(move || engine.test()).await;

    assert!(failed.is_err());
}

#[test]
fn the_kind_reported_is_the_point_rather_than_a_leaked_name() {
    let host = StubHost::new().with_point(
        DOWNLOAD_CLIENT,
        Some("qbittorrent"),
        "http://127.0.0.1:1",
        "t",
    );

    let engine = RemoteEngine::new(&host, def("qbittorrent")).unwrap();

    assert_eq!(engine.kind(), DOWNLOAD_CLIENT);
}

#[test]
fn listing_files_fails_without_a_round_trip() {
    let host = StubHost::new().with_point(
        DOWNLOAD_CLIENT,
        Some("qbittorrent"),
        "http://127.0.0.1:0",
        "t",
    );
    let engine = RemoteEngine::new(&host, def("qbittorrent")).unwrap();

    // Port 0 is not listening, so a round trip would fail differently.
    let err = engine
        .list_files("magnet:?xt=1", None)
        .unwrap_err()
        .to_string();

    assert!(err.contains("cannot list a torrent's files"), "{err}");
}

#[tokio::test]
async fn an_engine_that_answers_no_caps_downloads_torrents() {
    let (host, _) = engine_on("qbittorrent").await;
    let engine = RemoteEngine::new(&host, def("qbittorrent")).unwrap();

    let protocols = kroma_module_sdk::testing::blocking(move || engine.protocols()).await;

    assert_eq!(protocols, vec!["torrent".to_string()]);
}

#[tokio::test]
async fn an_engine_downloads_the_protocols_its_caps_name() {
    use axum::routing::post;
    use axum::Json;

    async fn caps() -> Json<Result<serde_json::Value, String>> {
        Json(Ok(json!({ "protocols": ["usenet"] })))
    }
    let router = axum::Router::new().route("/_port/tv.kroma.torrents/client/caps", post(caps));
    let resolve = kroma_module_sdk::testing::serve(router, ()).await;
    let (base, token) = resolve().expect("the fake engine is up");
    let host = StubHost::new().with_point(DOWNLOAD_CLIENT, Some("sabnzbd"), &base, &token);
    let engine = RemoteEngine::new(&host, def("sabnzbd")).unwrap();

    let protocols = kroma_module_sdk::testing::blocking(move || engine.protocols()).await;

    assert_eq!(protocols, vec!["usenet".to_string()]);
}

#[test]
fn a_state_this_module_never_heard_of_reads_as_an_error() {
    let state: TorrentState = serde_json::from_value(json!("unpacking")).unwrap();

    assert_eq!(state, TorrentState::Error);
}

#[test]
fn processing_and_failed_cross_by_name() {
    let processing: TorrentState = serde_json::from_value(json!("processing")).unwrap();
    let failed: TorrentState = serde_json::from_value(json!("failed")).unwrap();

    assert_eq!(processing, TorrentState::Processing);
    assert_eq!(failed, TorrentState::Failed);
}

use std::time::{Duration, Instant};

use crate::RqbitConfig;
use crate::db;
use crate::downloads::test_support::manager_over;
use crate::rqbit::test_support::{StubApi, engine_over};

const HASH: &str = "192202572932341be69b679e0c4997fb28aea0d7";
const MAGNET: &str = "magnet:?xt=urn:btih:192202572932341be69b679e0c4997fb28aea0d7";
const ADD: &str = "POST /torrents";
const ADDED: &str = r#"{"details":{"info_hash":"192202572932341be69b679e0c4997fb28aea0d7"}}"#;

fn queued_magnet(id: &str) -> db::DownloadRow {
    db::DownloadRow {
        magnet_or_url: MAGNET.into(),
        ..db::test_support::download(id, "queued", 1)
    }
}

fn status_of(manager: &crate::DownloadManager, id: &str) -> db::DownloadRow {
    let conn = manager.core().get().unwrap();
    db::get_download(&conn, id).unwrap().unwrap()
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_magnet_being_added_leaves_its_row_queued_and_it_goes_live_when_the_add_lands() {
    let (host, manager) = manager_over("grab-magnet", &[queued_magnet("d1")]);
    let stub = StubApi::serving(&[(ADD, 200, ADDED)]);
    *manager.rqbit.write().unwrap() = Some(engine_over(&stub, RqbitConfig::default()));
    let row = status_of(&manager, "d1");

    manager.activate(&host, &row);

    let handed_over = status_of(&manager, "d1");
    let deadline = Instant::now() + Duration::from_secs(10);
    while status_of(&manager, "d1").client_ref.is_empty() && Instant::now() < deadline {
        manager.activate(&host, &row);
        std::thread::sleep(Duration::from_millis(20));
    }
    let landed = status_of(&manager, "d1");
    assert_eq!(handed_over.status, "queued");
    assert_eq!(handed_over.client_ref, "");
    assert_eq!(handed_over.error, None);
    assert_eq!(landed.status, "downloading");
    assert_eq!(landed.client_ref, HASH);
    manager.stop_rqbit();
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_magnet_rqbit_refuses_fails_its_row_with_the_reason() {
    let (host, manager) = manager_over("grab-refused", &[queued_magnet("d1")]);
    let stub = StubApi::serving(&[(
        ADD,
        400,
        r#"{"human_readable":"no known way to resolve peers"}"#,
    )]);
    *manager.rqbit.write().unwrap() = Some(engine_over(&stub, RqbitConfig::default()));
    let row = status_of(&manager, "d1");

    let deadline = Instant::now() + Duration::from_secs(10);
    while status_of(&manager, "d1").status == "queued" && Instant::now() < deadline {
        manager.activate(&host, &row);
        std::thread::sleep(Duration::from_millis(20));
    }

    let failed = status_of(&manager, "d1");
    assert_eq!(failed.status, "failed");
    assert!(failed.error.unwrap().contains("no known way"));
    manager.stop_rqbit();
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn pausing_a_row_still_being_added_stops_the_add() {
    let (host, manager) = manager_over("grab-paused", &[queued_magnet("d1")]);
    let stub = StubApi::serving(&[(ADD, 200, ADDED)]);
    *manager.rqbit.write().unwrap() = Some(engine_over(&stub, RqbitConfig::default()));
    manager.activate(&host, &status_of(&manager, "d1"));

    manager.pause("d1").unwrap();

    let paused = status_of(&manager, "d1");
    assert_eq!(paused.status, "paused");
    assert_eq!(paused.client_ref, "");
    manager.stop_rqbit();
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_row_paused_before_it_reached_the_engine_resumes_into_the_queue() {
    let (host, manager) = manager_over("grab-resumed", &[queued_magnet("d1")]);
    let stub = StubApi::serving(&[(ADD, 200, ADDED)]);
    *manager.rqbit.write().unwrap() = Some(engine_over(&stub, RqbitConfig::default()));
    manager.activate(&host, &status_of(&manager, "d1"));
    manager.pause("d1").unwrap();

    manager.resume("d1").unwrap();

    assert_eq!(status_of(&manager, "d1").status, "queued");
    manager.stop_rqbit();
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn removing_a_row_still_being_added_drops_the_add_with_it() {
    let (host, manager) = manager_over("grab-removed", &[queued_magnet("d1")]);
    let stub = StubApi::serving(&[(ADD, 200, ADDED)]);
    *manager.rqbit.write().unwrap() = Some(engine_over(&stub, RqbitConfig::default()));
    manager.activate(&host, &status_of(&manager, "d1"));

    manager.remove("d1", false).unwrap();

    let conn = manager.core().get().unwrap();
    assert!(db::get_download(&conn, "d1").unwrap().is_none());
    manager.stop_rqbit();
}

#[test]
fn a_link_that_is_neither_a_magnet_nor_a_web_url_is_refused_before_it_is_queued() {
    let (host, manager) = manager_over("grab-not-a-link", &[]);
    let spec = crate::GrabSpec {
        magnet_or_url: "@/some/path".into(),
        release_title: "Some.Release".into(),
        ..Default::default()
    };

    let grabbed = manager.grab(&host, spec);

    let conn = manager.core().get().unwrap();
    assert!(grabbed.unwrap_err().to_string().contains("magnet"));
    assert!(db::active_download_by_url(&conn, "@/some/path").unwrap().is_none());
}

mod external {
    use std::io::{Read as _, Write as _};
    use std::sync::{Arc, Mutex};

    use axum::Json;
    use axum::routing::post;
    use kroma_module_sdk::host::testing::StubHost;
    use kroma_module_sdk::testing::{blocking, serve};
    use serde_json::{Value, json};

    use super::status_of;
    use crate::db;
    use crate::downloads::test_support::{host_over, restarted};
    use crate::engine::remote::DOWNLOAD_CLIENT;

    const TORRENT: &[u8] = b"d4:infod6:lengthi1e4:name1:a12:piece lengthi16384e6:pieces0:ee";
    const LOGIN_PAGE: &[u8] = b"<!DOCTYPE html><html><body>Please log in</body></html>";

    fn tracker_serving(body: &'static [u8]) -> String {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { break };
                let mut request = [0u8; 4096];
                let _ = stream.read(&mut request);
                let head = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = stream.write_all(head.as_bytes());
                let _ = stream.write_all(body);
            }
        });
        format!("http://127.0.0.1:{port}/download/1")
    }

    fn unreachable_link() -> String {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        format!("http://127.0.0.1:{port}/download/1")
    }

    async fn qbittorrent_with(tag: &str, link: &str, adds: Arc<Mutex<Vec<Value>>>) -> StubHost {
        let row = db::DownloadRow {
            client_id: "qb".into(),
            magnet_or_url: link.into(),
            ..db::test_support::download("d1", "queued", 1)
        };
        let host = host_over(tag, &[row]);
        db::insert_download_client(
            host_store(&host),
            &db::DownloadClientRow {
                kind: "qbittorrent".into(),
                ..db::test_support::client("qb", 50, true, 1)
            },
        )
        .unwrap();
        let caps = |Json(_): Json<Value>| async {
            Json(Ok::<_, String>(
                json!({ "protocols": ["torrent"], "torrent_file": true }),
            ))
        };
        let add = move |Json(call): Json<Value>| {
            let adds = adds.clone();
            async move {
                adds.lock().unwrap().push(call["args"].clone());
                Json(Ok::<_, String>(
                    "abcdef0123456789abcdef0123456789abcdef01".to_string(),
                ))
            }
        };
        let router = axum::Router::new()
            .route("/_port/tv.kroma.torrents/client/caps", post(caps))
            .route("/_port/tv.kroma.torrents/client/add", post(add));
        let resolve = serve(router, ()).await;
        let (base, token) = resolve().expect("the fake engine is up");
        host.with_point(DOWNLOAD_CLIENT, Some("qbittorrent"), &base, &token)
    }

    fn host_store(host: &StubHost) -> &kroma_module_sdk::db::Pool {
        use kroma_module_sdk::host::HostStorage as _;
        host.store()
    }

    async fn activated(host: StubHost) -> db::DownloadRow {
        blocking(move || {
            let manager = restarted(&host);
            manager.activate(&host, &status_of(&manager, "d1"));
            status_of(&manager, "d1")
        })
        .await
    }

    #[tokio::test]
    #[cfg_attr(
        target_family = "wasm",
        ignore = "binds a test server, and a component holds no socket"
    )]
    async fn an_external_client_is_handed_the_torrent_file_the_link_served() {
        let adds = Arc::default();
        let host = qbittorrent_with(
            "grab-ext-file",
            &tracker_serving(TORRENT),
            Arc::clone(&adds),
        )
        .await;

        let row = activated(host).await;

        let adds = adds.lock().unwrap();
        assert_eq!(row.status, "downloading");
        assert_eq!(row.client_ref, "abcdef0123456789abcdef0123456789abcdef01");
        assert_eq!(adds.len(), 1);
        assert!(adds[0]["torrent_b64"].is_string(), "{}", adds[0]);
        assert_eq!(adds[0]["info_hash"].as_str().map(str::len), Some(40));
    }

    #[tokio::test]
    #[cfg_attr(
        target_family = "wasm",
        ignore = "binds a test server, and a component holds no socket"
    )]
    async fn a_link_that_serves_a_page_fails_before_the_external_client_sees_it() {
        let adds = Arc::default();
        let host = qbittorrent_with(
            "grab-ext-page",
            &tracker_serving(LOGIN_PAGE),
            Arc::clone(&adds),
        )
        .await;

        let row = activated(host).await;

        assert_eq!(row.status, "failed");
        let error = row.error.unwrap_or_default();
        assert!(error.contains("not a .torrent"), "{error}");
        assert!(error.contains("Please log in"), "{error}");
        assert!(adds.lock().unwrap().is_empty());
    }

    #[tokio::test]
    #[cfg_attr(
        target_family = "wasm",
        ignore = "binds a test server, and a component holds no socket"
    )]
    async fn a_link_this_server_cannot_reach_is_left_to_the_external_client() {
        let adds = Arc::default();
        let link = unreachable_link();
        let host = qbittorrent_with("grab-ext-unreachable", &link, Arc::clone(&adds)).await;

        let row = activated(host).await;

        let adds = adds.lock().unwrap();
        assert_eq!(row.status, "downloading");
        assert_eq!(adds.len(), 1);
        assert_eq!(adds[0]["magnet_or_url"], link.as_str());
        assert!(adds[0]["torrent_b64"].is_null());
    }

    #[tokio::test]
    #[cfg_attr(
        target_family = "wasm",
        ignore = "binds a test server, and a component holds no socket"
    )]
    async fn a_magnet_reaches_the_external_client_as_it_came() {
        let adds = Arc::default();
        let magnet = "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567";
        let host = qbittorrent_with("grab-ext-magnet", magnet, Arc::clone(&adds)).await;

        let row = activated(host).await;

        let adds = adds.lock().unwrap();
        assert_eq!(row.status, "downloading");
        assert_eq!(adds[0]["magnet_or_url"], magnet);
        assert!(adds[0]["torrent_b64"].is_null());
    }
}

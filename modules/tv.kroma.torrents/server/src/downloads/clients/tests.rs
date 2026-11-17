use kroma_module_sdk::host::testing::StubHost;
use kroma_module_sdk::host::HostStorage as _;

use crate::db::{self, DownloadClientRow};
use crate::downloads::test_support::{host_over, restarted};
use crate::engine::remote::DOWNLOAD_CLIENT;
use crate::GrabSpec;

async fn usenet_engine() -> (String, String) {
    use axum::routing::post;
    use axum::Json;

    async fn caps() -> Json<Result<serde_json::Value, String>> {
        Json(Ok(serde_json::json!({ "protocols": ["usenet"] })))
    }
    let router = axum::Router::new().route("/_port/tv.kroma.torrents/client/caps", post(caps));
    let resolve = kroma_module_sdk::testing::serve(router, ()).await;
    resolve().expect("the fake engine is up")
}

fn with_sabnzbd(host: &StubHost) {
    let sab = DownloadClientRow {
        kind: "sabnzbd".into(),
        ..db::test_support::client("sab", 50, true, 2)
    };
    db::insert_download_client(host.store(), &sab).unwrap();
}

fn nzb_grab() -> GrabSpec {
    GrabSpec {
        magnet_or_url: "https://indexer.example/42.nzb".into(),
        protocol: "usenet".into(),
        kind: "movie".into(),
        release_title: "The.Matrix.1999.1080p.BluRay.x264-GRP".into(),
        ..Default::default()
    }
}

#[tokio::test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
async fn a_grab_goes_to_the_client_that_takes_its_protocol() {
    let (base, token) = usenet_engine().await;
    let host = host_over("route-usenet", &[]).with_point(DOWNLOAD_CLIENT, Some("sabnzbd"), &base, &token);
    with_sabnzbd(&host);
    let manager = restarted(&host);

    let row = kroma_module_sdk::testing::blocking(move || manager.grab(&host, nzb_grab()))
        .await
        .unwrap();

    assert_eq!(row.client_id, "sab");
    assert_eq!(row.protocol, "usenet");
    assert_eq!(row.save_path, None, "an external client picks its own folder");
}

#[tokio::test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
async fn a_grab_that_names_no_protocol_still_goes_to_a_torrent_client() {
    let (base, token) = usenet_engine().await;
    let host = host_over("route-torrent", &[]).with_point(DOWNLOAD_CLIENT, Some("sabnzbd"), &base, &token);
    with_sabnzbd(&host);
    let manager = restarted(&host);
    let magnet = GrabSpec {
        magnet_or_url: "magnet:?xt=urn:btih:192202572932341be69b679e0c4997fb28aea0d7".into(),
        protocol: String::new(),
        ..nzb_grab()
    };

    let row = kroma_module_sdk::testing::blocking(move || manager.grab(&host, magnet))
        .await
        .unwrap();

    assert_eq!(row.client_id, db::EMBEDDED_CLIENT_ID);
    assert_eq!(row.protocol, "torrent");
}

#[test]
fn a_grab_no_client_takes_names_the_missing_protocol() {
    let host = host_over("route-missing", &[]);
    let manager = restarted(&host);

    let err = manager.grab(&host, nzb_grab()).unwrap_err().to_string();

    assert!(err.contains("usenet"), "{err}");
}

#[test]
fn the_embedded_engine_downloads_torrents_before_it_has_started() {
    let host = host_over("route-embedded", &[]);
    let manager = restarted(&host);
    let embedded = db::get_download_client(&host.store().get().unwrap(), db::EMBEDDED_CLIENT_ID)
        .unwrap()
        .unwrap();

    assert_eq!(manager.protocols_of(&embedded), vec!["torrent".to_string()]);
}

#[tokio::test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
async fn the_kill_switch_holds_a_torrent_grab_and_lets_a_usenet_one_through() {
    let (base, token) = usenet_engine().await;
    let host = host_over("held-usenet", &[]).with_point(DOWNLOAD_CLIENT, Some("sabnzbd"), &base, &token);
    with_sabnzbd(&host);
    let manager = restarted(&host);
    manager.gate_open.store(false, std::sync::atomic::Ordering::Relaxed);
    let magnet = GrabSpec {
        magnet_or_url: "magnet:?xt=urn:btih:192202572932341be69b679e0c4997fb28aea0d7".into(),
        protocol: "torrent".into(),
        ..nzb_grab()
    };

    let (held, usenet, takes) = kroma_module_sdk::testing::blocking(move || {
        let held = manager.grab(&host, magnet).unwrap_err().to_string();
        let usenet = manager.grab(&host, nzb_grab()).map(|row| row.protocol);
        (held, usenet, manager.takes_grabs())
    })
    .await;

    assert!(held.contains("kill switch"), "{held}");
    assert_eq!(usenet.unwrap(), "usenet");
    assert!(takes, "a usenet client still takes grabs");
}

#[test]
fn a_closed_gate_with_only_torrent_clients_takes_no_grab() {
    let host = host_over("held-torrent-only", &[]);
    let manager = restarted(&host);
    manager.gate_open.store(false, std::sync::atomic::Ordering::Relaxed);

    assert_eq!(manager.held_protocols(), vec!["torrent".to_string()]);
    assert!(!manager.takes_grabs());
}

#[test]
fn an_open_gate_holds_nothing() {
    let host = host_over("held-none", &[]);
    let manager = restarted(&host);

    assert!(manager.held_protocols().is_empty());
    assert!(manager.takes_grabs());
}

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

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use axum::extract::State;
use axum::routing::post;
use axum::Json;
use kroma_module_sdk::host::testing::StubHost;
use kroma_module_sdk::host::HostStorage as _;
use kroma_module_sdk::testing::blocking;

use crate::db::{self, DownloadClientRow, DownloadRow};
use crate::downloads::test_support::{host_over, restarted};
use crate::engine::remote::DOWNLOAD_CLIENT;

async fn counting_engine() -> (String, String, Arc<AtomicUsize>) {
    async fn add(State(adds): State<Arc<AtomicUsize>>) -> Json<Result<String, String>> {
        Json(Ok((adds.fetch_add(1, Ordering::SeqCst) + 1).to_string()))
    }
    let adds = Arc::new(AtomicUsize::new(0));
    let router = axum::Router::new().route("/_port/tv.kroma.torrents/client/add", post(add));
    let resolve = kroma_module_sdk::testing::serve(router, adds.clone()).await;
    let (base, token) = resolve().expect("the fake engine is up");
    (base, token, adds)
}

fn queued_nzb() -> DownloadRow {
    DownloadRow {
        client_id: "sab".into(),
        protocol: "usenet".into(),
        magnet_or_url: "https://indexer.example/42.nzb".into(),
        ..db::test_support::download("d1", "queued", 1)
    }
}

async fn usenet_queue(tag: &str) -> (StubHost, Arc<AtomicUsize>) {
    let (base, token, adds) = counting_engine().await;
    let host = host_over(tag, &[queued_nzb()]).with_point(DOWNLOAD_CLIENT, Some("sabnzbd"), &base, &token);
    let sab = DownloadClientRow {
        kind: "sabnzbd".into(),
        ..db::test_support::client("sab", 50, true, 2)
    };
    db::insert_download_client(host.store(), &sab).unwrap();
    (host, adds)
}

fn read(host: &StubHost, id: &str) -> DownloadRow {
    db::get_download(&host.db().get().unwrap(), id).unwrap().unwrap()
}

#[tokio::test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
async fn a_row_read_before_its_add_landed_is_not_handed_to_the_engine_again() {
    let (host, adds) = usenet_queue("claim-stale").await;
    let manager = restarted(&host);
    let stale = read(&host, "d1");

    let ran = host.clone();
    blocking(move || {
        manager.activate(&ran, &stale);
        manager.activate(&ran, &stale);
    })
    .await;

    assert_eq!(adds.load(Ordering::SeqCst), 1);
    let row = read(&host, "d1");
    assert_eq!(row.status, "downloading");
    assert_eq!(row.client_ref, "1");
}

#[tokio::test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
async fn a_row_another_call_is_handing_over_is_left_to_that_call() {
    let (host, adds) = usenet_queue("claim-held").await;
    let manager = restarted(&host);
    let row = read(&host, "d1");

    let ran = host.clone();
    blocking(move || {
        let held = manager.claim_add("d1");
        manager.activate(&ran, &row);
        drop(held);
    })
    .await;

    assert_eq!(adds.load(Ordering::SeqCst), 0);
    assert_eq!(read(&host, "d1").status, "queued");
}

#[test]
fn a_row_that_left_the_queue_is_not_claimed() {
    let host = host_over("claim-paused", &[db::test_support::download("d1", "paused", 1)]);
    let manager = restarted(&host);

    let claimed = manager.claim_add("d1");

    assert!(claimed.is_none());
}

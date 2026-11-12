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

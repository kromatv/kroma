use std::path::{Path, PathBuf};
use std::sync::Arc;

use kroma_module_sdk::host::NetworkSeal;
use kroma_module_sdk::host::testing::StubHost;

use super::*;
use crate::downloads::test_support::{added, host_over, manager_with_helper, restarted};
use crate::rqbit::test_support::{StubApi, dumping_to, helper_script, read_dump};

const ROOT: &str = "GET /";
const ANSWERS: &str = r#"{"server":"rqbit","version":"9.1.0"}"#;

fn helper_dumping_its_command(dir: &Path) -> PathBuf {
    let dump = dir.join("command");
    helper_script(dir, &dumping_to(&dump));
    dump
}

fn ports_at(data_dir: &Path, api: u16, peers: u16) {
    let state = data_dir.join("torrents");
    std::fs::create_dir_all(&state).unwrap();
    std::fs::write(
        state.join("engine-ports.json"),
        format!(r#"{{"api":{api},"peers":{peers}}}"#),
    )
    .unwrap();
}

fn world(tag: &str, host: StubHost) -> (StubHost, StubApi, Arc<DownloadManager>, PathBuf) {
    let stub = StubApi::serving(&[(ROOT, 200, ANSWERS)]);
    let dump = helper_dumping_its_command(host.data_dir());
    ports_at(host.data_dir(), stub.port, 27_222);
    let manager = manager_with_helper(tag, &host, host.data_dir().join("fake-rqbit"));
    (host, stub, manager, dump)
}

#[tokio::test]
async fn with_no_network_on_offer_the_helper_keeps_dht_and_trackers_and_dials_through_the_gateway()
{
    let (host, _stub, manager, dump) = world("engine-open", host_over("engine-open", &[]));

    manager.ensure_rqbit(&host).await;

    let command = read_dump(&dump);
    assert!(manager.rqbit().is_some());
    assert!(!manager.rqbit().unwrap().is_sealed());
    assert!(!command.contains("--disable-dht\n"), "{command}");
    assert!(!command.contains("--disable-trackers\n"), "{command}");
    assert!(command.contains("--listen-port\n27222\n"), "{command}");
    assert!(
        command.contains("RQBIT_SOCKS_PROXY_URL={gateway:peers}\n"),
        "{command}"
    );
    manager.stop_rqbit();
}

#[tokio::test]
async fn behind_a_network_that_is_up_only_tunnelled_tcp_is_left_on() {
    let base = host_over("engine-sealed", &[]).with_network_seal(NetworkSeal::Up);
    let (host, _stub, manager, dump) = world("engine-sealed", base);

    manager.ensure_rqbit(&host).await;

    let command = read_dump(&dump);
    assert!(manager.rqbit().unwrap().is_sealed());
    assert!(command.contains("--disable-dht\n"), "{command}");
    assert!(command.contains("--disable-trackers\n"), "{command}");
    assert!(command.contains("--disable-tcp-listen\n"), "{command}");
    assert!(command.contains("--ipv4-only\n"), "{command}");
    assert!(!command.contains("--listen-port\n"), "{command}");
    assert!(
        command.contains("RQBIT_SOCKS_PROXY_URL={gateway:peers.vpn}\n"),
        "{command}"
    );
    manager.stop_rqbit();
}

#[tokio::test]
async fn while_a_network_must_carry_the_peers_and_is_down_the_helper_does_not_start() {
    let base = host_over("engine-deferred", &[]).with_network_seal(NetworkSeal::Down);
    let (host, _stub, manager, dump) = world("engine-deferred", base);

    manager.ensure_rqbit(&host).await;

    assert!(manager.rqbit().is_none());
    assert!(!dump.exists());
}

#[tokio::test]
async fn while_the_embedded_client_is_disabled_the_helper_does_not_start() {
    let (host, _stub, manager, dump) = world("engine-off", host_over("engine-off", &[]));
    crate::db::update_download_client(
        manager.store(),
        crate::db::EMBEDDED_CLIENT_ID,
        None,
        None,
        None,
        None,
        Some(false),
        None,
    )
    .unwrap();

    manager.ensure_rqbit(&host).await;

    assert!(manager.rqbit().is_none());
    assert!(!dump.exists());
}

#[tokio::test]
async fn a_port_the_operator_named_wins_over_the_one_chosen_for_the_helper() {
    let base = host_over("engine-named", &[]).with_setting("rqbitPort", serde_json::json!(51413));
    let (host, _stub, manager, dump) = world("engine-named", base);

    manager.ensure_rqbit(&host).await;

    let command = read_dump(&dump);
    assert!(command.contains("--listen-port\n51413\n"), "{command}");
    manager.stop_rqbit();
}

#[tokio::test]
async fn a_failed_start_chooses_new_ports_and_counts_towards_the_backoff() {
    let host = host_over("engine-fail", &[]);
    ports_at(host.data_dir(), 27_001, 27_002);
    helper_script(host.data_dir(), "exit 1");
    let manager = manager_with_helper("engine-fail", &host, host.data_dir().join("fake-rqbit"));

    manager.ensure_rqbit(&host).await;

    assert!(manager.rqbit().is_none());
    assert_eq!(manager.start_retry(), std::time::Duration::from_secs(6));
    assert_ne!(ports::chosen(&host.data_dir().join("torrents")).api, 27_001);
}

#[test]
fn a_row_that_never_reached_the_engine_goes_back_to_the_queue_after_a_disable() {
    let queued = crate::db::test_support::download("q1", "queued", 1);
    let host = host_over("engine-reenable", &[queued, added("d1")]);
    let manager = restarted(&host);

    manager.disable_embedded();
    manager.resume_after_enable();

    let conn = manager.core().get().unwrap();
    assert_eq!(
        crate::db::get_download(&conn, "q1")
            .unwrap()
            .unwrap()
            .status,
        "queued"
    );
    assert_eq!(
        crate::db::get_download(&conn, "d1")
            .unwrap()
            .unwrap()
            .status,
        "downloading"
    );
}

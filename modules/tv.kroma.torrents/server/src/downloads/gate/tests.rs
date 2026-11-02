use kroma_module_sdk::host::NetworkSeal;
use kroma_module_sdk::host::testing::StubHost;
use serde_json::json;

use crate::db;
use crate::downloads::test_support::{added, host_over, restarted};
use crate::rqbit::test_support::{StubApi, engine_over};
use crate::test_support::http_echo;
use crate::{DownloadManager, GrabSpec, RqbitConfig};

const PAUSE: &str = "POST /torrents/deadbeef/pause";

fn behind_a_dead_tunnel(tag: &str) -> (StubHost, std::sync::Arc<DownloadManager>, StubApi) {
    let host = host_over(tag, &[added("d1")])
        .with_network_seal(NetworkSeal::Up)
        .with_setting("vpnKillSwitch", json!(true))
        .with_setting("vpnCheckUrl", json!(http_echo("203.0.113.7")));
    let manager = restarted(&host);
    let stub = StubApi::serving(&[(PAUSE, 200, "{}")]);
    let sealed = RqbitConfig {
        sealed: true,
        ..RqbitConfig::default()
    };
    *manager.rqbit.write().unwrap() = Some(engine_over(&stub, sealed));
    (host, manager, stub)
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn one_failed_probe_does_not_close_the_gate() {
    let (host, manager, stub) = behind_a_dead_tunnel("gate-blip");

    manager.vpn_check(&host);

    assert!(manager.gate_open());
    assert!(stub.seen(PAUSE).is_empty());
    manager.stop_rqbit();
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_sustained_failure_with_the_kill_switch_on_pauses_the_torrent_and_refuses_new_grabs() {
    let (host, manager, stub) = behind_a_dead_tunnel("gate-closed");

    manager.vpn_check(&host);
    manager.vpn_check(&host);

    let conn = manager.core().get().unwrap();
    let row = db::get_download(&conn, "d1").unwrap().unwrap();
    let spec = GrabSpec {
        magnet_or_url: "magnet:?xt=urn:btih:ab".into(),
        ..GrabSpec::default()
    };
    assert!(!manager.gate_open());
    assert_eq!(stub.seen(PAUSE).len(), 1);
    assert_eq!(row.status, "paused");
    assert!(manager.grab(&host, spec).is_err());
    assert!(manager.vpn_status().unwrap().paused);
    manager.stop_rqbit();
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn with_the_kill_switch_off_a_failure_is_reported_and_nothing_is_paused() {
    let (host, manager, stub) = behind_a_dead_tunnel("gate-off");
    let host = host.with_setting("vpnKillSwitch", json!(false));

    manager.vpn_check(&host);
    manager.vpn_check(&host);

    assert!(manager.gate_open());
    assert!(stub.seen(PAUSE).is_empty());
    assert!(!manager.vpn_status().unwrap().connected);
    manager.stop_rqbit();
}

#[test]
fn with_no_network_on_offer_the_gate_stays_open_and_nothing_is_probed() {
    let host = host_over("gate-dormant", &[]);
    let manager = restarted(&host);

    assert!(manager.vpn_check(&host).is_none());
    assert!(manager.gate_open());
    assert!(manager.vpn_status().is_none());
}

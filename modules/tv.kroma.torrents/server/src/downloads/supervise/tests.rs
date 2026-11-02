use std::time::{Duration, Instant};

use kroma_module_sdk::host::NetworkSeal;
use kroma_module_sdk::host::testing::StubHost;

use super::*;
use crate::RqbitConfig;
use crate::downloads::test_support::{added, host_over, restarted};
use crate::rqbit::test_support::{StubApi, engine_over};

#[test]
fn a_helper_that_ended_is_let_go_so_the_monitor_starts_another() {
    let host = host_over("engine-died", &[added("d1")]);
    let manager = restarted(&host);
    let stub = StubApi::serving(&[]);
    let engine = engine_over(&stub, RqbitConfig::default());
    engine.stop();
    let deadline = Instant::now() + Duration::from_secs(5);
    while engine.exited().is_none() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(10));
    }
    *manager.rqbit.write().unwrap() = Some(engine);

    manager.watch_helper();

    assert!(manager.rqbit().is_none());
    assert_eq!(
        manager.embedded_state(true),
        Some(crate::EngineState::Starting)
    );
    assert_eq!(manager.start_retry(), START_RETRY);
}

#[test]
fn a_helper_that_is_running_is_left_alone() {
    let host = host_over("engine-alive", &[]);
    let manager = restarted(&host);
    let stub = StubApi::serving(&[]);
    *manager.rqbit.write().unwrap() = Some(engine_over(&stub, RqbitConfig::default()));

    manager.watch_helper();

    assert_eq!(
        manager.embedded_state(true),
        Some(crate::EngineState::Ready)
    );
    manager.stop_rqbit();
}

fn engine_started(sealed: bool, seal: NetworkSeal, tag: &str) -> bool {
    on_the_wrong_side(sealed, host_over(tag, &[]).with_network_seal(seal))
}

fn on_the_wrong_side(sealed: bool, host: StubHost) -> bool {
    let manager = restarted(&host);
    let stub = StubApi::serving(&[]);
    let cfg = RqbitConfig {
        sealed,
        ..RqbitConfig::default()
    };
    *manager.rqbit.write().unwrap() = Some(engine_over(&stub, cfg));

    let wrong = manager.helper_on_the_wrong_side(&host);

    manager.stop_rqbit();
    wrong
}

#[test]
fn a_helper_started_in_the_open_is_on_the_wrong_side_of_a_network_that_appeared() {
    assert!(engine_started(false, NetworkSeal::Up, "side-up"));
    assert!(engine_started(false, NetworkSeal::Down, "side-down"));
}

#[test]
fn a_sealed_helper_is_on_the_wrong_side_only_once_no_network_is_on_offer() {
    assert!(engine_started(true, NetworkSeal::None, "side-gone"));
    assert!(!engine_started(true, NetworkSeal::Up, "side-sealed-up"));
    assert!(!engine_started(true, NetworkSeal::Down, "side-sealed-down"));
    assert!(!engine_started(false, NetworkSeal::None, "side-open"));
}

#[test]
fn a_helper_started_in_the_open_is_on_the_wrong_side_once_the_kill_switch_is_on() {
    let host = host_over("side-kill-switch", &[])
        .with_setting("vpnKillSwitch", serde_json::json!(true));

    assert!(on_the_wrong_side(false, host));
}

#[test]
fn a_helper_that_keeps_dying_is_restarted_less_and_less_often() {
    let waits: Vec<u64> = [0, 1, 2, 3, 4, 7, 50]
        .into_iter()
        .map(|failures| start_retry_after(failures).as_secs())
        .collect();

    assert_eq!(waits, [6, 6, 12, 24, 48, 300, 300]);
}

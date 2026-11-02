use std::sync::Arc;
use std::sync::mpsc::Receiver;

use kroma_module_sdk::host::HostCtx as _;

use crate::downloads::test_support::{added, host_over, restarted};
use crate::rqbit::test_support::{StubApi, engine_over};
use crate::test_support::{Asked, socks5_serving};
use crate::{DownloadManager, RqbitConfig};

const HASH: &str = "deadbeef";
const LIST: &str = "GET /torrents";
const DETAILS: &str = "GET /torrents/deadbeef";
const ADD_PEERS: &str = "POST /torrents/deadbeef/add_peers";
const FILES: &str = r#"{"info_hash":"deadbeef","files":[]}"#;
const TORRENT: &[u8] = b"d8:announce26:http://t1.invalid/announce4:infod3:foo3:baree";

struct Session {
    manager: Arc<DownloadManager>,
    rqbit: StubApi,
    tracker: Receiver<Asked>,
}

fn listing(live_peers: u32) -> String {
    format!(
        r#"{{"torrents":[{{"info_hash":"{HASH}","name":"data","stats":{{"state":"live",
        "progress_bytes":30,"total_bytes":100,"finished":false,
        "live":{{"snapshot":{{"peer_stats":{{"live":{live_peers},"seen":4}}}}}}}}}}]}}"#
    )
}

fn tracker_answer() -> Vec<u8> {
    let mut answer = b"d5:peers6:".to_vec();
    answer.extend_from_slice(&[198, 51, 100, 1, 0x1a, 0xe1]);
    answer.push(b'e');
    answer
}

fn sealed_session(tag: &str, live_peers: u32) -> Session {
    let host = host_over(tag, &[added("d1")]);
    let manager = restarted(&host);
    let session = host.data_dir().join("torrents").join("session");
    std::fs::create_dir_all(&session).unwrap();
    std::fs::write(session.join(format!("{HASH}.torrent")), TORRENT).unwrap();
    let (proxy, tracker) = socks5_serving(tracker_answer());
    let rqbit = StubApi::serving(&[
        (LIST, 200, &listing(live_peers)),
        (DETAILS, 200, FILES),
        (ADD_PEERS, 200, r#"{"added":1}"#),
    ]);
    let sealed = RqbitConfig {
        socks_proxy_url: Some(proxy),
        sealed: true,
        ..RqbitConfig::default()
    };
    *manager.rqbit.write().unwrap() = Some(engine_over(&rqbit, sealed));
    Session {
        manager,
        rqbit,
        tracker,
    }
}

#[test]
fn a_torrent_that_holds_data_but_no_live_peer_is_handed_the_peers_of_our_announce() {
    let session = sealed_session("reseed-partial", 0);

    session.manager.reseed_stalled();

    let handed = session.rqbit.seen(ADD_PEERS);
    assert_eq!(session.tracker.try_recv().unwrap().target, "t1.invalid:80");
    assert_eq!(handed.len(), 1);
    assert_eq!(handed[0].body, b"198.51.100.1:6881");
    session.manager.stop_rqbit();
}

#[test]
fn a_torrent_just_announced_for_is_not_announced_for_again_on_the_next_pass() {
    let session = sealed_session("reseed-again", 0);

    session.manager.reseed_stalled();
    session.manager.reseed_stalled();

    assert_eq!(session.tracker.try_iter().count(), 1);
    assert_eq!(session.rqbit.seen(ADD_PEERS).len(), 1);
    session.manager.stop_rqbit();
}

#[test]
fn a_torrent_with_a_live_peer_is_left_to_it() {
    let session = sealed_session("reseed-connected", 1);

    session.manager.reseed_stalled();

    assert!(session.tracker.try_recv().is_err());
    assert!(session.rqbit.seen(ADD_PEERS).is_empty());
    session.manager.stop_rqbit();
}

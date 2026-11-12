use super::*;
use crate::test_support::socks5_serving;

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn torrent_bytes_are_added_at_once_with_their_folder_and_selection() {
    let stub = StubApi::serving(&[(ADD, 200, ADDED)]);

    let hash = client_over(&stub).add(&request(Some(b"d4:infoe"))).unwrap();

    let seen = stub.seen(ADD).remove(0);
    assert_eq!(hash, HASH);
    assert_eq!(seen.body, b"d4:infoe");
    assert!(
        seen.path_and_query.contains("is_url=false"),
        "{}",
        seen.path_and_query
    );
    assert!(
        seen.path_and_query.contains("overwrite=true"),
        "{}",
        seen.path_and_query
    );
    assert!(
        seen.path_and_query
            .contains("output_folder=%2Fdownloads%2Fone"),
        "{}",
        seen.path_and_query
    );
    assert!(
        seen.path_and_query.contains("only_files=0%2C2"),
        "{}",
        seen.path_and_query
    );
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_refused_torrent_says_what_rqbit_said() {
    let stub = StubApi::serving(&[(ADD, 400, r#"{"human_readable":"error decoding torrent"}"#)]);

    let refused = client_over(&stub).add(&request(Some(b"junk"))).unwrap_err();

    assert!(
        format!("{refused:#}").contains("error decoding torrent"),
        "{refused:#}"
    );
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_magnet_is_handed_over_and_answers_later_with_its_hash() {
    let stub = StubApi::serving(&[(ADD, 200, ADDED)]);
    let client = client_over(&stub);
    let req = request(None);

    let first = client.add(&req).unwrap_err();
    let hash = answer_to_add(&*client, &req).unwrap();

    let seen = stub.seen(ADD).remove(0);
    assert!(first.is::<StillAdding>());
    assert_eq!(hash, HASH);
    assert_eq!(seen.body, MAGNET.as_bytes());
    assert!(
        seen.path_and_query.contains("is_url=true"),
        "{}",
        seen.path_and_query
    );
    assert!(
        seen.path_and_query.contains("only_files=0%2C2"),
        "{}",
        seen.path_and_query
    );
    assert!(
        seen.head.to_lowercase().contains("authorization: basic "),
        "{}",
        seen.head
    );
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_magnet_the_engine_already_holds_answers_without_being_handed_over() {
    let stub = StubApi::serving(&[(DETAILS, 200, FILES)]);

    let hash = client_over(&stub).add(&request(None)).unwrap();

    assert_eq!(hash, HASH);
    assert!(stub.seen(ADD).is_empty());
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_magnet_rqbit_refused_says_what_rqbit_said_and_may_be_tried_again() {
    let stub = StubApi::serving(&[(
        ADD,
        400,
        r#"{"human_readable":"no known way to resolve peers"}"#,
    )]);
    let client = client_over(&stub);
    let req = request(None);

    let refused = answer_to_add(&*client, &req).unwrap_err();
    let again = client.add(&req).unwrap_err();

    assert!(
        format!("{refused:#}").contains("no known way"),
        "{refused:#}"
    );
    assert!(again.is::<StillAdding>());
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_magnet_whose_add_landed_as_its_row_went_is_dropped_with_its_data() {
    let delete = format!("POST /torrents/{HASH}/delete");
    let stub = StubApi::serving(&[(ADD, 200, ADDED), (delete.as_str(), 200, "{}")]);
    let engine = engine_over(&stub, RqbitConfig::default());
    let client = engine.client();
    let _ = client.add(&request(None));
    let deadline = Instant::now() + Duration::from_secs(10);
    while stub.seen(ADD).is_empty() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(10));
    }
    std::thread::sleep(Duration::from_millis(100));

    engine.cancel_add(MAGNET);

    assert_eq!(stub.seen(&delete).len(), 1);
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn nothing_is_left_on_disk_of_an_add_that_finished() {
    let work = kroma_module_sdk::testing::temp_dir("adding-scrubbed");
    let stub = StubApi::serving(&[(ADD, 200, ADDED)]);
    let cfg = RqbitConfig {
        work_dir: work.path().join("adding"),
        ..RqbitConfig::default()
    };
    let engine = crate::rqbit::test_support::engine_with_work_dir(&stub, cfg);
    let client = engine.client();

    answer_to_add(&*client, &request(None)).unwrap();

    let left: Vec<_> = std::fs::read_dir(work.path().join("adding"))
        .unwrap()
        .collect();
    assert!(left.is_empty(), "{left:?}");
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_url_is_handed_over_like_a_magnet_when_no_network_must_carry_it() {
    let stub = StubApi::serving(&[(ADD, 200, ADDED)]);
    let client = client_over(&stub);
    let req = AddTorrentReq {
        magnet_or_url: "http://indexer.test/file.torrent",
        ..request(None)
    };

    assert_eq!(answer_to_add(&*client, &req).unwrap(), HASH);
}

fn sealed_over(stub: &StubApi, proxy: String) -> Box<dyn DownloadClient> {
    engine_over(
        stub,
        RqbitConfig {
            socks_proxy_url: Some(proxy),
            sealed: true,
            ..RqbitConfig::default()
        },
    )
    .client()
}

fn peers_answer() -> Vec<u8> {
    let mut answer = b"d5:peers6:".to_vec();
    answer.extend_from_slice(&[198, 51, 100, 1, 0x1a, 0xe1]);
    answer.push(b'e');
    answer
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn behind_a_network_a_url_to_fetch_is_refused_rather_than_resolved_outside_the_tunnel() {
    let stub = StubApi::serving(&[(ADD, 200, ADDED)]);
    let client = sealed_over(&stub, "127.0.0.1:1".into());
    let req = AddTorrentReq {
        magnet_or_url: "http://indexer.test/file.torrent",
        ..request(None)
    };

    assert!(client.add(&req).is_err());
    assert!(
        client
            .list_files("http://indexer.test/file.torrent", None)
            .is_err()
    );
    assert!(stub.seen(ADD).is_empty());
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn behind_a_network_torrent_bytes_are_added_with_the_peers_of_our_own_announce() {
    let (proxy, asked) = socks5_serving(peers_answer());
    let stub = StubApi::serving(&[(ADD, 200, ADDED)]);
    let torrent = b"d8:announce26:http://t1.invalid/announce4:infod3:foo3:baree";

    let hash = sealed_over(&stub, proxy)
        .add(&request(Some(torrent)))
        .unwrap();

    let seen = stub.seen(ADD).remove(0);
    assert_eq!(hash, HASH);
    assert_eq!(asked.try_recv().unwrap().target, "t1.invalid:80");
    assert!(
        seen.path_and_query
            .contains("initial_peers=198.51.100.1%3A6881"),
        "{}",
        seen.path_and_query
    );
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn behind_a_network_a_magnet_is_handed_over_with_the_peers_of_our_own_announce() {
    let (proxy, _asked) = socks5_serving(peers_answer());
    let stub = StubApi::serving(&[(ADD, 200, ADDED)]);
    let client = sealed_over(&stub, proxy);
    let link = format!("{MAGNET}&tr=http%3A%2F%2Ft1.invalid%2Fannounce");
    let req = AddTorrentReq {
        magnet_or_url: &link,
        ..request(None)
    };

    answer_to_add(&*client, &req).unwrap();

    let seen = stub.seen(ADD).remove(0);
    assert!(
        seen.path_and_query
            .contains("initial_peers=198.51.100.1%3A6881"),
        "{}",
        seen.path_and_query
    );
}

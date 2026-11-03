use super::*;
use crate::test_support::socks5_serving;

const PEER_ID: &[u8; 20] = b"-KR0001-abcdefghijkl";
const HASH: &str = "0123456789abcdef0123456789abcdef01234567";
const HASH_ENCODED: &str = "%01%23Eg%89%AB%CD%EF%01%23Eg%89%AB%CD%EF%01%23Eg";

fn two_peers() -> Vec<u8> {
    let mut v = b"d8:intervali1800e5:peers12:".to_vec();
    v.extend_from_slice(&[198, 51, 100, 1, 0x1a, 0xe1, 198, 51, 100, 2, 0x1a, 0xe2]);
    v.push(b'e');
    v
}

fn magnet(trackers: &[&str]) -> String {
    let mut m = format!("magnet:?xt=urn:btih:{HASH}");
    for tr in trackers {
        m.push_str("&tr=");
        m.push_str(tr);
    }
    m
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_magnet_is_announced_through_the_proxy_which_resolves_the_tracker_name() {
    let (proxy, asked) = socks5_serving(two_peers());

    let peers = magnet_peers(
        &magnet(&["http%3A%2F%2Ftracker.invalid%3A6969%2Fannounce"]),
        &proxy,
        PEER_ID,
    );

    let seen = asked.try_recv().unwrap();
    assert_eq!(
        peers,
        vec![
            "198.51.100.1:6881".parse::<SocketAddr>().unwrap(),
            "198.51.100.2:6882".parse().unwrap(),
        ]
    );
    assert_eq!(seen.target, "tracker.invalid:6969");
    assert!(seen.request.starts_with(&format!(
        "GET /announce?info_hash={HASH_ENCODED}&peer_id=-KR0001-abcdefghijkl&"
    )));
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn udp_trackers_are_skipped_and_at_most_four_http_trackers_are_asked() {
    let (proxy, asked) = socks5_serving(two_peers());
    let trackers = [
        "udp://open.invalid:1337/announce",
        "http://t1.invalid/announce",
        "http://t2.invalid/announce",
        "http://t3.invalid/announce",
        "http://t4.invalid/announce",
        "http://t5.invalid/announce",
    ];

    magnet_peers(&magnet(&trackers), &proxy, PEER_ID);

    let targets: Vec<String> = asked.try_iter().map(|a| a.target).collect();
    assert_eq!(
        targets,
        [
            "t1.invalid:80",
            "t2.invalid:80",
            "t3.invalid:80",
            "t4.invalid:80"
        ]
    );
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_peer_two_trackers_return_is_handed_over_once() {
    let (proxy, _asked) = socks5_serving(two_peers());

    let peers = magnet_peers(
        &magnet(&["http://t1.invalid/announce", "http://t2.invalid/announce"]),
        &proxy,
        PEER_ID,
    );

    assert_eq!(peers.len(), 2);
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_torrent_file_is_announced_under_the_hash_of_its_info_dict_keeping_the_tracker_query() {
    let (proxy, asked) = socks5_serving(two_peers());
    let torrent = b"d8:announce45:http://tracker.invalid/announce?passkey=abc124:infod3:foo3:baree";

    let peers = tracker_peers(torrent, &proxy, PEER_ID);

    let seen = asked.try_recv().unwrap();
    assert_eq!(peers.len(), 2);
    assert!(seen.request.starts_with(
        "GET /announce?passkey=abc12&info_hash=m%22b%12o%EBn%C7%BD4d%93P%25%C8%C6%09%C0%11%9D&"
    ));
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn nothing_is_asked_without_a_v1_info_hash() {
    let (proxy, asked) = socks5_serving(two_peers());
    let v2_only = format!(
        "magnet:?xt=urn:btmh:1220{}&tr=http://t1.invalid/announce",
        "ab".repeat(32)
    );

    let from_v2 = magnet_peers(&v2_only, &proxy, PEER_ID);
    let from_garbage = magnet_peers("not a magnet", &proxy, PEER_ID);
    let from_no_info = tracker_peers(
        b"d8:announce26:http://t1.invalid/announcee",
        &proxy,
        PEER_ID,
    );

    assert!(from_v2.is_empty() && from_garbage.is_empty() && from_no_info.is_empty());
    assert!(asked.try_recv().is_err());
}

#[test]
fn a_tracker_behind_a_dead_proxy_yields_no_peers() {
    let peers = magnet_peers(
        &magnet(&["http://t1.invalid/announce"]),
        "127.0.0.1:1",
        PEER_ID,
    );

    assert!(peers.is_empty());
}

#[test]
fn every_tier_of_an_announce_list_is_read() {
    let t = b"d8:announce3:url13:announce-listll4:url1el4:url24:url3ee4:infod3:foo3:baree";

    assert_eq!(
        announce_urls(&bencode::parse(t).unwrap()),
        ["url", "url1", "url2", "url3"]
    );
}

#[test]
fn parses_v4_and_v6_peers() {
    let mut v = Vec::new();
    v.extend_from_slice(b"d8:completei5e");
    v.extend_from_slice(b"5:peers6:");
    v.extend_from_slice(&[1, 2, 3, 4, 0x1a, 0xe1]);
    v.extend_from_slice(b"6:peers618:");
    let mut ip6 = [0u8; 16];
    ip6[15] = 1;
    v.extend_from_slice(&ip6);
    v.extend_from_slice(&[0x1a, 0xe2]);
    v.push(b'e');
    let peers = parse_peers(&v);
    assert_eq!(peers.len(), 2);
    assert!(peers.iter().any(|p| p.is_ipv4() && p.port() == 6881));
    assert!(peers.iter().any(|p| p.is_ipv6() && p.port() == 6882));
}

#[test]
fn a_single_announce_is_the_one_tracker() {
    let t = bencode::parse(b"d8:announce3:url4:infod3:foo3:baree").unwrap();

    assert_eq!(announce_urls(&t), vec!["url".to_string()]);
}

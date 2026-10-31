//! Tracker announce over the VPN proxy with `curl`, whose proxy resolves the
//! names: the engine's peer source besides peer exchange while its own
//! trackers, DHT and LSD are off.

use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr, SocketAddrV4, SocketAddrV6};

use sha1::{Digest, Sha1};

/// Announce through `proxy` to the HTTP trackers in the `.torrent` and return
/// the union of peers (IPv4 + IPv6), deduped.
pub fn tracker_peers(torrent_bytes: &[u8], proxy: &str, peer_id: &[u8; 20]) -> Vec<SocketAddr> {
    let Some(info_hash) = info_hash(torrent_bytes) else {
        return Vec::new();
    };
    announce_all(&info_hash, announce_urls(torrent_bytes), proxy, peer_id)
}

/// The same for a magnet link, from its `xt` info hash and `tr` trackers.
pub fn magnet_peers(magnet: &str, proxy: &str, peer_id: &[u8; 20]) -> Vec<SocketAddr> {
    let Ok(parsed) = librqbit_core::magnet::Magnet::parse(magnet) else {
        return Vec::new();
    };
    let Some(info_hash) = parsed.as_id20() else {
        return Vec::new();
    };
    announce_all(&info_hash.0, parsed.trackers, proxy, peer_id)
}

fn announce_all(
    info_hash: &[u8; 20],
    trackers: Vec<String>,
    proxy: &str,
    peer_id: &[u8; 20],
) -> Vec<SocketAddr> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let http = trackers
        .into_iter()
        .filter(|url| url.starts_with("http://") || url.starts_with("https://"));
    for url in http.take(4) {
        for addr in announce_once(&url, info_hash, proxy, peer_id) {
            if seen.insert(addr) {
                out.push(addr);
            }
        }
    }
    out
}

fn announce_once(
    base: &str,
    info_hash: &[u8; 20],
    proxy: &str,
    peer_id: &[u8; 20],
) -> Vec<SocketAddr> {
    let q = format!(
        "info_hash={}&peer_id={}&port=6881&uploaded=0&downloaded=0&left=1&numwant=200&compact=1&supportcrypto=1&event=started",
        urlencode(info_hash),
        urlencode(peer_id),
    );
    let sep = if base.contains('?') { '&' } else { '?' };
    let url = format!("{base}{sep}{q}");

    let fetch = kroma_module_sdk::http::Fetch::new()
        .max_time(20)
        .socks5(proxy);
    match fetch.get(&url).and_then(|r| r.ensure_ok()) {
        Ok(resp) => parse_peers(&resp.body),
        Err(_) => Vec::new(),
    }
}

fn urlencode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 3);
    for &b in bytes {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            s.push(b as char);
        } else {
            s.push('%');
            s.push_str(&format!("{b:02X}"));
        }
    }
    s
}

fn parse_peers(body: &[u8]) -> Vec<SocketAddr> {
    let mut out = Vec::new();
    for (key, val) in top_dict_strings(body) {
        match key {
            b"peers" => {
                for c in val.as_chunks::<6>().0 {
                    let ip = Ipv4Addr::new(c[0], c[1], c[2], c[3]);
                    let port = u16::from_be_bytes([c[4], c[5]]);
                    out.push(SocketAddr::V4(SocketAddrV4::new(ip, port)));
                }
            }
            b"peers6" => {
                for c in val.as_chunks::<18>().0 {
                    let mut ip = [0u8; 16];
                    ip.copy_from_slice(&c[..16]);
                    let port = u16::from_be_bytes([c[16], c[17]]);
                    out.push(SocketAddr::V6(SocketAddrV6::new(
                        Ipv6Addr::from(ip),
                        port,
                        0,
                        0,
                    )));
                }
            }
            _ => {}
        }
    }
    out
}

fn bskip(b: &[u8], i: usize) -> Option<usize> {
    match b.get(i)? {
        b'i' => b[i..].iter().position(|&c| c == b'e').map(|p| i + p + 1),
        b'l' => {
            let mut j = i + 1;
            while *b.get(j)? != b'e' {
                j = bskip(b, j)?;
            }
            Some(j + 1)
        }
        b'd' => {
            let mut j = i + 1;
            while *b.get(j)? != b'e' {
                j = bskip(b, j)?; // key
                j = bskip(b, j)?; // value
            }
            Some(j + 1)
        }
        b'0'..=b'9' => {
            let colon = i + b[i..].iter().position(|&c| c == b':')?;
            let len: usize = std::str::from_utf8(b.get(i..colon)?).ok()?.parse().ok()?;
            Some(colon + 1 + len)
        }
        _ => None,
    }
}

fn read_bstr(b: &[u8], i: usize) -> Option<(&[u8], usize)> {
    let colon = i + b.get(i..)?.iter().position(|&c| c == b':')?;
    let len: usize = std::str::from_utf8(b.get(i..colon)?).ok()?.parse().ok()?;
    let start = colon + 1;
    Some((b.get(start..start + len)?, start + len))
}

fn info_hash(b: &[u8]) -> Option<[u8; 20]> {
    let (start, end) = dict_value_bounds(b, b"info")?;
    let mut h = Sha1::new();
    h.update(b.get(start..end)?);
    Some(h.finalize().into())
}

fn announce_urls(b: &[u8]) -> Vec<String> {
    let mut urls = Vec::new();
    if let Some((s, e)) = dict_value_bounds(b, b"announce") {
        if let Some((bytes, _)) = read_bstr(b, s) {
            if e >= s {
                urls.push(String::from_utf8_lossy(bytes).into_owned());
            }
        }
    }
    // announce-list = list of lists of strings.
    if let Some((s, e)) = dict_value_bounds(b, b"announce-list") {
        parse_announce_list(b, s, e, &mut urls);
    }
    urls
}

fn parse_announce_list(b: &[u8], s: usize, e: usize, urls: &mut Vec<String>) {
    let mut i = s + 1; // into the outer list
    while i < e && b.get(i) == Some(&b'l') {
        let mut j = i + 1; // into an inner list
        while j < e && b.get(j) != Some(&b'e') {
            let Some((bytes, nj)) = read_bstr(b, j) else {
                break;
            };
            urls.push(String::from_utf8_lossy(bytes).into_owned());
            j = nj;
        }
        i = j + 1;
    }
}

fn dict_value_bounds(b: &[u8], key: &[u8]) -> Option<(usize, usize)> {
    if b.first()? != &b'd' {
        return None;
    }
    let mut i = 1;
    while *b.get(i)? != b'e' {
        let (k, after_key) = read_bstr(b, i)?;
        let vend = bskip(b, after_key)?;
        if k == key {
            return Some((after_key, vend));
        }
        i = vend;
    }
    None
}

fn top_dict_strings(b: &[u8]) -> Vec<(&[u8], &[u8])> {
    let mut out = Vec::new();
    if b.first() != Some(&b'd') {
        return out;
    }
    let mut i = 1;
    while let Some(&c) = b.get(i) {
        if c == b'e' {
            break;
        }
        let Some((k, after_key)) = read_bstr(b, i) else {
            break;
        };
        let Some(vend) = bskip(b, after_key) else {
            break;
        };
        if b.get(after_key) == Some(&b'0') || matches!(b.get(after_key), Some(b'1'..=b'9')) {
            if let Some((val, _)) = read_bstr(b, after_key) {
                out.push((k, val));
            }
        }
        i = vend;
    }
    out
}

#[cfg(test)]
mod tests {
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
    fn a_torrent_file_is_announced_under_the_hash_of_its_info_dict_keeping_the_tracker_query() {
        let (proxy, asked) = socks5_serving(two_peers());
        let torrent =
            b"d8:announce45:http://tracker.invalid/announce?passkey=abc124:infod3:foo3:baree";

        let peers = tracker_peers(torrent, &proxy, PEER_ID);

        let seen = asked.try_recv().unwrap();
        assert_eq!(peers.len(), 2);
        assert!(seen.request.starts_with(
            "GET /announce?passkey=abc12&info_hash=m%22b%12o%EBn%C7%BD4d%93P%25%C8%C6%09%C0%11%9D&"
        ));
    }

    #[test]
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

        assert_eq!(announce_urls(t), ["url", "url1", "url2", "url3"]);
    }

    #[test]
    fn parses_v4_and_v6_peers() {
        let mut v = Vec::new();
        v.extend_from_slice(b"d8:completei5e");
        // peers = 1.2.3.4:6881
        v.extend_from_slice(b"5:peers6:");
        v.extend_from_slice(&[1, 2, 3, 4, 0x1a, 0xe1]);
        // peers6 = [::1]:6882
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
    fn computes_info_hash_and_announce() {
        // Outer dict { announce: "url", info: { foo: "bar" } }.
        let t = b"d8:announce3:url4:infod3:foo3:baree";
        let ih = info_hash(t).expect("hash");
        // The info hash is SHA-1 of the info dict bytes only: "d3:foo3:bare".
        let mut h = Sha1::new();
        h.update(b"d3:foo3:bare");
        let expect: [u8; 20] = h.finalize().into();
        assert_eq!(ih, expect);
        assert_eq!(announce_urls(t), vec!["url".to_string()]);
    }
}

//! Self-managed tracker announce for the embedded engine behind the VPN. With a
//! proxy set, the engine's own trackers, DHT and LSD are off (they would leave
//! from the real address or resolve names locally), so this is its peer source
//! besides peer exchange: announce over the bridge with `curl`, whose proxy
//! resolves the names, parse `peers` and `peers6`, and hand librqbit the result.

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

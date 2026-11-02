//! Tracker announce through the gateway, whose network resolves the names: the
//! engine's peer source besides peer exchange while its own trackers, DHT and LSD
//! are off.

use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr, SocketAddrV4, SocketAddrV6};
use std::time::{Duration, Instant};

use sha1::{Digest, Sha1};

use crate::bencode::{self, Node};

const MAX_TRACKERS: usize = 4;
const CALL_SECS: u32 = 6;
const BUDGET: Duration = Duration::from_secs(12);

/// Announce through `proxy` to the HTTP trackers in the `.torrent` and return
/// the union of peers (IPv4 + IPv6), deduped.
pub fn tracker_peers(torrent_bytes: &[u8], proxy: &str, peer_id: &[u8; 20]) -> Vec<SocketAddr> {
    let Some(torrent) = bencode::parse(torrent_bytes) else {
        return Vec::new();
    };
    let Some(info_hash) = info_hash(&torrent) else {
        return Vec::new();
    };
    announce_all(&info_hash, announce_urls(&torrent), proxy, peer_id)
}

/// The same for a magnet link, from its `xt` info hash and `tr` trackers.
pub fn magnet_peers(magnet: &str, proxy: &str, peer_id: &[u8; 20]) -> Vec<SocketAddr> {
    let Some(parsed) = crate::magnet::parse(magnet) else {
        return Vec::new();
    };
    let Some(info_hash) = parsed.info_hash else {
        return Vec::new();
    };
    announce_all(&info_hash, parsed.trackers, proxy, peer_id)
}

fn announce_all(
    info_hash: &[u8; 20],
    trackers: Vec<String>,
    proxy: &str,
    peer_id: &[u8; 20],
) -> Vec<SocketAddr> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let started = Instant::now();
    let http = trackers
        .into_iter()
        .filter(|url| url.starts_with("http://") || url.starts_with("https://"));
    for url in http.take(MAX_TRACKERS) {
        if started.elapsed() >= BUDGET {
            break;
        }
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
        .purpose("peers-announce")
        .max_time(CALL_SECS)
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
    let Some(answer) = bencode::parse(body) else {
        return Vec::new();
    };
    let v4 = answer
        .get(b"peers")
        .and_then(Node::bytes)
        .unwrap_or_default();
    let v6 = answer
        .get(b"peers6")
        .and_then(Node::bytes)
        .unwrap_or_default();
    let mut out: Vec<SocketAddr> = v4
        .as_chunks::<6>()
        .0
        .iter()
        .map(|c| {
            let ip = Ipv4Addr::new(c[0], c[1], c[2], c[3]);
            SocketAddr::V4(SocketAddrV4::new(ip, u16::from_be_bytes([c[4], c[5]])))
        })
        .collect();
    out.extend(v6.as_chunks::<18>().0.iter().map(|c| {
        let mut ip = [0u8; 16];
        ip.copy_from_slice(&c[..16]);
        let port = u16::from_be_bytes([c[16], c[17]]);
        SocketAddr::V6(SocketAddrV6::new(Ipv6Addr::from(ip), port, 0, 0))
    }));
    out
}

fn info_hash(torrent: &Node<'_>) -> Option<[u8; 20]> {
    let mut hasher = Sha1::new();
    hasher.update(torrent.get(b"info")?.raw);
    Some(hasher.finalize().into())
}

fn announce_urls(torrent: &Node<'_>) -> Vec<String> {
    let single = torrent.get(b"announce").into_iter();
    let tiers = torrent
        .get(b"announce-list")
        .and_then(Node::list)
        .unwrap_or_default()
        .iter()
        .flat_map(|tier| tier.list().unwrap_or_default());
    single
        .chain(tiers)
        .filter_map(Node::bytes)
        .map(|url| String::from_utf8_lossy(url).into_owned())
        .collect()
}

#[cfg(test)]
mod tests;

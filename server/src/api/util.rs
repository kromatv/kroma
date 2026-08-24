//! Shared HTTP-handler helpers. The `spawn_blocking` DB combinators live on the
//! module host seam; re-exported here so existing call sites are unchanged.

use std::net::{IpAddr, SocketAddr};

use axum::http::HeaderMap;
use serde::Deserialize;

use crate::db;
use crate::services::pairing::Orphaned;
use crate::state::SharedState;

pub(crate) use kroma_module_host::{blocking, query};

/// `?secret=…`: how a device already in the world identifies its own pending
/// Quick Connect request. Newer callers send `X-Kroma-Pairing-Secret` instead,
/// and the handoff poll takes it in a POST body: a URL is logged everywhere.
///
/// Optional, because a caller that sends the header sends no query at all, and a
/// required field would reject it before the handler ever looked.
#[derive(Debug, Default, Deserialize)]
pub struct SecretQuery {
    #[serde(default)]
    pub secret: Option<String>,
}

/// Whether this address's word may be believed: loopback always (a proxy on the
/// same host), plus anything the operator named in `KROMA_TRUSTED_PROXIES`.
///
/// Trusting the wrong address is the whole danger, which is why the list is
/// empty by default and why it should never be widened to a range clients live
/// in: whoever matches it can claim to be anyone.
///
/// Canonical, because a dual-stack bind (`KROMA_HOST=::`) hands an IPv4 proxy
/// over as `::ffff:127.0.0.1`, which is neither loopback nor equal to
/// `127.0.0.1` nor inside any IPv4 CIDR until it is unmapped.
fn trusted(ip: IpAddr, list: &[String]) -> bool {
    let ip = ip.to_canonical();
    ip.is_loopback()
        || list.iter().any(|entry| {
            let entry = entry.trim();
            entry
                .parse::<IpAddr>()
                .is_ok_and(|named| named.to_canonical() == ip)
                || crate::services::playback::cidr_contains(entry, &ip)
        })
}

// The first entry from the right that is not itself a proxy we trust. Every
// common proxy (nginx's `$proxy_add_x_forwarded_for`, Caddy, Traefik) APPENDS
// the peer it saw to what the client sent, so only the entries a trusted hop
// wrote are worth anything and the leftmost is the caller's to invent. Walking
// left past the hops we do know is what makes a real chain (a tunnel or a CDN in
// front of nginx, both named) report the client rather than the outermost proxy,
// which is identical on every request. Nothing but proxies leaves the leftmost.
fn forwarded_client<'a>(xff: &'a str, list: &[String]) -> Option<&'a str> {
    let hops: Vec<&str> = xff
        .split(',')
        .map(str::trim)
        .filter(|hop| !hop.is_empty())
        .collect();
    let leftmost = *hops.first()?;
    Some(
        hops.iter()
            .rev()
            .copied()
            .find(|hop| !hop.parse::<IpAddr>().is_ok_and(|ip| trusted(ip, list)))
            .unwrap_or(leftmost),
    )
}

/// Best client IP for playback accounting, the login brute-force guard, and the
/// network rule nearby pairing is built on.
///
/// `CF-Connecting-IP` / `X-Forwarded-For` are client-settable, so they are read
/// only from a peer worth believing (see [`trusted`]), and then only from the
/// part of the chain a trusted hop wrote (see [`forwarded_client`]). Taking the
/// leftmost entry outright would let anyone on the internet claim to be on your
/// subnet.
///
/// A proxy the server has NOT been told about is the other failure, and a quiet
/// one: its header is discarded, every request arrives wearing the proxy's own
/// address, and the server can no longer tell two clients apart at all.
pub(crate) fn client_ip(headers: &HeaderMap, addr: &SocketAddr, list: &[String]) -> String {
    if trusted(addr.ip(), list) {
        if let Some(cf) = headers
            .get("cf-connecting-ip")
            .and_then(|v| v.to_str().ok())
        {
            let cf = cf.trim();
            if !cf.is_empty() {
                return cf.to_string();
            }
        }
        if let Some(client) = headers
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .and_then(|xff| forwarded_client(xff, list))
        {
            return client.to_string();
        }
    }
    addr.ip().to_string()
}

/// Delete the tokens minted for a pairing request nobody will ever collect.
/// Best-effort cleanup: no caller waits on the outcome, and every store touched
/// by a handler hands its lapsed grants back this way.
pub(crate) async fn drop_orphans(state: &SharedState, orphans: impl IntoIterator<Item = Orphaned>) {
    for orphan in orphans {
        let token = orphan.token;
        let access = orphan.access_token;
        let _ = query(&state.db, move |pool| db::delete_session(&pool, &token)).await;
        let _ = query(&state.db, move |pool| {
            db::delete_access_token(&pool, &access)
        })
        .await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    fn ip_for(peer: [u8; 4], headers: &[(&str, &str)]) -> String {
        ip_for_trusting(peer, headers, &[])
    }

    fn ip_for_trusting(peer: [u8; 4], headers: &[(&str, &str)], trusted: &[String]) -> String {
        seen_from(IpAddr::from(peer), headers, trusted)
    }

    fn seen_from(peer: IpAddr, headers: &[(&str, &str)], trusted: &[String]) -> String {
        let mut map = HeaderMap::new();
        for (k, v) in headers {
            map.insert(
                axum::http::HeaderName::from_bytes(k.as_bytes()).unwrap(),
                HeaderValue::from_str(v).unwrap(),
            );
        }
        client_ip(&map, &SocketAddr::new(peer, 40000), trusted)
    }

    const LOOPBACK: [u8; 4] = [127, 0, 0, 1];
    const DIRECT: [u8; 4] = [192, 168, 1, 9];

    #[test]
    fn a_forwarded_header_is_read_only_from_a_loopback_peer() {
        assert_eq!(
            ip_for(DIRECT, &[("x-forwarded-for", "203.0.113.7")]),
            "192.168.1.9"
        );
        assert_eq!(
            ip_for(DIRECT, &[("cf-connecting-ip", "203.0.113.7")]),
            "192.168.1.9"
        );
    }

    #[test]
    fn the_forwarded_entry_taken_is_the_one_the_proxy_added() {
        // The shape nginx produces: what the caller sent, then the peer it saw.
        // Believing the caller's half is how a stranger claims to be on your
        // subnet, so the rightmost entry is the only one worth anything.
        assert_eq!(
            ip_for(
                LOOPBACK,
                &[("x-forwarded-for", "192.168.1.20, 203.0.113.7")]
            ),
            "203.0.113.7"
        );
        assert_eq!(
            ip_for(LOOPBACK, &[("x-forwarded-for", "203.0.113.7")]),
            "203.0.113.7"
        );
        // Several proxies deep, it is still the nearest one that saw a peer.
        assert_eq!(
            ip_for(
                LOOPBACK,
                &[("x-forwarded-for", "10.0.0.1, 172.16.0.1, 203.0.113.7")]
            ),
            "203.0.113.7"
        );
    }

    #[test]
    fn cloudflare_wins_because_it_sets_its_header_itself() {
        assert_eq!(
            ip_for(
                LOOPBACK,
                &[
                    ("cf-connecting-ip", "198.51.100.4"),
                    ("x-forwarded-for", "1.2.3.4, 5.6.7.8")
                ]
            ),
            "198.51.100.4"
        );
    }

    #[test]
    fn a_proxy_that_is_not_on_loopback_is_believed_only_once_it_is_named() {
        // The shape that made this setting necessary: the proxy runs in another
        // container, so its peer address is a bridge address and nothing else.
        // Unnamed, its header is discarded and EVERY client arrives wearing the
        // proxy's address, which is how one network came to hold everyone.
        const PROXY: [u8; 4] = [172, 18, 0, 2];
        let forwarded = [("x-forwarded-for", "192.168.1.20, 172.18.0.2")];

        assert_eq!(
            ip_for(PROXY, &forwarded),
            "172.18.0.2",
            "unnamed proxies are not believed"
        );
        assert_eq!(
            ip_for_trusting(PROXY, &forwarded, &["172.18.0.0/16".to_string()]),
            "192.168.1.20",
            "named, its header is what tells two clients apart"
        );
    }

    #[test]
    fn a_proxy_arriving_over_a_dual_stack_socket_is_the_same_proxy() {
        // `KROMA_HOST=::` accepts IPv4 through the v6 socket, so the container's
        // proxy shows up as `::ffff:172.18.0.2`. Compared as it arrives it
        // matches neither the address nor the range the operator named, and the
        // whole setting silently does nothing.
        let mapped: IpAddr = "::ffff:172.18.0.2".parse().unwrap();
        let forwarded = [("x-forwarded-for", "192.168.1.20, 172.18.0.2")];

        assert_eq!(
            seen_from(mapped, &forwarded, &["172.18.0.2".to_string()]),
            "192.168.1.20"
        );
        assert_eq!(
            seen_from(mapped, &forwarded, &["172.18.0.0/16".to_string()]),
            "192.168.1.20"
        );
        // Loopback likewise: it is trusted for being loopback, not for parsing.
        let mapped_loopback: IpAddr = "::ffff:127.0.0.1".parse().unwrap();
        assert_eq!(
            seen_from(mapped_loopback, &[("x-forwarded-for", "203.0.113.7")], &[]),
            "203.0.113.7"
        );
    }

    #[test]
    fn a_chain_of_named_proxies_is_walked_past_to_the_client() {
        // A tunnel or CDN in front of nginx, both named: the entry nearest the
        // server is the outer proxy on every single request, so stopping there
        // is the same as having no header at all.
        const OUTER: [u8; 4] = [10, 8, 0, 4];
        let named = ["10.8.0.4".to_string(), "10.9.0.1/32".to_string()];

        assert_eq!(
            ip_for_trusting(
                OUTER,
                &[("x-forwarded-for", "203.0.113.7, 10.9.0.1, 10.8.0.4")],
                &named
            ),
            "203.0.113.7"
        );
        // A hop the operator never named ends the walk, because from there on
        // the entries are whatever the caller wrote.
        assert_eq!(
            ip_for_trusting(
                OUTER,
                &[("x-forwarded-for", "203.0.113.7, 198.51.100.9, 10.8.0.4")],
                &named
            ),
            "198.51.100.9"
        );
        // Nothing but proxies: the leftmost is the closest to a client anyone
        // recorded.
        assert_eq!(
            ip_for_trusting(OUTER, &[("x-forwarded-for", "10.9.0.1, 10.8.0.4")], &named),
            "10.9.0.1"
        );
    }

    #[test]
    fn a_named_proxy_is_believed_by_address_or_by_range() {
        const PROXY: [u8; 4] = [10, 8, 0, 4];
        let forwarded = [("x-forwarded-for", "203.0.113.7")];

        assert_eq!(
            ip_for_trusting(PROXY, &forwarded, &["10.8.0.4".to_string()]),
            "203.0.113.7"
        );
        assert_eq!(
            ip_for_trusting(PROXY, &forwarded, &["10.8.0.0/16".to_string()]),
            "203.0.113.7"
        );
        assert_eq!(
            ip_for_trusting(PROXY, &forwarded, &["10.8.".to_string()]),
            "203.0.113.7"
        );
        // Some other proxy's address buys nothing.
        assert_eq!(
            ip_for_trusting(PROXY, &forwarded, &["10.9.0.4".to_string()]),
            "10.8.0.4"
        );
        assert_eq!(
            ip_for_trusting(PROXY, &forwarded, &["not-an-address".to_string()]),
            "10.8.0.4"
        );
    }

    #[test]
    fn loopback_is_believed_without_being_named() {
        // A proxy on the same host is the ordinary case, and naming it would be
        // a step every single-box install had to take for nothing.
        assert_eq!(
            ip_for(LOOPBACK, &[("x-forwarded-for", "203.0.113.7")]),
            "203.0.113.7"
        );
    }

    #[test]
    fn an_empty_or_absent_header_falls_back_to_the_peer() {
        assert_eq!(ip_for(LOOPBACK, &[]), "127.0.0.1");
        assert_eq!(ip_for(LOOPBACK, &[("x-forwarded-for", "  ")]), "127.0.0.1");
        assert_eq!(ip_for(LOOPBACK, &[("cf-connecting-ip", "")]), "127.0.0.1");
    }
}

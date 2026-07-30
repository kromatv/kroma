//! Shared HTTP-handler helpers. The `spawn_blocking` DB combinators live on the
//! module host seam; re-exported here so existing call sites are unchanged.

use std::net::SocketAddr;

use axum::http::HeaderMap;

pub(crate) use kroma_module_host::{blocking, query};

/// Best client IP for playback accounting and the login brute-force guard.
/// `CF-Connecting-IP` / `X-Forwarded-For` are client-settable, so they're trusted
/// only when the direct peer is loopback (a local reverse proxy) — otherwise a
/// spoofed header could rotate past the per-IP lockout.
pub(crate) fn client_ip(headers: &HeaderMap, addr: &SocketAddr) -> String {
    if addr.ip().is_loopback() {
        if let Some(cf) = headers.get("cf-connecting-ip").and_then(|v| v.to_str().ok()) {
            let cf = cf.trim();
            if !cf.is_empty() {
                return cf.to_string();
            }
        }
        if let Some(xff) = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()) {
            if let Some(first) = xff.split(',').next() {
                let first = first.trim();
                if !first.is_empty() {
                    return first.to_string();
                }
            }
        }
    }
    addr.ip().to_string()
}

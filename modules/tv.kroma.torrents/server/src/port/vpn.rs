//! The `download-vpn` point this module answers, and the `vpn-proxy` point it
//! calls.
//!
//! The VPN module's admin page reads the kill-switch state off whichever download
//! engine is running, and this engine routes its peers through whichever module
//! runs a bridge. Neither names the other.

use std::sync::Arc;

use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use serde_json::json;

use kroma_module_sdk::host::{call_raw, pinned_resolver, service, HostCtx};

use crate::dtos::VpnStatusView;
use crate::DownloadManager;

/// The point this module answers: the tunnel's state, a seal check, and a
/// restart, for whatever draws the VPN admin page.
pub const DOWNLOAD_VPN: &str = "tv.kroma.torrents/vpn";

/// The bridge this module's peers are routed through, answered by whichever
/// module runs one.
pub const VPN_PROXY: &str = "tv.kroma.vpn/proxy";

/// The local SOCKS5 bridge to route peers through (librqbit only proxies via
/// SOCKS5). `None` means no bridge, and torrent traffic goes out directly.
pub fn proxy_url(host: &dyn HostCtx) -> Option<String> {
    let resolve = pinned_resolver(host, VPN_PROXY, None)?;
    call_raw(&resolve, &format!("{VPN_PROXY}/url"), &json!({}))
        .ok()
        .flatten()
}

/// The routes this module mounts for [`DOWNLOAD_VPN`].
pub fn routes<S: HostCtx + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/_port/tv.kroma.torrents/vpn/status", post(status::<S>))
        .route(
            "/_port/tv.kroma.torrents/vpn/seal-check",
            post(seal_check::<S>),
        )
        .route("/_port/tv.kroma.torrents/vpn/restart", post(restart::<S>))
}

// Every method answers `Option<_>`: this process may be up while the manager it
// answers out of is not yet registered, and the caller draws a card either way.
fn manager<S: HostCtx>(host: &S) -> Option<Arc<DownloadManager>> {
    service::<DownloadManager>(host)
}

async fn status<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
) -> Json<Option<VpnStatusView>> {
    Json(manager(&host).and_then(|m| m.vpn_status()))
}

#[derive(serde::Serialize)]
struct Seal {
    sealed: bool,
    proxied_ip: Option<String>,
    direct_ip: Option<String>,
    error: Option<String>,
}

async fn seal_check<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
) -> Json<Option<Seal>> {
    let seal = tokio::task::spawn_blocking(move || {
        let manager = manager(&host)?;
        let check = manager.vpn_check(&host)?;
        Some(Seal {
            sealed: check.sealed(),
            proxied_ip: check.proxied_ip,
            direct_ip: check.direct_ip,
            error: check.error,
        })
    })
    .await
    .ok()
    .flatten();
    Json(seal)
}

async fn restart<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
) -> Json<Option<bool>> {
    let Some(manager) = manager(&host) else {
        return Json(None);
    };
    manager.start_rqbit(&host).await;
    Json(Some(true))
}

#[cfg(test)]
mod tests {
    use super::*;

    use kroma_module_sdk::host::testing::StubHost;

    async fn call(path: &str) -> (axum::http::StatusCode, serde_json::Value) {
        let host = StubHost::new();
        let app = routes::<StubHost>().with_state(host);
        let req = axum::http::Request::builder()
            .method("POST")
            .uri(path)
            .header("content-type", "application/json")
            .body(axum::body::Body::from("{}"))
            .unwrap();
        let resp = tower::ServiceExt::oneshot(app, req).await.unwrap();
        let status = resp.status();
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .unwrap();
        (
            status,
            serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null),
        )
    }

    // With no manager registered — this process between spawn and wiring — every
    // method answers rather than failing, because the VPN admin card renders
    // either way and a 500 would blank it.
    #[tokio::test]
    async fn every_method_answers_with_no_manager_running() {
        for path in [
            "/_port/tv.kroma.torrents/vpn/status",
            "/_port/tv.kroma.torrents/vpn/seal-check",
            "/_port/tv.kroma.torrents/vpn/restart",
        ] {
            let (status, answer) = call(path).await;

            assert_eq!(status, axum::http::StatusCode::OK, "{path}");
            assert!(answer.is_null(), "{path} answered {answer}");
        }
    }

    #[test]
    fn no_bridge_means_peers_go_out_directly() {
        let host = StubHost::new();

        assert_eq!(proxy_url(&host), None);
    }

    // The consumer reads camelCase off this, and it is a separately released
    // module, so the key spelling is the contract.
    #[test]
    fn a_status_serializes_under_the_keys_the_consumer_reads() {
        let json = serde_json::to_value(VpnStatusView {
            connected: true,
            exit_ip: Some("203.0.113.7".into()),
            paused: false,
        })
        .unwrap();

        assert_eq!(json["connected"], true);
        assert_eq!(json["exitIp"], "203.0.113.7");
        assert_eq!(json["paused"], false);
    }

    #[test]
    fn a_seal_reports_both_addresses_so_the_admin_can_compare_them() {
        let json = serde_json::to_value(Seal {
            sealed: false,
            proxied_ip: Some("198.51.100.2".into()),
            direct_ip: Some("203.0.113.7".into()),
            error: None,
        })
        .unwrap();

        assert_eq!(json["sealed"], false);
        assert_eq!(json["proxied_ip"], "198.51.100.2");
        assert_eq!(json["direct_ip"], "203.0.113.7");
    }
}

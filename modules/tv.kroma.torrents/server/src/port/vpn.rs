//! The `download-vpn` point this module answers, and whether a network must carry
//! its peers.

use std::sync::Arc;

use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};

use kroma_module_sdk::host::{run_blocking, service, HostCtx, NetworkSeal};
use kroma_module_sdk::http::egress::Gateway;

use crate::bandwidth::{BandwidthView, Range};
use crate::dtos::VpnStatusView;
use crate::DownloadManager;

pub const DOWNLOAD_VPN: &str = "tv.kroma.torrents/vpn";

const PEERS_PURPOSE: &str = "peers";

/// The gateway's SOCKS5 URL while a network is up to carry peers, as a placeholder
/// the host fills in when it starts the engine: this module never holds the token.
/// `None` means none is, and the caller asks [`must_stay_behind_a_network`] whether
/// traffic may go out directly.
pub fn proxy_url(host: &dyn HostCtx) -> Option<String> {
    (host.network_seal() == NetworkSeal::Up).then(|| gateway_placeholder(true))
}

/// The placeholder for this module's peers, kept behind a network or not.
pub fn gateway_placeholder(sealed: bool) -> String {
    format!("{{gateway:{}}}", Gateway::username(PEERS_PURPOSE, false, sealed))
}

/// Whether this server offers a network, in which case nothing may go direct.
pub fn must_stay_behind_a_network(host: &dyn HostCtx) -> bool {
    host.network_seal() != NetworkSeal::None
}

pub fn routes<S: HostCtx + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/_port/tv.kroma.torrents/vpn/status", post(status::<S>))
        .route(
            "/_port/tv.kroma.torrents/vpn/seal-check",
            post(seal_check::<S>),
        )
        .route("/_port/tv.kroma.torrents/vpn/restart", post(restart::<S>))
        .route(
            "/_port/tv.kroma.torrents/vpn/bandwidth",
            post(bandwidth::<S>),
        )
}

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
    let seal = run_blocking(move || {
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

#[derive(Debug, Clone, Default, serde::Deserialize)]
#[serde(default)]
struct BandwidthAsk {
    range: String,
}

async fn bandwidth<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(ask): Json<BandwidthAsk>,
) -> Json<Option<BandwidthView>> {
    let view = run_blocking(move || {
        manager(&host)?
            .bandwidth(&host, Range::parse(&ask.range))
            .ok()
    })
    .await
    .ok()
    .flatten();
    Json(view)
}

async fn restart<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
) -> Json<Option<bool>> {
    let Some(manager) = manager(&host) else {
        return Json(None);
    };
    tokio::spawn(async move { manager.follow_the_network(&host).await });
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

    #[tokio::test]
    async fn every_method_answers_with_no_manager_running() {
        for path in [
            "/_port/tv.kroma.torrents/vpn/status",
            "/_port/tv.kroma.torrents/vpn/seal-check",
            "/_port/tv.kroma.torrents/vpn/restart",
            "/_port/tv.kroma.torrents/vpn/bandwidth",
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

    #[test]
    fn a_network_that_is_up_carries_the_peers_and_the_token_stays_with_the_host() {
        let host = StubHost::new().with_network_seal(NetworkSeal::Up);

        assert_eq!(proxy_url(&host).as_deref(), Some("{gateway:peers.vpn}"));
    }

    #[test]
    fn a_network_that_is_down_carries_nothing_and_nothing_may_go_direct() {
        let host = StubHost::new().with_network_seal(NetworkSeal::Down);

        assert_eq!(proxy_url(&host), None);
        assert!(must_stay_behind_a_network(&host));
    }

    #[test]
    fn with_no_network_on_offer_peers_still_go_through_the_gateway() {
        assert_eq!(gateway_placeholder(false), "{gateway:peers}");
    }

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
    fn a_caller_that_names_no_window_is_answered_with_the_day() {
        let ask: BandwidthAsk = serde_json::from_value(serde_json::json!({})).unwrap();

        assert_eq!(Range::parse(&ask.range), Range::Day);
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

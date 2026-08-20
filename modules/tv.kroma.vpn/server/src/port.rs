//! The `vpn-proxy` point this module answers, and the `download-vpn` point it
//! calls.
//!
//! Two points, pointing opposite ways: a consumer routes its traffic through the
//! bridge this module runs, and this module's own admin page reads the
//! kill-switch state off whichever download engine is running. Neither end names
//! the other's crate, and the structs below are this module's own.

use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;

use kroma_module_sdk::host::{call_raw, pinned_resolver, HostCtx};

/// The point this module answers: the local SOCKS5 URL of its WireGuard bridge.
pub const VPN_PROXY: &str = "tv.kroma.vpn/proxy";

/// The download engine's kill-switch surface, which this module's admin page
/// reads and restarts. Answered by whichever module runs downloads.
pub const DOWNLOAD_VPN: &str = "tv.kroma.torrents/vpn";

/// The routes this module mounts for [`VPN_PROXY`].
pub fn routes<S: HostCtx + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new().route("/_port/tv.kroma.vpn/proxy/url", post(url::<S>))
}

async fn url<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
) -> Json<Option<String>> {
    Json(tokio::task::spawn_blocking(move || crate::proxy_url(&host)).await.ok().flatten())
}

/// What the download engine reports about the tunnel, as this module's admin card
/// draws it. Tolerant: the engine is a separately released module, so a field it
/// stops sending has to default rather than blank the whole card.
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct EngineVpnStatus {
    pub connected: bool,
    pub exit_ip: Option<String>,
    pub paused: bool,
}

/// Outcome of the engine's seal check: is peer traffic actually leaving through
/// the bridge?
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct EngineSeal {
    pub sealed: bool,
    pub proxied_ip: Option<String>,
    pub direct_ip: Option<String>,
    pub error: Option<String>,
}

/// The engine's tunnel status, or `None` when no module answers [`DOWNLOAD_VPN`].
pub fn engine_status(host: &dyn HostCtx) -> Option<EngineVpnStatus> {
    ask(host, "status")
}

/// Run the engine's seal check now.
pub fn engine_seal_check(host: &dyn HostCtx) -> Option<EngineSeal> {
    ask(host, "seal-check")
}

/// Restart the engine, after the tunnel's configuration changed under it.
pub fn restart_engine(host: &dyn HostCtx) {
    let _: Option<serde_json::Value> = ask(host, "restart");
}

fn ask<T: serde::de::DeserializeOwned>(host: &dyn HostCtx, method: &str) -> Option<T> {
    let resolve = pinned_resolver(host, DOWNLOAD_VPN, None)?;
    call_raw(&resolve, &format!("{DOWNLOAD_VPN}/{method}"), &json!({})).ok().flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    use kroma_module_sdk::host::testing::StubHost;

    #[test]
    fn nothing_answering_the_engine_point_is_none_and_not_a_failure() {
        // The VPN admin card renders with no download engine installed; the
        // kill-switch section is simply absent.
        let host = StubHost::new();

        assert_eq!(engine_status(&host), None);
        assert!(engine_seal_check(&host).is_none());
        restart_engine(&host);
    }

    // The engine sends camelCase, and it is a separately released module: a field
    // it drops must default rather than blank the card.
    #[test]
    fn a_status_deserializes_from_camel_case_and_defaults_what_is_missing() {
        let json = json!({ "connected": true, "exitIp": "203.0.113.7" });

        let status: EngineVpnStatus = serde_json::from_value(json).unwrap();

        assert!(status.connected);
        assert_eq!(status.exit_ip.as_deref(), Some("203.0.113.7"));
        assert!(!status.paused);
    }

    #[test]
    fn a_seal_check_reports_its_reason_when_it_failed() {
        let json = json!({ "sealed": false, "error": "the bridge is down" });

        let seal: EngineSeal = serde_json::from_value(json).unwrap();

        assert!(!seal.sealed);
        assert_eq!(seal.error.as_deref(), Some("the bridge is down"));
        assert_eq!(seal.proxied_ip, None);
    }
}

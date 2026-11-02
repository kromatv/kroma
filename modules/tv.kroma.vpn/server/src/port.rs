//! The `network` point this module answers, and the `download-vpn` point it
//! calls.
//!
//! Two points, pointing opposite ways: the core routes traffic through the bridge
//! this module runs, and this module's own admin page reads the kill-switch state
//! off whichever download engine is running. Neither end names the other's crate,
//! and the structs below are this module's own.

use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;

use kroma_module_sdk::host::{call_raw, pinned_resolver, HostCtx};

/// The download engine's kill-switch surface, which this module's admin page
/// reads and restarts. Answered by whichever module runs downloads.
pub const DOWNLOAD_VPN: &str = "tv.kroma.torrents/vpn";

/// The routes this module mounts for the `network` point.
pub fn routes<S: HostCtx + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new().route("/_port/network/list", post(list::<S>))
}

const NETWORK_NAME: &str = "vpn";
const NETWORK_LABEL: &str = "WireGuard";

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Offer {
    name: &'static str,
    label: &'static str,
    endpoint: Endpoint,
    carries: Carries,
    health: Health,
}

#[derive(Clone, PartialEq, Eq, serde::Serialize)]
struct Endpoint {
    address: String,
    username: &'static str,
    password: String,
}

impl std::fmt::Debug for Endpoint {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Endpoint")
            .field("address", &self.address)
            .finish_non_exhaustive()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
struct Carries {
    tcp: bool,
    udp: bool,
    dns: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
struct Health {
    up: bool,
    exit: Option<String>,
}

// wireproxy carries TCP and resolves a name inside the tunnel. With no tunnel
// configured there is nothing on offer, and with one configured the network is
// on offer even while the bridge is down, so its traffic is refused.
fn offers(host: &dyn HostCtx, running: bool, exit: Option<String>) -> Vec<Offer> {
    let Some(password) = crate::admin::bridge_password(host) else {
        return Vec::new();
    };
    let port = host.setting_i64("vpnLocalPort", 25345).clamp(1, 65535);
    vec![Offer {
        name: NETWORK_NAME,
        label: NETWORK_LABEL,
        endpoint: Endpoint {
            address: format!("127.0.0.1:{port}"),
            username: crate::socks_auth::USER,
            password,
        },
        carries: Carries {
            tcp: true,
            udp: false,
            dns: true,
        },
        health: Health {
            up: running,
            exit,
        },
    }]
}

async fn list<S: HostCtx + Clone + Send + Sync + 'static>(State(host): State<S>) -> Json<Vec<Offer>> {
    let (running, exit) = match kroma_module_sdk::host::service::<crate::Vpn>(&host) {
        Some(vpn) => (vpn.running().await, vpn.last_exit()),
        None => (false, None),
    };
    Json(offers(&host, running, exit))
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
    ask_with(host, method, &json!({}))
}

/// One [`DOWNLOAD_VPN`] method, with a body. `None` when nothing answers the
/// point or the call failed.
pub(crate) fn ask_with<T: serde::de::DeserializeOwned>(
    host: &dyn HostCtx,
    method: &str,
    body: &serde_json::Value,
) -> Option<T> {
    let resolve = pinned_resolver(host, DOWNLOAD_VPN, None)?;
    call_raw(&resolve, &format!("{DOWNLOAD_VPN}/{method}"), body)
        .ok()
        .flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    use kroma_module_sdk::host::testing::StubHost;

    #[test]
    fn the_exit_the_engine_last_reported_is_offered_without_asking_it_again() {
        let host = StubHost::new().with_setting("vpnWgConfig", json!("[Interface]"));
        std::fs::create_dir_all(host.data_dir().join("vpn")).unwrap();
        crate::socks_auth::password(&host.data_dir().join("vpn")).unwrap();

        let offered = offers(&host, true, Some("203.0.113.7".to_string()));

        assert_eq!(offered[0].health.exit.as_deref(), Some("203.0.113.7"));
    }

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

#[cfg(test)]
mod network_tests {
    use kroma_module_sdk::host::testing::StubHost;

    use super::*;

    #[test]
    fn with_no_tunnel_configured_nothing_is_on_offer() {
        let host = StubHost::new();

        assert!(offers(&host, false, None).is_empty());
    }

    fn configured() -> StubHost {
        StubHost::new().with_setting("vpnWgConfig", serde_json::json!("[Interface]"))
    }

    #[test]
    fn a_tunnel_is_on_offer_with_the_bridges_address_and_credentials() {
        let host = configured();

        let offered = offers(&host, true, None);

        assert_eq!(offered[0].name, "vpn");
        assert_eq!(offered[0].endpoint.address, "127.0.0.1:25345");
        assert_eq!(offered[0].endpoint.username, crate::socks_auth::USER);
        assert!(!offered[0].endpoint.password.is_empty());
        assert!(offered[0].health.up);
    }

    #[test]
    fn a_configured_tunnel_whose_bridge_is_down_stays_on_offer_as_down() {
        let host = configured();

        let offered = offers(&host, false, None);

        assert_eq!(offered.len(), 1);
        assert!(!offered[0].health.up);
    }

    #[test]
    fn an_offer_never_prints_its_password() {
        let host = configured();

        let printed = format!("{:?}", offers(&host, true, None)[0]);

        assert!(!printed.contains(&offers(&host, true, None)[0].endpoint.password));
    }
}


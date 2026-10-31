use kroma_module_sdk::host::HostCtx;

use crate::port;

/// Whether a managed WireGuard config is stored (for the module's own admin view).
pub fn wg_configured(host: &dyn HostCtx) -> bool {
    !host.setting_str("vpnWgConfig", "").trim().is_empty()
}

/// The local SOCKS5 URL this module's bridge exposes, with the credentials it
/// asks for, and what [`port::VPN_PROXY`] answers with. `None` when no
/// WireGuard config is stored.
pub fn proxy_url(host: &dyn HostCtx) -> Option<String> {
    if !wg_configured(host) {
        return None;
    }
    let port = host.setting_i64("vpnLocalPort", 25345).clamp(1, 65535);
    let password = match crate::socks_auth::password(&host.data_dir().join("vpn")) {
        Ok(password) => password,
        Err(error) => {
            tracing::warn!(%error, "could not read the bridge's SOCKS password");
            return None;
        }
    };
    Some(format!(
        "socks5://{}:{password}@127.0.0.1:{port}",
        crate::socks_auth::USER
    ))
}

/// `GET /vpn` the VPN configuration card's state. VPN routing is
/// WireGuard-only: a stored config runs a managed wireproxy bridge the embedded
/// engine routes through.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VpnAdminView {
    // A WireGuard config is stored.
    pub wg_configured: bool,
    // The bridge child is currently alive.
    pub bridge_running: bool,
    pub local_port: u16,
    pub status: Option<port::EngineVpnStatus>,
}

/// `PUT /vpn` body. `wgConfig` is write-only: pass the full WireGuard
/// config text from any provider (Mullvad, Proton, AirVPN, a self-hosted peer),
/// or an empty string to remove it.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveVpnBody {
    pub wg_config: Option<String>,
    pub local_port: Option<u16>,
}

/// `POST /vpn/test` a live probe through (and around) the proxy.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VpnTestResult {
    pub sealed: bool,
    pub proxied_ip: Option<String>,
    pub direct_ip: Option<String>,
    pub error: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use kroma_module_sdk::host::testing::StubHost;

    #[test]
    fn a_blank_config_is_not_configured() {
        let host = StubHost::new().with_setting("vpnWgConfig", serde_json::json!("  \n"));

        assert!(!wg_configured(&host));
        assert_eq!(proxy_url(&host), None);
    }

    #[test]
    fn a_stored_config_exposes_the_local_socks_url() {
        let host = StubHost::new()
            .with_setting("vpnWgConfig", serde_json::json!("[Interface]"))
            .with_setting("vpnLocalPort", serde_json::json!(26000));

        assert!(wg_configured(&host));
        let url = proxy_url(&host).unwrap();
        assert!(url.starts_with("socks5://kroma:"), "{url}");
        assert!(url.ends_with("@127.0.0.1:26000"), "{url}");
    }

    #[test]
    fn the_url_carries_the_password_the_bridge_was_configured_with() {
        let host = StubHost::new().with_setting("vpnWgConfig", serde_json::json!("[Interface]"));

        let url = proxy_url(&host).unwrap();
        let password = crate::socks_auth::password(&host.data_dir().join("vpn")).unwrap();

        assert!(url.contains(&format!(":{password}@")), "{url}");
    }

    #[test]
    fn the_default_port_applies_when_none_is_stored() {
        let host = StubHost::new().with_setting("vpnWgConfig", serde_json::json!("[Interface]"));

        assert!(proxy_url(&host).unwrap().ends_with("@127.0.0.1:25345"));
    }
}

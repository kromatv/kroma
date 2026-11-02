use kroma_module_sdk::host::HostCtx;

use crate::port;

/// Whether a managed WireGuard config is stored (for the module's own admin view).
pub fn wg_configured(host: &dyn HostCtx) -> bool {
    !host.setting_str("vpnWgConfig", "").trim().is_empty()
}

/// The password the bridge asks for. `None` when no WireGuard config is stored.
pub fn bridge_password(host: &dyn HostCtx) -> Option<String> {
    if !wg_configured(host) {
        return None;
    }
    match crate::socks_auth::password(&host.data_dir().join("vpn")) {
        Ok(password) => Some(password),
        Err(error) => {
            tracing::warn!(%error, "could not read the bridge's SOCKS password");
            None
        }
    }
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
        assert_eq!(bridge_password(&host), None);
    }

    #[test]
    fn a_stored_config_has_the_password_the_bridge_was_configured_with() {
        let host = StubHost::new().with_setting("vpnWgConfig", serde_json::json!("[Interface]"));

        let password = bridge_password(&host).unwrap();

        assert!(wg_configured(&host));
        assert_eq!(
            password,
            crate::socks_auth::password(&host.data_dir().join("vpn")).unwrap()
        );
    }
}

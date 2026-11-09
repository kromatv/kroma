use std::path::Path;

use serde::Serialize;

/// Which provider the stored tunnel belongs to, as the page shows it. Never
/// carries a key or an account number.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ProviderView {
    Mullvad {
        country: String,
        country_name: String,
        city: Option<String>,
        city_name: Option<String>,
        hostname: String,
        device_name: String,
    },
    Proton {
        server: Option<String>,
        port_forwarding: bool,
    },
}

/// The provider behind `wg_config`: the Mullvad account this server connected
/// itself, or a Proton VPN file recognised by the comments Proton writes in it.
pub(crate) fn provider_of(dir: &Path, wg_config: &str) -> Option<ProviderView> {
    if wg_config.trim().is_empty() {
        return None;
    }
    if let Some(account) = crate::mullvad::held(dir) {
        if let Some(place) = account.place {
            return Some(ProviderView::Mullvad {
                country: place.country,
                country_name: place.country_name,
                city: place.city,
                city_name: place.city_name,
                hostname: place.hostname,
                device_name: account.device_name,
            });
        }
    }
    proton(wg_config)
}

fn proton(config: &str) -> Option<ProviderView> {
    let comments: Vec<&str> = config
        .lines()
        .filter_map(|line| line.trim().strip_prefix('#'))
        .map(str::trim)
        .collect();
    let server = comments
        .iter()
        .find(|c| is_proton_server(c))
        .map(|c| c.to_string());
    let marked = comments
        .iter()
        .any(|c| c.starts_with("Key for") || c.starts_with("NAT-PMP"));
    if server.is_none() && !marked {
        return None;
    }
    let port_forwarding = comments
        .iter()
        .any(|c| c.starts_with("NAT-PMP") && c.ends_with("= on"));
    Some(ProviderView::Proton {
        server,
        port_forwarding,
    })
}

fn is_proton_server(comment: &str) -> bool {
    let Some((name, number)) = comment.split_once('#') else {
        return false;
    };
    !name.is_empty()
        && name.chars().all(|c| c.is_ascii_uppercase() || c == '-')
        && !number.is_empty()
        && number.chars().all(|c| c.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::*;

    const PROTON: &str = "[Interface]\n# Key for Multiple tunnel 2\n# Bouncing = 0\n# NetShield = 1\n# Moderate NAT = off\n# NAT-PMP (Port Forwarding) = on\n# VPN Accelerator = on\nPrivateKey = k\nAddress = 10.2.0.2/32\nDNS = 10.2.0.1\n\n[Peer]\n# CH#3\nPublicKey = p\nAllowedIPs = 0.0.0.0/0\nEndpoint = 62.169.136.4:51820\n";

    #[test]
    fn a_proton_file_is_recognised_by_its_server_and_options() {
        let dir = kroma_module_sdk::testing::temp_dir("provider-proton");

        let view = provider_of(dir.path(), PROTON);

        assert_eq!(
            view,
            Some(ProviderView::Proton {
                server: Some("CH#3".into()),
                port_forwarding: true
            })
        );
    }

    #[test]
    fn a_secure_core_server_name_reads_as_a_proton_server() {
        assert!(is_proton_server("IS-CH#1"));
        assert!(!is_proton_server("Mullvad se-sto-wg-001"));
        assert!(!is_proton_server("NetShield = 1"));
    }

    #[test]
    fn a_config_from_another_provider_names_none() {
        let dir = kroma_module_sdk::testing::temp_dir("provider-other");
        let plain = "[Interface]\nPrivateKey = k\n[Peer]\nEndpoint = 1.2.3.4:51820\n";

        assert_eq!(provider_of(dir.path(), plain), None);
        assert_eq!(provider_of(dir.path(), ""), None);
    }
}

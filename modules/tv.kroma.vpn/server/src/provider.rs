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

/// The provider behind `wg_config`: the Mullvad place it names, on the device
/// this server registered, or a Proton VPN file recognised by the comments
/// Proton writes in it.
pub(crate) fn provider_of(dir: &Path, wg_config: &str) -> Option<ProviderView> {
    if wg_config.trim().is_empty() {
        return None;
    }
    let held = crate::mullvad::held(dir);
    match (provider_of_config(wg_config), held) {
        (
            Some(ProviderView::Mullvad {
                country,
                country_name,
                city,
                city_name,
                hostname,
                ..
            }),
            Some(account),
        ) => Some(ProviderView::Mullvad {
            country,
            country_name,
            city,
            city_name,
            hostname,
            device_name: account.device_name,
        }),
        (None, Some(account)) => account.place.map(|place| ProviderView::Mullvad {
            country: place.country,
            country_name: place.country_name,
            city: place.city,
            city_name: place.city_name,
            hostname: place.hostname,
            device_name: account.device_name,
        }),
        (view, _) => view,
    }
}

/// The provider a config names by itself: a Proton VPN file, by its comments.
pub(crate) fn provider_of_config(config: &str) -> Option<ProviderView> {
    let comments: Vec<&str> = config
        .lines()
        .filter_map(|line| line.trim().strip_prefix('#'))
        .map(str::trim)
        .collect();
    if let Some(view) = mullvad_of(&comments) {
        return Some(view);
    }
    let server = comments
        .iter()
        .find(|c| is_proton_server(c))
        .map(ToString::to_string);
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

fn mullvad_of(comments: &[&str]) -> Option<ProviderView> {
    let named = comments.iter().find_map(|c| c.strip_prefix("Mullvad "))?;
    let mut parts = named.split(" · ").map(str::trim);
    let hostname = parts.next()?.to_string();
    let country_name = parts.next()?.to_string();
    let city_name = parts.next().map(str::to_string);
    let mut codes = hostname.split('-');
    let country = codes.next()?.to_string();
    let city = city_name
        .as_ref()
        .and(codes.next())
        .map(|city| format!("{country}-{city}"));
    Some(ProviderView::Mullvad {
        country,
        country_name,
        city,
        city_name,
        hostname,
        device_name: String::new(),
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

/// What a tunnel is called where the admin picks one: the Mullvad place, the
/// Proton server, or else the peer it reaches.
pub(crate) fn label_of(config: &str, provider: Option<&ProviderView>) -> String {
    match provider {
        Some(ProviderView::Mullvad {
            country_name,
            city_name,
            ..
        }) => match city_name {
            Some(city) => format!("Mullvad · {country_name}, {city}"),
            None => format!("Mullvad · {country_name}"),
        },
        Some(ProviderView::Proton {
            server: Some(server),
            ..
        }) => format!("Proton VPN · {server}"),
        _ => config
            .lines()
            .filter_map(|line| line.trim().strip_prefix("Endpoint"))
            .filter_map(|rest| rest.trim_start().strip_prefix('='))
            .map(|endpoint| endpoint.trim().to_string())
            .next()
            .unwrap_or_else(|| "WireGuard".to_string()),
    }
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

    const STOCKHOLM: &str = "[Interface]\nPrivateKey = private\nAddress = 10.140.1.2/32\n\n[Peer]\n# Mullvad se-sto-wg-001 · Sweden · Stockholm\nPublicKey = relay-pub\nEndpoint = 185.65.135.1:51820\n";

    #[test]
    fn a_mullvad_config_is_recognised_by_the_place_it_names() {
        let view = provider_of_config(STOCKHOLM);

        assert_eq!(
            view,
            Some(ProviderView::Mullvad {
                country: "se".into(),
                country_name: "Sweden".into(),
                city: Some("se-sto".into()),
                city_name: Some("Stockholm".into()),
                hostname: "se-sto-wg-001".into(),
                device_name: String::new(),
            })
        );
        assert_eq!(
            label_of(STOCKHOLM, view.as_ref()),
            "Mullvad · Sweden, Stockholm"
        );
    }

    #[test]
    fn a_mullvad_config_on_this_servers_device_names_the_device() {
        let dir = kroma_module_sdk::testing::temp_dir("provider-mullvad-held");
        crate::mullvad::hold_for_test(dir.path(), "private", "Brave Otter");

        let view = provider_of(dir.path(), STOCKHOLM);

        assert!(matches!(
            view,
            Some(ProviderView::Mullvad { ref device_name, ref city_name, .. })
                if device_name == "Brave Otter" && city_name.as_deref() == Some("Stockholm")
        ));
    }
}

//! The `network` point this module answers: the default tunnel, named `vpn`,
//! and one network per kept config the admin put in the router, each named
//! after its id so a rule keeps reaching the same server.

use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};

use kroma_module_sdk::host::HostCtx;

/// The routes this module mounts for the `network` point.
pub fn routes<S: HostCtx + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new().route("/_port/network/list", post(list::<S>))
}

const NETWORK_NAME: &str = "vpn";

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Offer {
    name: String,
    label: String,
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

const CARRIES: Carries = Carries {
    tcp: true,
    udp: false,
    dns: true,
};

// wireproxy carries TCP and resolves a name inside the tunnel. With no tunnel
// configured there is nothing on offer, and with one configured the network is
// on offer even while the bridge is down, so its traffic is refused.
fn offers(
    host: &dyn HostCtx,
    running: bool,
    exit: Option<String>,
    routed_up: &[String],
) -> Vec<Offer> {
    let Some(password) = crate::admin::bridge_password(host) else {
        return Vec::new();
    };
    let dir = host.data_dir().join("vpn");
    let base = host.setting_i64("vpnLocalPort", 25345).clamp(1, 65535) as u16;
    let default_config = host.setting_str("vpnWgConfig", "");
    let endpoint = |port: u16| Endpoint {
        address: format!("127.0.0.1:{port}"),
        username: crate::socks_auth::USER,
        password: password.clone(),
    };
    let default_label = crate::provider::label_of(
        &default_config,
        crate::provider::provider_of(&dir, &default_config).as_ref(),
    );
    let mut offered = vec![Offer {
        name: NETWORK_NAME.to_string(),
        label: default_label,
        endpoint: endpoint(base),
        carries: CARRIES,
        health: Health {
            up: running,
            exit: exit.clone(),
        },
    }];
    for saved in crate::saved::routed(&dir) {
        let is_default = crate::wireguard::same_tunnel(&saved.config, &default_config);
        let port = if is_default {
            Some(base)
        } else {
            saved
                .slot
                .and_then(|slot| crate::saved::port_for(base, slot))
        };
        let Some(port) = port else { continue };
        let label = crate::provider::label_of(
            &saved.config,
            crate::provider::provider_of_config(&saved.config).as_ref(),
        );
        offered.push(Offer {
            name: format!("{NETWORK_NAME}-{}", saved.id),
            label,
            endpoint: endpoint(port),
            carries: CARRIES,
            health: if is_default {
                Health {
                    up: running,
                    exit: exit.clone(),
                }
            } else {
                Health {
                    up: routed_up.contains(&saved.id),
                    exit: None,
                }
            },
        });
    }
    offered
}

async fn list<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
) -> Json<Vec<Offer>> {
    let (running, exit, routed_up) = match kroma_module_sdk::host::service::<crate::Vpn>(&host) {
        Some(vpn) => (vpn.running().await, vpn.last_exit(), vpn.routed_up().await),
        None => (false, None, Vec::new()),
    };
    Json(offers(&host, running, exit, &routed_up))
}

#[cfg(test)]
mod tests {
    use kroma_module_sdk::host::testing::StubHost;

    use super::*;

    #[test]
    fn with_no_tunnel_configured_nothing_is_on_offer() {
        let host = StubHost::new();

        assert!(offers(&host, false, None, &[]).is_empty());
    }

    fn configured() -> StubHost {
        StubHost::new().with_setting("vpnWgConfig", serde_json::json!("[Interface]"))
    }

    #[test]
    fn a_tunnel_is_on_offer_with_the_bridges_address_and_credentials() {
        let host = configured();

        let offered = offers(&host, true, None, &[]);

        assert_eq!(offered[0].name, "vpn");
        assert_eq!(offered[0].endpoint.address, "127.0.0.1:25345");
        assert_eq!(offered[0].endpoint.username, crate::socks_auth::USER);
        assert!(!offered[0].endpoint.password.is_empty());
        assert!(offered[0].health.up);
    }

    #[test]
    fn a_configured_tunnel_whose_bridge_is_down_stays_on_offer_as_down() {
        let host = configured();

        let offered = offers(&host, false, None, &[]);

        assert_eq!(offered.len(), 1);
        assert!(!offered[0].health.up);
    }

    #[test]
    fn an_offer_never_prints_its_password() {
        let host = configured();

        let printed = format!("{:?}", offers(&host, true, None, &[])[0]);

        assert!(!printed.contains(&offers(&host, true, None, &[])[0].endpoint.password));
    }

    const OTHER: &str =
        "[Interface]\nPrivateKey = O\n[Peer]\n# NL#12\nPublicKey = P\nEndpoint = 192.0.2.9:51820\n";

    fn routed(host: &StubHost, config: &str) -> String {
        let dir = host.data_dir().join("vpn");
        let id = crate::saved::add(&dir, &[config.to_string()])
            .unwrap()
            .remove(0);
        crate::saved::set_routable(&dir, &id, true).unwrap();
        id
    }

    #[test]
    fn a_config_in_the_router_is_offered_under_its_own_name_on_its_own_port() {
        let host = configured();
        let id = routed(&host, OTHER);

        let offered = offers(&host, true, None, std::slice::from_ref(&id));

        assert_eq!(offered.len(), 2);
        assert_eq!(offered[1].name, format!("vpn-{id}"));
        assert_eq!(offered[1].label, "Proton VPN · NL#12");
        assert_eq!(offered[1].endpoint.address, "127.0.0.1:25346");
        assert!(offered[1].health.up);
    }

    #[test]
    fn a_config_in_the_router_whose_tunnel_is_down_is_offered_as_down() {
        let host = configured();
        routed(&host, OTHER);

        let offered = offers(&host, true, None, &[]);

        assert!(!offered[1].health.up);
    }

    #[test]
    fn the_default_config_in_the_router_is_offered_on_the_default_tunnel() {
        let host = configured();
        let id = routed(&host, "[Interface]");

        let offered = offers(&host, true, Some("203.0.113.7".to_string()), &[]);

        assert_eq!(offered[1].name, format!("vpn-{id}"));
        assert_eq!(offered[1].endpoint.address, "127.0.0.1:25345");
        assert!(offered[1].health.up);
        assert_eq!(offered[1].health.exit.as_deref(), Some("203.0.113.7"));
    }

    #[test]
    fn without_a_default_tunnel_nothing_in_the_router_is_offered() {
        let host = StubHost::new();
        let id = routed(&host, OTHER);

        assert!(offers(&host, true, None, &[id]).is_empty());
    }

    #[test]
    fn the_exit_the_engine_last_reported_is_offered_without_asking_it_again() {
        let host = StubHost::new().with_setting("vpnWgConfig", serde_json::json!("[Interface]"));
        std::fs::create_dir_all(host.data_dir().join("vpn")).unwrap();
        crate::socks_auth::password(&host.data_dir().join("vpn")).unwrap();

        let offered = offers(&host, true, Some("203.0.113.7".to_string()), &[]);

        assert_eq!(offered[0].health.exit.as_deref(), Some("203.0.113.7"));
    }
}

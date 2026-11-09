use std::path::Path;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use kroma_module_sdk::host::{run_blocking, HostCtx};

use crate::bridge::Bridge;
use crate::provision;
use crate::saved::{self, Saved};
use crate::vpn::{base_port, Vpn};

pub(crate) struct Routed {
    bridge: Arc<Bridge>,
    port: u16,
}

struct Wanted {
    id: String,
    config: String,
    port: u16,
}

fn wanted(dir: &Path, default_config: &str, base: u16) -> Vec<Wanted> {
    saved::routed(dir)
        .into_iter()
        .filter(|one| !crate::wireguard::same_tunnel(&one.config, default_config))
        .filter_map(|Saved { id, config, slot }| {
            let port = saved::port_for(base, slot?)?;
            Some(Wanted { id, config, port })
        })
        .collect()
}

impl Vpn {
    /// Bring the router's tunnels in line with the kept configs: one bridge per
    /// config in the router, none for the default config, which the default
    /// bridge already carries, and none at all without a default tunnel.
    pub async fn apply_routed(self: &Arc<Self>, host: &dyn HostCtx) {
        let default_config = host.setting_str("vpnWgConfig", "");
        let wanted = if default_config.trim().is_empty() || self.stopping.load(Ordering::SeqCst) {
            Vec::new()
        } else {
            wanted(&self.dir(), &default_config, base_port(host))
        };
        let mut routed = self.routed.lock().await;
        let stale: Vec<String> = routed
            .iter()
            .filter(|(id, held)| !wanted.iter().any(|w| &w.id == *id && w.port == held.port))
            .map(|(id, _)| id.clone())
            .collect();
        for id in stale {
            if let Some(held) = routed.remove(&id) {
                retire_routed(held).await;
            }
        }
        let missing: Vec<Wanted> = wanted
            .into_iter()
            .filter(|w| !routed.contains_key(&w.id))
            .collect();
        if missing.is_empty() {
            return;
        }
        let bin = match provision::ensure(&self.data_dir).await {
            Ok(bin) => bin,
            Err(e) => {
                tracing::warn!(error = %e, "wireguard bridge failed to start");
                return;
            }
        };
        for Wanted { id, config, port } in missing {
            let bridge = Bridge::new(self.dir().join("net").join(&id), self.dir());
            let generation = bridge.retire().await;
            match bridge.launch(generation, bin.clone(), config, port).await {
                Ok(()) => {
                    routed.insert(id, Routed { bridge, port });
                }
                Err(e) => {
                    tracing::warn!(error = %e, port, "routed wireguard bridge failed to start")
                }
            }
        }
    }

    /// The kept configs whose own tunnel is up right now, by id.
    pub async fn routed_up(&self) -> Vec<String> {
        let routed = self.routed.lock().await;
        let mut up = Vec::with_capacity(routed.len());
        for (id, held) in routed.iter() {
            if held.bridge.running().await {
                up.push(id.clone());
            }
        }
        up
    }
}

pub(crate) async fn retire_routed(held: Routed) {
    held.bridge.retire().await;
    let dir = held.bridge.dir.clone();
    let _ = run_blocking(move || std::fs::remove_dir_all(dir)).await;
}

#[cfg(all(test, unix))]
mod tests {
    use crate::test_support::{configured_host, install_script, vpn_for, RUNNING};
    use kroma_module_sdk::host::testing::StubHost;
    use kroma_module_sdk::host::HostCtx;

    fn other_config(server: &str) -> String {
        format!("[Interface]\nPrivateKey = OTHER\nAddress = 10.2.0.2/32\n[Peer]\n# {server}\nPublicKey = P\nAllowedIPs = 0.0.0.0/0\nEndpoint = 192.0.2.9:51820\n")
    }

    fn routed_config(host: &StubHost, config: &str) -> String {
        let dir = host.data_dir().join("vpn");
        let id = crate::saved::add(&dir, &[config.to_string()])
            .unwrap()
            .remove(0);
        crate::saved::set_routable(&dir, &id, true).unwrap();
        id
    }

    #[tokio::test]
    async fn a_config_in_the_router_runs_its_own_bridge_on_its_slot_port() {
        let host = configured_host();
        install_script(host.data_dir(), RUNNING);
        let id = routed_config(&host, &other_config("NL#12"));
        let vpn = vpn_for(&host);

        vpn.apply(&host).await;

        assert_eq!(vpn.routed_up().await, vec![id.clone()]);
        let proxy = std::fs::read_to_string(vpn.dir().join("net").join(&id).join("wireproxy.conf"))
            .unwrap();
        assert!(proxy.contains("BindAddress = 127.0.0.1:26000"), "{proxy}");
        vpn.stop().await;
    }

    #[tokio::test]
    async fn the_default_config_never_runs_a_second_bridge() {
        let host = configured_host();
        install_script(host.data_dir(), RUNNING);
        routed_config(&host, crate::test_support::WG_CONFIG);
        let vpn = vpn_for(&host);

        vpn.apply(&host).await;

        assert!(vpn.running().await);
        assert!(vpn.routed_up().await.is_empty());
        vpn.stop().await;
    }

    #[tokio::test]
    async fn without_a_default_tunnel_no_config_in_the_router_runs() {
        let host = StubHost::new();
        install_script(host.data_dir(), RUNNING);
        routed_config(&host, &other_config("NL#12"));
        let vpn = vpn_for(&host);

        vpn.apply(&host).await;

        assert!(vpn.routed_up().await.is_empty());
    }

    #[tokio::test]
    async fn taking_a_config_out_of_the_router_stops_its_bridge_and_drops_its_key() {
        let host = configured_host();
        install_script(host.data_dir(), RUNNING);
        let id = routed_config(&host, &other_config("NL#12"));
        let vpn = vpn_for(&host);
        vpn.apply(&host).await;

        crate::saved::set_routable(&vpn.dir(), &id, false).unwrap();
        vpn.apply_routed(&host).await;

        assert!(vpn.routed_up().await.is_empty());
        assert!(!vpn.dir().join("net").join(&id).exists());
        vpn.stop().await;
    }

    #[tokio::test]
    async fn stop_takes_the_router_tunnels_down_too() {
        let host = configured_host();
        install_script(host.data_dir(), RUNNING);
        routed_config(&host, &other_config("NL#12"));
        let vpn = vpn_for(&host);
        vpn.apply(&host).await;

        vpn.stop().await;
        vpn.apply(&host).await;

        assert!(!vpn.running().await);
        assert!(vpn.routed_up().await.is_empty());
    }
}

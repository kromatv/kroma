use std::sync::atomic::Ordering;

use serde_json::json;

use kroma_module_sdk::host::{Event, HostCtx};

use crate::db;
use crate::VpnStatusView;

use super::DownloadManager;

const VPN_FAIL_GRACE: u32 = 2;

impl DownloadManager {
    pub fn gate_open(&self) -> bool {
        self.gate_open.load(Ordering::Relaxed)
    }

    pub fn vpn_status(&self) -> Option<VpnStatusView> {
        self.vpn_status.lock().unwrap().clone()
    }

    /// One probe + gate transition; no proxy configured = dormant. Blocking.
    pub fn vpn_check(&self, host: &dyn HostCtx) -> Option<crate::proxycheck::VpnCheck> {
        let Some(proxy) = active_proxy_url(host) else {
            self.gate_open.store(true, Ordering::Relaxed);
            *self.vpn_status.lock().unwrap() = None;
            return None;
        };
        let check_url = host.setting_str("vpnCheckUrl", "https://api.ipify.org");
        let check = crate::proxycheck::check(&proxy, &check_url);
        let sealed = check.sealed();
        let kill_switch = host.setting_bool("vpnKillSwitch", false);
        let was_open = self.gate_open.load(Ordering::Relaxed);

        // One blip must not block downloads; only a sustained failure does.
        let streak = if sealed {
            self.vpn_fail_streak.store(0, Ordering::Relaxed);
            0
        } else {
            self.vpn_fail_streak.fetch_add(1, Ordering::Relaxed) + 1
        };

        if kill_switch && !sealed && streak >= VPN_FAIL_GRACE && was_open {
            self.close_gate();
        } else if (!kill_switch || sealed) && !was_open {
            self.open_gate();
        }
        let paused = !self.gate_open.load(Ordering::Relaxed);
        let status = VpnStatusView {
            connected: sealed,
            exit_ip: check.proxied_ip.clone(),
            paused,
        };
        let changed =
            self.vpn_status.lock().unwrap().replace(status.clone()) != Some(status.clone());
        if changed {
            host.publish(Event::new(
                "vpn.status",
                json!({
                    "connected": status.connected,
                    "exitIp": status.exit_ip,
                    "paused": status.paused,
                }),
            ));
        }
        Some(check)
    }

    fn close_gate(&self) {
        self.gate_open.store(false, Ordering::Relaxed);
        tracing::warn!("VPN kill switch engaged: pausing embedded downloads");
        let mut held: Vec<String> = Vec::new();
        if let Ok(conn) = self.core().get() {
            if let Ok(rows) = db::active_downloads(&conn) {
                drop(conn);
                for row in rows {
                    if row.client_id != db::EMBEDDED_CLIENT_ID || row.status == "paused" {
                        continue;
                    }
                    if self.pause(&row.id).is_ok() {
                        held.push(row.id);
                    }
                }
            }
        }
        *self.paused_by_killswitch.lock().unwrap() = held;
    }

    fn open_gate(&self) {
        self.gate_open.store(true, Ordering::Relaxed);
        let held = std::mem::take(&mut *self.paused_by_killswitch.lock().unwrap());
        if !held.is_empty() {
            tracing::info!(count = held.len(), "VPN restored: resuming held downloads");
        }
        for id in held {
            let _ = self.resume(&id);
        }
    }
}

/// The local wireproxy SOCKS5 bridge peers are routed through (librqbit only
/// proxies via SOCKS5). `None` = no VPN, torrent traffic goes out directly.
pub fn active_proxy_url(host: &dyn HostCtx) -> Option<String> {
    crate::port::vpn::proxy_url(host)
}

pub(super) fn vpn_sealed_expected(host: &dyn HostCtx) -> bool {
    host.module_enabled("tv.kroma.vpn") && !host.setting_str("vpnWgConfig", "").trim().is_empty()
}

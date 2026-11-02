//! Publishing and searching on the local network for a module that declares it,
//! so the module holds no socket of its own.

use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr, UdpSocket};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};

use kroma_module_manifest::Discovery;
use kroma_wasm_host::{Lan, Reply, Service};
use mdns_sd::{ServiceDaemon, ServiceInfo};

const SSDP_ADDRESS: &str = "239.255.255.250:1900";
const MULTICAST_TTL: u32 = 2;
const MAX_WAIT: Duration = Duration::from_secs(10);
const ROUTE_PROBE: &str = "8.8.8.8:80";

pub(super) struct ModuleLan {
    module: String,
    mdns: bool,
    ssdp: bool,
    daemon: Mutex<Option<ServiceDaemon>>,
    announced: Mutex<HashMap<u64, String>>,
    next: AtomicU64,
}

// Connecting a UDP socket sends no packets; it only consults the routing table.
// A machine with no route reports loopback or the wildcard, and publishing either
// hands every client an address that cannot work.
fn primary_address() -> Option<IpAddr> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect(ROUTE_PROBE).ok()?;
    let ip = socket.local_addr().ok()?.ip();
    (!ip.is_loopback() && !ip.is_unspecified()).then_some(ip)
}

fn search_message(target: &str) -> String {
    format!(
        "M-SEARCH * HTTP/1.1\r\nHOST: {SSDP_ADDRESS}\r\nMAN: \"ssdp:discover\"\r\nST: {target}\r\nMX: 2\r\n\r\n"
    )
}

fn headers_of(text: &str) -> Vec<(String, String)> {
    text.lines()
        .skip(1)
        .filter_map(|line| line.split_once(':'))
        .map(|(name, value)| (name.trim().to_ascii_lowercase(), value.trim().to_string()))
        .collect()
}

fn is_plain_target(target: &str) -> bool {
    !target.is_empty() && target.chars().all(|c| c.is_ascii_graphic())
}

impl ModuleLan {
    pub(super) fn new(module: &str, discovery: &[Discovery]) -> Self {
        Self {
            module: module.to_string(),
            mdns: discovery.contains(&Discovery::Mdns),
            ssdp: discovery.contains(&Discovery::Ssdp),
            daemon: Mutex::new(None),
            announced: Mutex::new(HashMap::new()),
            next: AtomicU64::new(0),
        }
    }

    pub(super) fn withdraw_all(&self) {
        let names: Vec<String> = self
            .announced
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .drain()
            .map(|(_, name)| name)
            .collect();
        let mut daemon = self.daemon.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(running) = daemon.take() {
            for name in names {
                let _ = running.unregister(&name);
            }
            let _ = running.shutdown();
        }
    }
}

impl Lan for ModuleLan {
    fn announce(&self, service: Service) -> Result<u64, String> {
        if !self.mdns {
            return Err(format!("{} does not declare mdns", self.module));
        }
        let properties: Vec<(&str, &str)> = service
            .properties
            .iter()
            .map(|(name, value)| (name.as_str(), value.as_str()))
            .collect();
        let address = primary_address().map(|ip| ip.to_string());
        let info = ServiceInfo::new(
            service.kind.as_str(),
            service.name.as_str(),
            service.host.as_str(),
            address.as_deref().unwrap_or_default(),
            service.port,
            &properties[..],
        )
        .map_err(|error| error.to_string())?;
        let info = if address.is_none() { info.enable_addr_auto() } else { info };
        let full_name = info.get_fullname().to_string();
        let mut daemon = self.daemon.lock().unwrap_or_else(PoisonError::into_inner);
        if daemon.is_none() {
            *daemon = Some(ServiceDaemon::new().map_err(|error| error.to_string())?);
        }
        daemon
            .as_ref()
            .ok_or("no mDNS daemon")?
            .register(info)
            .map_err(|error| error.to_string())?;
        let announcement = self.next.fetch_add(1, Ordering::Relaxed);
        self.announced
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(announcement, full_name);
        Ok(announcement)
    }

    fn withdraw(&self, announcement: u64) {
        let name = self
            .announced
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .remove(&announcement);
        let daemon = self.daemon.lock().unwrap_or_else(PoisonError::into_inner);
        if let (Some(name), Some(daemon)) = (name, daemon.as_ref()) {
            let _ = daemon.unregister(&name);
        }
    }

    #[expect(
        clippy::disallowed_methods,
        reason = "one multicast search of the local network, which the module's manifest declares"
    )]
    fn search(&self, target: &str, wait: Duration) -> Result<Vec<Reply>, String> {
        if !self.ssdp {
            return Err(format!("{} does not declare ssdp", self.module));
        }
        if !is_plain_target(target) {
            return Err("a search target has no spaces or line breaks".to_string());
        }
        let bind = SocketAddr::new(primary_address().unwrap_or(std::net::Ipv4Addr::UNSPECIFIED.into()), 0);
        let socket = UdpSocket::bind(bind).map_err(|error| error.to_string())?;
        let _ = socket.set_multicast_ttl_v4(MULTICAST_TTL);
        socket
            .send_to(search_message(target).as_bytes(), SSDP_ADDRESS)
            .map_err(|error| error.to_string())?;
        let deadline = Instant::now() + wait.min(MAX_WAIT);
        let mut replies = Vec::new();
        let mut buffer = [0_u8; 2048];
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                return Ok(replies);
            }
            socket.set_read_timeout(Some(left)).map_err(|error| error.to_string())?;
            let Ok((read, from)) = socket.recv_from(&mut buffer) else {
                return Ok(replies);
            };
            replies.push(Reply {
                source: from.ip().to_string(),
                headers: headers_of(&String::from_utf8_lossy(&buffer[..read])),
            });
        }
    }

    fn addresses(&self) -> Vec<String> {
        primary_address().map(|ip| ip.to_string()).into_iter().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_module_that_declares_no_mdns_cannot_announce() {
        let lan = ModuleLan::new("tv.example", &[Discovery::Ssdp]);

        let announced = lan.announce(Service {
            kind: "_x._tcp.local.".into(),
            name: "x".into(),
            host: "x.local.".into(),
            port: 1,
            properties: Vec::new(),
        });

        assert!(announced.is_err());
    }

    #[test]
    fn a_module_that_declares_no_ssdp_cannot_search() {
        let lan = ModuleLan::new("tv.example", &[Discovery::Mdns]);

        let searched = lan.search("roku:ecp", Duration::from_millis(1));

        assert!(searched.is_err());
    }

    #[test]
    fn a_target_cannot_add_a_header_to_the_message() {
        let lan = ModuleLan::new("tv.example", &[Discovery::Ssdp]);

        let searched = lan.search("x\r\nEVIL: 1", Duration::from_millis(1));

        assert!(searched.is_err());
    }

    #[test]
    fn a_reply_reads_as_lowercase_names_without_its_status_line() {
        let headers = headers_of("HTTP/1.1 200 OK\r\nUSN: uuid:roku:ecp:ABC\r\nST: roku:ecp\r\n\r\n");

        assert_eq!(
            headers,
            vec![
                ("usn".to_string(), "uuid:roku:ecp:ABC".to_string()),
                ("st".to_string(), "roku:ecp".to_string()),
            ]
        );
    }
}

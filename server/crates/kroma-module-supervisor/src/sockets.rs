//! What rules the raw sockets a module's component opens. The core wires its
//! network policy in; a supervisor never told grants no socket.

use std::net::SocketAddr;
use std::sync::Arc;

use kroma_module_manifest::Proto;

use super::Supervisor;

/// One use of a raw socket: the transport, the remote address, and every name
/// the module resolved to that address through the host.
#[derive(Debug, Clone, Copy)]
pub struct SocketAsk<'a> {
    pub proto: Proto,
    pub address: SocketAddr,
    pub names: &'a [String],
}

/// Why a raw socket or a lookup was refused, and the rule or guard that did it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SocketRefused {
    pub rule: Option<String>,
    pub reason: String,
}

/// Rules each raw socket use and each name a module looks up for one. `caller`
/// is always the module the host runs, never what it claims. `Ok` holds the
/// purpose the use is filed under: the `net.connect` entry that covers it.
pub trait SocketRules: Send + Sync {
    fn decide_socket(&self, caller: &str, ask: &SocketAsk<'_>) -> Result<String, SocketRefused>;
    fn decide_lookup(&self, caller: &str, name: &str) -> Result<String, SocketRefused>;
}

/// This server's own ports, read at each connection a module's gateway dials.
pub type OwnPorts = Arc<dyn Fn() -> Vec<u16> + Send + Sync>;

impl Supervisor {
    /// Rule the raw sockets of every module started from here on with `rules`.
    /// Set once: a later call changes nothing.
    pub fn rule_sockets_with(&self, rules: Arc<dyn SocketRules>) {
        let _ = self.sockets.set(rules);
    }

    /// Keep the direct connections of every module started from here on off
    /// this machine's `ports`, whatever name or address they dial. Set once.
    pub fn guard_own_ports(&self, ports: OwnPorts) {
        let _ = self.own_ports.set(ports);
    }

    pub(crate) fn own_ports(&self) -> Option<OwnPorts> {
        self.own_ports.get().cloned()
    }
}

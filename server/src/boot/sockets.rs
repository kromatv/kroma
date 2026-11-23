//! The core's network policy as the supervisor asks it about a component's raw
//! sockets.

use std::sync::Arc;

use kroma_engine::services::network::{Network, RawSocket, SocketRefusal};
use kroma_module_supervisor::{OwnPorts, SocketAsk, SocketRefused, SocketRules};

/// Rules every raw socket a component opens with the engine's network policy.
pub struct NetworkSockets(pub Arc<Network>);

fn refused(refusal: SocketRefusal) -> SocketRefused {
    SocketRefused {
        rule: refusal.rule,
        reason: refusal.reason,
    }
}

impl SocketRules for NetworkSockets {
    fn decide_socket(&self, caller: &str, ask: &SocketAsk<'_>) -> Result<String, SocketRefused> {
        let socket = RawSocket {
            proto: ask.proto,
            address: ask.address,
            names: ask.names,
        };
        self.0.rule_socket(caller, &socket).map_err(refused)
    }

    fn decide_lookup(&self, caller: &str, name: &str) -> Result<String, SocketRefused> {
        self.0.rule_lookup(caller, name).map_err(refused)
    }
}

/// This server's own ports as the engine's network policy reads them, which every
/// module's gateway keeps its direct connections off.
pub fn own_ports_of(network: Arc<Network>) -> OwnPorts {
    Arc::new(move || network.own_ports())
}

#[cfg(test)]
mod tests;

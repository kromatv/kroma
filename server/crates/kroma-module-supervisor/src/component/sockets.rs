//! A module's raw sockets: granted for the transports its `net.connect` names in
//! a `proto`, each use ruled by the core and filed in the journal under the
//! purpose of the entry that covers it, with the bytes each datagram carried.

mod rulings;
mod tally;

use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::sync::{Arc, Mutex, PoisonError};

use kroma_module_host::{NetworkFlow, NetworkPolicy, NetworkRoute};
use kroma_module_manifest::{ModuleManifest, Proto};
use kroma_wasm_host::{SocketCall, SocketGrant, SocketProto, SocketUse, Sockets};

use rulings::Rulings;
use tally::{Carried, Tallies};

use crate::{SocketAsk, SocketRefused, SocketRules};

const LOOKUP_METHOD: &str = "LOOKUP";

pub(super) struct ModuleSockets {
    module: String,
    rules: Arc<dyn SocketRules>,
    journal: Arc<dyn NetworkPolicy>,
    ruled: Mutex<Rulings>,
    tallies: Mutex<Tallies>,
}

pub(super) fn socket_grant(
    manifest: &ModuleManifest,
    rules: Option<Arc<dyn SocketRules>>,
    journal: Arc<dyn NetworkPolicy>,
) -> Option<SocketGrant> {
    let connect = &manifest.permissions.as_ref()?.net.connect;
    let names = |proto: Proto| connect.iter().any(|entry| entry.proto.contains(&proto));
    let (tcp, udp) = (names(Proto::Tcp), names(Proto::Udp));
    if !tcp && !udp {
        return None;
    }
    let sockets = ModuleSockets {
        module: manifest.id.clone(),
        rules: rules?,
        journal,
        ruled: Mutex::default(),
        tallies: Mutex::default(),
    };
    Some(SocketGrant {
        tcp,
        udp,
        rules: Arc::new(sockets),
    })
}

fn proto_of(proto: SocketProto) -> Proto {
    match proto {
        SocketProto::Tcp => Proto::Tcp,
        SocketProto::Udp => Proto::Udp,
    }
}

fn absolute(name: &str) -> String {
    if name.ends_with('.') {
        name.to_string()
    } else {
        format!("{name}.")
    }
}

fn host_of(call: &SocketCall<'_>) -> String {
    call.names
        .last()
        .cloned()
        .unwrap_or_else(|| call.address.ip().to_canonical().to_string())
}

struct Filed<'a> {
    method: String,
    host: &'a str,
    port: u16,
}

fn flow(filed: &Filed<'_>, answer: &Result<String, SocketRefused>) -> NetworkFlow {
    let (purpose, route, rule, error) = match answer {
        Ok(purpose) => (purpose.clone(), NetworkRoute::Direct, None, None),
        Err(refused) => (
            String::new(),
            NetworkRoute::Blocked,
            refused.rule.clone(),
            Some(refused.reason.clone()),
        ),
    };
    NetworkFlow {
        purpose,
        method: filed.method.clone(),
        host: filed.host.to_string(),
        port: filed.port,
        route,
        status: None,
        bytes_in: 0,
        bytes_out: 0,
        duration_ms: 0,
        error,
        rule,
        carried: false,
    }
}

impl ModuleSockets {
    fn file(&self, flows: Vec<NetworkFlow>) {
        if !flows.is_empty() {
            self.journal.record_flows(&self.module, flows);
        }
    }

    fn rule(&self, call: &SocketCall<'_>) -> Result<String, SocketRefused> {
        let answer = self.rules.decide_socket(
            &self.module,
            &SocketAsk {
                proto: proto_of(call.proto),
                address: call.address,
                names: call.names,
            },
        );
        let filed_now = answer.is_err() || call.using == SocketUse::Connect;
        if filed_now && call.using != SocketUse::Receive {
            let filed = Filed {
                method: format!("{:?}", call.proto).to_ascii_uppercase(),
                host: &host_of(call),
                port: call.address.port(),
            };
            self.file(vec![flow(&filed, &answer)]);
        }
        answer
    }

    fn purpose_of(&self, call: &SocketCall<'_>) -> Option<String> {
        let ruled = self.ruled.lock().unwrap_or_else(PoisonError::into_inner);
        ruled.remembered(call).flatten()
    }
}

impl Sockets for ModuleSockets {
    fn allows(&self, call: &SocketCall<'_>) -> bool {
        if let Some(purpose) = self.ruled.lock().unwrap_or_else(PoisonError::into_inner).remembered(call) {
            return purpose.is_some();
        }
        let purpose = self.rule(call).ok();
        let allowed = purpose.is_some();
        self.ruled
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .remember(call, purpose);
        allowed
    }

    fn resolve(&self, name: &str) -> Option<Vec<IpAddr>> {
        let answer = self.rules.decide_lookup(&self.module, name);
        let filed = Filed {
            method: LOOKUP_METHOD.to_string(),
            host: name,
            port: 0,
        };
        self.file(vec![flow(&filed, &answer)]);
        answer.ok()?;
        let resolved = (absolute(name), 0).to_socket_addrs().ok();
        Some(resolved.into_iter().flatten().map(|address| address.ip()).collect())
    }

    fn carried(&self, call: &SocketCall<'_>, bytes: u64) {
        let purpose = self.purpose_of(call).unwrap_or_default();
        let carried = Carried {
            peer: SocketAddr::new(call.address.ip().to_canonical(), call.address.port()),
            using: call.using,
            bytes,
            purpose: &purpose,
            host: &host_of(call),
        };
        let flows = self.tallies.lock().unwrap_or_else(PoisonError::into_inner).count(&carried);
        self.file(flows);
    }
}

impl Drop for ModuleSockets {
    fn drop(&mut self) {
        let flows = self.tallies.lock().unwrap_or_else(PoisonError::into_inner).drain();
        self.file(flows);
    }
}

#[cfg(test)]
mod tests;

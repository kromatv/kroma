//! A module's raw sockets: granted for the transports its `net.connect` names in
//! a `proto`, each use ruled by the core and filed in the journal under the
//! purpose of the entry that covers it.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use kroma_module_host::{NetworkFlow, NetworkPolicy, NetworkRoute};
use kroma_module_manifest::{ModuleManifest, Proto};
use kroma_wasm_host::{SocketCall, SocketGrant, SocketProto, SocketUse, Sockets};

use crate::{SocketAsk, SocketRefused, SocketRules};

const RULED_FOR: Duration = Duration::from_secs(10);
const RULINGS_KEPT: usize = 512;
const LOOKUP_METHOD: &str = "LOOKUP";

type Key = (SocketProto, SocketUse, SocketAddr, Vec<String>);

pub(super) struct ModuleSockets {
    module: String,
    rules: Arc<dyn SocketRules>,
    journal: Arc<dyn NetworkPolicy>,
    ruled: Mutex<HashMap<Key, (bool, Instant)>>,
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
        ruled: Mutex::new(HashMap::new()),
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
    fn remembered(&self, key: &Key) -> Option<bool> {
        let ruled = self.ruled.lock().unwrap_or_else(PoisonError::into_inner);
        ruled
            .get(key)
            .filter(|(_, at)| at.elapsed() < RULED_FOR)
            .map(|(allowed, _)| *allowed)
    }

    fn remember(&self, key: Key, allowed: bool) {
        let mut ruled = self.ruled.lock().unwrap_or_else(PoisonError::into_inner);
        if ruled.len() >= RULINGS_KEPT {
            ruled.retain(|_, (_, at)| at.elapsed() < RULED_FOR);
        }
        ruled.insert(key, (allowed, Instant::now()));
    }

    fn rule(&self, call: &SocketCall<'_>) -> bool {
        let answer = self.rules.decide_socket(
            &self.module,
            &SocketAsk {
                proto: proto_of(call.proto),
                address: call.address,
                names: call.names,
            },
        );
        if call.using != SocketUse::Receive {
            let host = call
                .names
                .first()
                .cloned()
                .unwrap_or_else(|| call.address.ip().to_canonical().to_string());
            let filed = Filed {
                method: format!("{:?}", call.proto).to_ascii_uppercase(),
                host: &host,
                port: call.address.port(),
            };
            self.journal.record_flows(&self.module, vec![flow(&filed, &answer)]);
        }
        answer.is_ok()
    }
}

impl Sockets for ModuleSockets {
    fn allows(&self, call: &SocketCall<'_>) -> bool {
        let key = (call.proto, call.using, call.address, call.names.to_vec());
        if let Some(allowed) = self.remembered(&key) {
            return allowed;
        }
        let allowed = self.rule(call);
        self.remember(key, allowed);
        allowed
    }

    fn may_resolve(&self, name: &str) -> bool {
        let answer = self.rules.decide_lookup(&self.module, name);
        if answer.is_err() {
            let filed = Filed {
                method: LOOKUP_METHOD.to_string(),
                host: name,
                port: 0,
            };
            self.journal.record_flows(&self.module, vec![flow(&filed, &answer)]);
        }
        answer.is_ok()
    }
}

#[cfg(test)]
mod tests;

//! What the audited module asked for, kept as it asks.

use std::collections::{BTreeMap, BTreeSet};
use std::sync::Mutex;

use kroma_http::address::web_target;
use kroma_module_host::{NetworkAction, NetworkAnswer, NetworkAsk, NetworkFlow, NetworkPolicy};
use kroma_module_manifest::{Attempt, Permissions, Proto};
use kroma_module_supervisor::Asked;
use serde::Serialize;
use serde_json::Value;

const REFUSAL: &str = "an audit lets nothing out";

/// One connection the module tried to open, and whether its `net.connect`
/// covers it.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct Connection {
    pub purpose: String,
    pub host: String,
    pub port: u16,
    pub declared: bool,
}

/// The network policy an audit runs a module behind: every connection is
/// judged against the module's declaration, written down and refused.
pub struct Recorder {
    permissions: Option<Permissions>,
    settings: BTreeMap<String, Value>,
    connections: Mutex<BTreeSet<Connection>>,
    asked: Mutex<Vec<Asked>>,
}

impl Recorder {
    pub fn new(permissions: Option<Permissions>, settings: BTreeMap<String, Value>) -> Self {
        Self {
            permissions,
            settings,
            connections: Mutex::default(),
            asked: Mutex::default(),
        }
    }

    pub fn heard(&self, asked: Asked) {
        self.asked.lock().unwrap_or_else(|e| e.into_inner()).push(asked);
    }

    pub fn connections(&self) -> Vec<Connection> {
        let seen = self.connections.lock().unwrap_or_else(|e| e.into_inner());
        seen.iter().cloned().collect()
    }

    pub fn asked(&self) -> Vec<Asked> {
        self.asked.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    fn declares(&self, ask: &NetworkAsk) -> bool {
        let Some(permissions) = &self.permissions else {
            return false;
        };
        let scheme = if ask.https { "https" } else { "http" };
        let local = web_target(&format!("{scheme}://{}:{}", ask.host, ask.port))
            .is_some_and(|target| target.is_local());
        let named = |key: &str| self.settings.get(key).map(hosts_named).unwrap_or_default();
        permissions.allows_connect(
            &Attempt {
                purpose: &ask.purpose,
                host: &ask.host,
                host_is_local: local,
                port: ask.port,
                proto: Proto::Tcp,
            },
            &named,
        )
    }
}

fn hosts_named(value: &Value) -> Vec<String> {
    match value {
        Value::String(url) => web_target(url).map(|target| target.host).into_iter().collect(),
        Value::Array(urls) => urls.iter().flat_map(hosts_named).collect(),
        _ => Vec::new(),
    }
}

impl NetworkPolicy for Recorder {
    fn decide(&self, _caller: &str, ask: &NetworkAsk) -> NetworkAnswer {
        let connection = Connection {
            purpose: ask.purpose.clone(),
            host: ask.host.clone(),
            port: ask.port,
            declared: self.declares(ask),
        };
        self.connections
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(connection);
        NetworkAnswer {
            action: NetworkAction::Block,
            proxy: None,
            rule: Some("audit".to_string()),
            reason: Some(REFUSAL.to_string()),
            private_allowed: true,
        }
    }

    fn record_flows(&self, _caller: &str, _flows: Vec<NetworkFlow>) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    fn declaring(connect: &str) -> Option<Permissions> {
        serde_json::from_str(&format!(r#"{{ "net": {{ "connect": {connect} }} }}"#)).unwrap()
    }

    fn ask(purpose: &str, host: &str, port: u16) -> NetworkAsk {
        NetworkAsk {
            purpose: purpose.to_string(),
            method: "GET".to_string(),
            host: host.to_string(),
            port,
            https: port == 443,
            sealed: false,
        }
    }

    #[test]
    fn a_connection_is_refused_and_written_down_with_whether_it_was_declared() {
        let recorder = Recorder::new(
            declaring(r#"[{ "purpose": "metadata", "to": ["api.example.org"] }]"#),
            BTreeMap::new(),
        );

        let declared = recorder.decide("m", &ask("metadata", "api.example.org", 443));
        let undeclared = recorder.decide("m", &ask("telemetry", "stats.example.org", 443));

        assert_eq!(declared.action, NetworkAction::Block);
        assert_eq!(undeclared.action, NetworkAction::Block);
        assert_eq!(
            recorder.connections(),
            [
                Connection {
                    purpose: "metadata".into(),
                    host: "api.example.org".into(),
                    port: 443,
                    declared: true,
                },
                Connection {
                    purpose: "telemetry".into(),
                    host: "stats.example.org".into(),
                    port: 443,
                    declared: false,
                },
            ]
        );
    }

    #[test]
    fn the_same_connection_asked_twice_is_one_line() {
        let recorder = Recorder::new(None, BTreeMap::new());

        recorder.decide("m", &ask("metadata", "api.example.org", 443));
        recorder.decide("m", &ask("metadata", "api.example.org", 443));

        assert_eq!(recorder.connections().len(), 1);
    }

    #[test]
    fn a_module_that_declares_no_permissions_declares_no_connection() {
        let recorder = Recorder::new(None, BTreeMap::new());

        recorder.decide("m", &ask("metadata", "api.example.org", 443));

        assert!(!recorder.connections()[0].declared);
    }

    #[test]
    fn a_host_a_setting_names_is_declared_once_the_setting_names_it() {
        let permissions = declaring(r#"[{ "purpose": "indexer", "to": ["setting:indexerUrl"] }]"#);
        let unset = Recorder::new(permissions.clone(), BTreeMap::new());
        let set = Recorder::new(
            permissions,
            BTreeMap::from([(
                "indexerUrl".to_string(),
                Value::String("https://indexer.example.org/api".to_string()),
            )]),
        );

        unset.decide("m", &ask("indexer", "indexer.example.org", 443));
        set.decide("m", &ask("indexer", "indexer.example.org", 443));

        assert!(!unset.connections()[0].declared);
        assert!(set.connections()[0].declared);
    }
}

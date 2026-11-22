use kroma_egress::lan::{place_of, spreads, Place};
use kroma_module_manifest::{host_matches, Connect};
use kroma_module_supervisor::{SocketAsk, SocketRefused, SocketRules};

use super::{hosts_named, Connection, Recorder, REFUSAL};

fn refused() -> SocketRefused {
    SocketRefused {
        rule: Some("audit".to_string()),
        reason: REFUSAL.to_string(),
    }
}

impl Recorder {
    fn names(&self, to: &str, hosts: &[String]) -> bool {
        match to.strip_prefix("setting:") {
            Some(key) => {
                let named = self.settings.get(key).map(hosts_named).unwrap_or_default();
                hosts.iter().any(|host| named.iter().any(|n| n.eq_ignore_ascii_case(host)))
            }
            None => hosts.iter().any(|host| host_matches(to, host)),
        }
    }

    fn covering(&self, ask: &SocketAsk<'_>, hosts: &[String]) -> Option<&Connect> {
        let ip = ask.address.ip();
        let place = place_of(ip, &self.networks);
        let public = place == Place::Public && !spreads(ip, &self.networks);
        let port = ask.address.port();
        self.permissions.as_ref()?.net.connect.iter().find(|entry| {
            entry.proto.contains(&ask.proto)
                && (entry.ports.is_empty() || entry.ports.contains(&port))
                && entry.to.iter().any(|to| match to.as_str() {
                    "public" => public,
                    "lan" => place == Place::Lan,
                    _ => self.names(to, hosts),
                })
        })
    }

    fn naming(&self, name: &str) -> Option<&Connect> {
        let hosts = [name.to_string()];
        self.permissions.as_ref()?.net.connect.iter().find(|entry| {
            !entry.proto.is_empty()
                && entry.to.iter().any(|to| match to.as_str() {
                    "public" => true,
                    "lan" => false,
                    _ => self.names(to, &hosts),
                })
        })
    }

    fn write_down(&self, connection: Connection) {
        self.connections
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .insert(connection);
    }
}

impl SocketRules for Recorder {
    fn decide_socket(&self, _caller: &str, ask: &SocketAsk<'_>) -> Result<String, SocketRefused> {
        let mut hosts = vec![ask.address.ip().to_canonical().to_string()];
        hosts.extend(ask.names.iter().cloned());
        let entry = self.covering(ask, &hosts);
        self.write_down(Connection {
            purpose: entry.map(|entry| entry.purpose.clone()).unwrap_or_default(),
            host: hosts.last().cloned().unwrap_or_default(),
            port: ask.address.port(),
            declared: entry.is_some(),
        });
        Err(refused())
    }

    fn decide_lookup(&self, _caller: &str, name: &str) -> Result<String, SocketRefused> {
        let entry = self.naming(name);
        self.write_down(Connection {
            purpose: entry.map(|entry| entry.purpose.clone()).unwrap_or_default(),
            host: name.to_string(),
            port: 0,
            declared: entry.is_some(),
        });
        Err(refused())
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use kroma_module_manifest::{Permissions, Proto};

    use super::*;

    fn udp_to(address: &str) -> SocketAsk<'static> {
        SocketAsk {
            proto: Proto::Udp,
            address: address.parse().unwrap(),
            names: &[],
        }
    }

    fn home() -> Vec<kroma_egress::lan::LocalNetwork> {
        vec![kroma_egress::lan::LocalNetwork {
            address: "192.168.1.10".parse().unwrap(),
            prefix: 24,
        }]
    }

    fn declaring(connect: &str) -> Option<Permissions> {
        serde_json::from_str(&format!(r#"{{ "net": {{ "connect": {connect} }} }}"#)).unwrap()
    }

    #[test]
    fn a_datagram_is_refused_and_written_down_with_the_entry_that_declares_it() {
        let recorder = Recorder::new(
            declaring(r#"[{ "purpose": "discovery", "to": ["lan"], "ports": [7359], "proto": ["udp"] }]"#),
            BTreeMap::new(),
        )
        .on_networks(home());

        let declared = recorder.decide_socket("m", &udp_to("192.168.1.255:7359"));
        let undeclared = recorder.decide_socket("m", &udp_to("8.8.8.8:7359"));

        assert!(declared.is_err() && undeclared.is_err());
        assert_eq!(
            recorder.connections(),
            [
                Connection {
                    purpose: String::new(),
                    host: "8.8.8.8".into(),
                    port: 7359,
                    declared: false,
                },
                Connection {
                    purpose: "discovery".into(),
                    host: "192.168.1.255".into(),
                    port: 7359,
                    declared: true,
                },
            ]
        );
    }

    #[test]
    fn a_lookup_and_a_socket_to_a_host_a_setting_names_are_both_declared() {
        let recorder = Recorder::new(
            declaring(r#"[{ "purpose": "tracker", "to": ["setting:trackerUrl"], "proto": ["udp"] }]"#),
            BTreeMap::from([(
                "trackerUrl".to_string(),
                serde_json::Value::String("http://tracker.example.org:6969/announce".to_string()),
            )]),
        );
        let names = ["tracker.example.org".to_string()];

        let _ = recorder.decide_socket(
            "m",
            &SocketAsk {
                names: &names,
                ..udp_to("203.0.113.9:6969")
            },
        );
        let looked_up = recorder.decide_lookup("m", "tracker.example.org");

        assert!(looked_up.is_err());
        assert!(recorder.connections().iter().all(|connection| connection.declared));
        assert_eq!(recorder.connections().len(), 2);
    }

    #[test]
    fn a_lookup_no_raw_entry_names_is_written_down_as_undeclared() {
        let permissions: Option<Permissions> = serde_json::from_str(
            r#"{ "net": { "connect": [{ "purpose": "discovery", "to": ["lan"], "proto": ["udp"] }] } }"#,
        )
        .unwrap();
        let recorder = Recorder::new(permissions, BTreeMap::new());

        let _ = recorder.decide_lookup("m", "exfiltrate.example.net");

        assert!(!recorder.connections()[0].declared);
    }

    #[test]
    fn lan_in_an_audit_is_this_machines_networks_as_the_server_has_it() {
        let recorder = Recorder::new(
            declaring(r#"[{ "purpose": "discovery", "to": ["lan"], "proto": ["udp"] }]"#),
            BTreeMap::new(),
        )
        .on_networks(home());

        let _ = recorder.decide_socket("m", &udp_to("10.0.0.5:7359"));
        let _ = recorder.decide_socket("m", &udp_to("192.168.1.255:7359"));

        let declared: Vec<(String, bool)> = recorder
            .connections()
            .into_iter()
            .map(|connection| (connection.host, connection.declared))
            .collect();
        assert_eq!(
            declared,
            [("10.0.0.5".to_string(), false), ("192.168.1.255".to_string(), true)]
        );
    }

    #[test]
    fn a_host_pattern_declares_a_socket_to_an_address_its_name_resolved_to() {
        let recorder = Recorder::new(
            declaring(r#"[{ "purpose": "tracker", "to": ["*.example.org"], "proto": ["udp"] }]"#),
            BTreeMap::new(),
        )
        .on_networks(home());
        let names = ["t.example.org".to_string()];

        let _ = recorder.decide_socket("m", &SocketAsk { names: &names, ..udp_to("1.1.1.1:6969") });

        assert!(recorder.connections()[0].declared);
    }

    #[test]
    fn public_declares_a_public_address_and_a_lookup_of_any_name() {
        let recorder = Recorder::new(
            declaring(r#"[{ "purpose": "peers", "to": ["public"], "proto": ["udp"] }]"#),
            BTreeMap::new(),
        )
        .on_networks(home());

        let _ = recorder.decide_socket("m", &udp_to("8.8.8.8:6881"));
        let _ = recorder.decide_lookup("m", "peer.example.com");

        assert!(recorder.connections().iter().all(|connection| connection.declared));
    }
}

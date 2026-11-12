//! The policy as the module host callback asks it, for a module's calls.

use kroma_http::address::WebTarget;
use kroma_http::egress::Decision;
use kroma_module_host::{
    NetworkAction, NetworkAnswer, NetworkAsk, NetworkFlow, NetworkPolicy, NetworkRoute, NetworkSeal,
};

use kroma_module_manifest::Reach;

use super::flow::{FlowReport, FlowRoute};
use super::{Network, PERMISSION_NET_CONNECT};

impl NetworkPolicy for Network {
    fn decide(&self, caller: &str, ask: &NetworkAsk) -> NetworkAnswer {
        let target = WebTarget {
            https: ask.https,
            host: ask.host.clone(),
            port: ask.port,
        };
        let reach = match self.reach(caller, &ask.purpose, &target) {
            Ok(reach) => reach,
            Err(missing) => {
                return NetworkAnswer {
                    action: NetworkAction::Block,
                    proxy: None,
                    rule: Some(PERMISSION_NET_CONNECT.to_string()),
                    reason: Some(missing),
                    private_allowed: false,
                };
            }
        };
        let ruling = self.rule_on(caller, &ask.purpose, &target);
        let decision = match ruling.decision {
            Decision::Direct if ask.sealed && !target.is_local() => self.sealed_route(),
            decision => decision,
        };
        let (action, proxy, reason) = match decision {
            Decision::Direct => (NetworkAction::Direct, None, None),
            Decision::Proxy(proxy) => (NetworkAction::Vpn, Some(proxy), None),
            Decision::Block(reason) => (NetworkAction::Block, None, Some(reason)),
        };
        NetworkAnswer {
            action,
            proxy,
            rule: ruling.rule,
            reason,
            private_allowed: reach == Reach::Named,
        }
    }

    fn record_flows(&self, caller: &str, flows: Vec<NetworkFlow>) {
        for flow in flows {
            if flow.carried {
                self.journal.annotate(caller, &flow);
            } else {
                self.record(caller, flow.into());
            }
        }
    }

    fn seal(&self) -> NetworkSeal {
        Network::seal(self)
    }

    fn setting_port(&self, key: &str) -> Option<u16> {
        u16::try_from(self.settings.get_i64(key, 0)).ok()
    }
}

impl From<NetworkFlow> for FlowReport {
    fn from(flow: NetworkFlow) -> Self {
        let route = match flow.route {
            NetworkRoute::Direct => FlowRoute::Direct,
            NetworkRoute::Proxy => FlowRoute::Vpn,
            NetworkRoute::Blocked => FlowRoute::Blocked,
        };
        Self {
            purpose: flow.purpose,
            method: flow.method,
            host: flow.host,
            port: flow.port,
            route,
            status: flow.status,
            bytes_in: flow.bytes_in,
            bytes_out: flow.bytes_out,
            duration_ms: flow.duration_ms,
            error: flow.error,
            rule: flow.rule,
        }
    }
}

//! The policy as the module host callback asks it, for a module sidecar's calls.

use kroma_http::address::WebTarget;
use kroma_http::egress::Decision;
use kroma_module_host::{
    NetworkAction, NetworkAnswer, NetworkAsk, NetworkFlow, NetworkPolicy, NetworkRoute,
};

use super::flow::{FlowReport, FlowRoute};
use super::{Network, PERMISSION_NET_CONNECT};

impl NetworkPolicy for Network {
    fn decide(&self, caller: &str, ask: &NetworkAsk) -> NetworkAnswer {
        let target = WebTarget {
            https: ask.https,
            host: ask.host.clone(),
            port: ask.port,
        };
        if let Some(missing) = self.missing_permission(caller, &ask.purpose, &target) {
            return NetworkAnswer {
                action: NetworkAction::Block,
                proxy: None,
                rule: Some(PERMISSION_NET_CONNECT.to_string()),
                reason: Some(missing),
            };
        }
        let ruling = self.rule_on(caller, &ask.purpose, &target);
        let (action, proxy, reason) = match ruling.decision {
            Decision::Direct => (NetworkAction::Direct, None, None),
            Decision::Proxy(proxy) => (NetworkAction::Vpn, Some(proxy), None),
            Decision::Block(reason) => (NetworkAction::Block, None, Some(reason)),
        };
        NetworkAnswer {
            action,
            proxy,
            rule: ruling.rule,
            reason,
        }
    }

    fn record_flows(&self, caller: &str, flows: Vec<NetworkFlow>) {
        for flow in flows {
            self.record(caller, flow.into());
        }
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

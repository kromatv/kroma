//! Which way one outbound call goes: the fixed guards first, then the first
//! rule that matches, then the default.

use std::net::IpAddr;

use kroma_http::address::WebTarget;
use kroma_module_manifest::{host_matches, purpose_covers};

use super::rules::{address_range, Action, DefaultAction, NetworkRules, Rule};

pub const CORE: &str = "core";

pub const GUARD_LINK_LOCAL: &str = "guard:link-local";

pub const GUARD_LOOPBACK: &str = "guard:loopback";

/// The action for one call and the id of the rule or guard that chose it,
/// `None` for the default. No rule overrides a guard, and a rule naming a network
/// for a local host goes `direct` since a tunnel cannot reach it.
pub fn decide(
    rules: &NetworkRules,
    caller: &str,
    purpose: &str,
    target: &WebTarget,
    own_ports: &[u16],
) -> (Action, Option<String>) {
    if let Some(guard) = guard(caller, target, own_ports) {
        return (Action::Block, Some(guard.to_string()));
    }
    let Some(rule) = rules
        .rules
        .iter()
        .find(|rule| matches(rule, caller, purpose, target))
    else {
        let action = match rules.default_action {
            DefaultAction::Allow => Action::Direct,
            DefaultAction::Block => Action::Block,
        };
        return (action, None);
    };
    let action = match &rule.action {
        Action::Network(_) if target.is_local() => Action::Direct,
        action => action.clone(),
    };
    (action, Some(rule.id.clone()))
}

// A download client on this machine is a legitimate destination; this server's
// own ports are not, since a module reaches the core only through the host API.
fn guard(caller: &str, target: &WebTarget, own_ports: &[u16]) -> Option<&'static str> {
    if target.literal().map(unmapped).is_some_and(is_link_local) {
        return Some(GUARD_LINK_LOCAL);
    }
    if caller != CORE && is_this_machine(target) && own_ports.contains(&target.port) {
        return Some(GUARD_LOOPBACK);
    }
    None
}

// 0.0.0.0 and :: connect to this machine on Linux, so they count as loopback.
pub(super) fn is_this_machine(target: &WebTarget) -> bool {
    match target.literal().map(unmapped) {
        Some(ip) => ip.is_loopback() || ip.is_unspecified(),
        None => {
            let host = target.host.trim_end_matches('.').to_ascii_lowercase();
            host == "localhost" || host.ends_with(".localhost")
        }
    }
}

fn unmapped(ip: IpAddr) -> IpAddr {
    match ip {
        IpAddr::V6(v6) => v6.to_ipv4_mapped().map_or(ip, IpAddr::V4),
        IpAddr::V4(_) => ip,
    }
}

fn is_link_local(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_link_local(),
        IpAddr::V6(v6) => (v6.segments()[0] & 0xffc0) == 0xfe80,
    }
}

fn matches(rule: &Rule, caller: &str, purpose: &str, target: &WebTarget) -> bool {
    rule.caller.as_deref().is_none_or(|c| c == caller)
        && rule.purpose.as_deref().is_none_or(|p| purpose_covers(p, purpose))
        && rule
            .host
            .as_deref()
            .is_none_or(|pattern| host_matches(pattern, &target.host))
        && rule.port.is_none_or(|port| port == target.port)
        && rule
            .address
            .as_deref()
            .is_none_or(|range| target.literal().is_some_and(|ip| in_range(ip, range)))
}

fn in_range(ip: IpAddr, range: &str) -> bool {
    let Some((network, bits)) = address_range(range) else {
        return false;
    };
    match (unmapped(ip), network) {
        (IpAddr::V4(ip), IpAddr::V4(network)) => prefix_matches(
            u128::from(u32::from(ip)),
            u128::from(u32::from(network)),
            32,
            bits,
        ),
        (IpAddr::V6(ip), IpAddr::V6(network)) => {
            prefix_matches(u128::from(ip), u128::from(network), 128, bits)
        }
        _ => false,
    }
}

fn prefix_matches(ip: u128, network: u128, width: u32, bits: u32) -> bool {
    let unmasked = width - bits;
    bits == 0 || ip >> unmasked == network >> unmasked
}

#[cfg(test)]
mod tests;

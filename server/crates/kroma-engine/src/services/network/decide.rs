//! Which way one outbound call goes: the fixed guards first, then the first
//! rule that matches, then the default.

use std::net::IpAddr;

use kroma_http::address::WebTarget;

use super::rules::{Action, DefaultAction, NetworkRules, Rule};

/// The caller name the core's own calls carry.
pub const CORE: &str = "core";

/// The rule id a refusal by the link-local guard carries.
pub const GUARD_LINK_LOCAL: &str = "guard:link-local";

/// The rule id a refusal by the loopback guard carries.
pub const GUARD_LOOPBACK: &str = "guard:loopback";

/// The action for one call, and the id of the rule (or guard) that chose it;
/// `None` when the default did. A guard cannot be overridden by any rule. A
/// `vpn` rule for a host on the local network resolves to `direct`, since the
/// tunnel cannot reach it.
pub fn decide(
    rules: &NetworkRules,
    caller: &str,
    purpose: &str,
    target: &WebTarget,
) -> (Action, Option<String>) {
    if let Some(guard) = guard(caller, target) {
        return (Action::Block, Some(guard.to_string()));
    }
    let host = target.host.trim_end_matches('.').to_ascii_lowercase();
    let Some(rule) = rules
        .rules
        .iter()
        .find(|rule| matches(rule, caller, purpose, &host))
    else {
        let action = match rules.default_action {
            DefaultAction::Allow => Action::Direct,
            DefaultAction::Block => Action::Block,
        };
        return (action, None);
    };
    let action = match rule.action {
        Action::Vpn if target.is_local() => Action::Direct,
        action => action,
    };
    (action, Some(rule.id.clone()))
}

fn guard(caller: &str, target: &WebTarget) -> Option<&'static str> {
    let ip = target.literal().map(unmapped)?;
    if is_link_local(ip) {
        return Some(GUARD_LINK_LOCAL);
    }
    // 0.0.0.0 and :: connect to this machine on Linux, so they count as loopback.
    if caller != CORE && (ip.is_loopback() || ip.is_unspecified()) {
        return Some(GUARD_LOOPBACK);
    }
    None
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

fn matches(rule: &Rule, caller: &str, purpose: &str, host: &str) -> bool {
    rule.caller.as_deref().is_none_or(|c| c == caller)
        && rule.purpose.as_deref().is_none_or(|p| p == purpose)
        && rule
            .host
            .as_deref()
            .is_none_or(|pattern| host_matches(pattern, host))
}

fn host_matches(pattern: &str, host: &str) -> bool {
    match pattern.strip_prefix("*.") {
        Some(suffix) => host
            .strip_suffix(suffix)
            .is_some_and(|label| label.len() > 1 && label.ends_with('.')),
        None => pattern == host,
    }
}

#[cfg(test)]
mod tests;

//! A module's `net.connect` declaration, checked before its call is ruled on.

use std::sync::Arc;

use kroma_http::address::{web_target, WebTarget};
use kroma_module_manifest::{Attempt, Permissions, Proto};
use serde_json::Value;

use super::Network;

/// The `permissions` block a module declares, by module id. `None` for a module
/// that declares none, whose calls are ruled as they were before the block.
pub type DeclaredPermissions = Arc<dyn Fn(&str) -> Option<Permissions> + Send + Sync>;

pub const PERMISSION_NET_CONNECT: &str = "permission:net.connect";

impl Network {
    pub(super) fn missing_permission(
        &self,
        caller: &str,
        purpose: &str,
        target: &WebTarget,
    ) -> Option<String> {
        let declared = (self.declared)(caller)?;
        let attempt = Attempt {
            purpose,
            host: &target.host,
            host_is_local: target.is_local(),
            port: target.port,
            proto: Proto::Tcp,
        };
        let named = |key: &str| hosts_named(&self.settings.get(key));
        if declared.allows_connect(&attempt, &named) {
            return None;
        }
        Some(format!(
            "net.connect: {}:{} for purpose \"{purpose}\" is not declared",
            target.host, target.port
        ))
    }
}

fn hosts_named(value: &Value) -> Vec<String> {
    match value {
        Value::String(url) => web_target(url)
            .map(|target| target.host)
            .into_iter()
            .collect(),
        Value::Array(urls) => urls.iter().flat_map(hosts_named).collect(),
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests;

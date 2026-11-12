//! A module's `net.connect` declaration, checked before its call is ruled on.

use std::sync::Arc;

use kroma_http::address::{web_target, WebTarget};
use kroma_module_manifest::{Attempt, Listen, Permissions, Proto, Reach};
use serde_json::Value;

use super::Network;

/// The `permissions` block a module declares, by module id. `None` for a module
/// that declares none, whose calls are ruled as they were before the block.
pub type DeclaredPermissions = Arc<dyn Fn(&str) -> Option<Permissions> + Send + Sync>;

/// Every `net.listen` entry the enabled modules declare. No module may reach
/// those ports on this machine: the program behind them answers the core alone.
pub type DeclaredListeners = Arc<dyn Fn() -> Vec<Listen> + Send + Sync>;

pub const PERMISSION_NET_CONNECT: &str = "permission:net.connect";

impl Network {
    /// How far `caller` may reach for `purpose` at `target`, or the refusal that
    /// names what it did not declare. A module with no block reaches as it did
    /// before the block existed.
    pub(super) fn reach(
        &self,
        caller: &str,
        purpose: &str,
        target: &WebTarget,
    ) -> Result<Reach, String> {
        let Some(declared) = (self.declared)(caller) else {
            return Ok(Reach::Named);
        };
        let attempt = Attempt {
            purpose,
            host: &target.host,
            host_is_local: target.is_local(),
            port: target.port,
            proto: Proto::Tcp,
        };
        let named = |key: &str| hosts_named(&self.settings.get(key));
        declared.connect_reach(&attempt, &named).ok_or_else(|| {
            format!(
                "net.connect: {}:{} for purpose \"{purpose}\" is not declared",
                target.host, target.port
            )
        })
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

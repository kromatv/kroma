//! The core's network policy, as the module host callback reaches it.

use std::sync::Arc;

use kroma_module_wire::{NetworkAnswer, NetworkAsk, NetworkFlow};

/// Rules a module's outbound call and files the flows a module reports.
/// `caller` is always the module the callback's token names, never what the
/// module claims. Both may block, so the callback runs them off the runtime.
pub trait NetworkPolicy: Send + Sync {
    fn decide(&self, caller: &str, ask: &NetworkAsk) -> NetworkAnswer;
    fn record_flows(&self, caller: &str, flows: Vec<NetworkFlow>);
}

/// The policy the supervisor hands each module's network callback to. It
/// carries the policy and decides nothing itself.
#[derive(Clone)]
pub struct NetworkPolicyOf(pub Arc<dyn NetworkPolicy>);

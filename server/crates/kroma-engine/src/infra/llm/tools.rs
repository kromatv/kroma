//! Vendor-neutral function-calling types for the agentic loop. The wire differences
//! between OpenAI-style `tool_calls` and Anthropic `tool_use` blocks are hidden
//! behind the `Provider` trait (`http.rs`).

use anyhow::Result;
use serde_json::Value;

/// A tool the model may call. `schema` must be a JSON Schema **object** describing
/// the arguments (`{"type":"object","properties":{…},"required":[…]}`).
#[derive(Clone)]
pub struct ToolDef {
    pub name: String,
    pub description: String,
    pub schema: Value,
}

/// One tool invocation the model requested. `id` is the vendor's call id and must
/// be echoed back with the result so the model can match them.
#[derive(Clone, Debug)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub args: Value,
}

/// A set of callable tools plus a dispatcher; one implementor = one connector.
/// `call` returns a string (typically JSON) fed back to the model verbatim.
pub trait ToolBox: Send + Sync {
    fn defs(&self) -> Vec<ToolDef>;
    fn call(&self, name: &str, args: &Value) -> Result<String>;
}

/// One assistant turn parsed from a provider response. `assistant_msg` keeps the
/// vendor shape verbatim (Anthropic thinking blocks, OpenAI `tool_calls`) because
/// it is echoed back into the next request.
pub struct Turn {
    pub text: Option<String>,
    pub tool_calls: Vec<ToolCall>,
    pub assistant_msg: Value,
}

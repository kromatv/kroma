mod anthropic;
mod openai;
mod openrouter;

#[cfg(test)]
pub(super) mod test_support;

use anyhow::{bail, Result};
use serde_json::{json, Value};

use super::super::tools::{ToolCall, ToolDef, Turn};
use super::ask::{Ask, ToolChoice};

use anthropic::Anthropic;
use openai::OpenAi;

// A chat-completion wire protocol. Implement this + add a line to
// [`provider_for`] to support a new vendor nothing else changes.
pub(super) trait Provider: Send + Sync {
    fn id(&self) -> &'static str;
    // `None` means a base URL is required (the OpenAI-compatible case has no
    // single default host).
    fn default_base(&self) -> Option<&'static str>;
    fn chat_url(&self, base: &str) -> String;
    fn models_url(&self, base: &str) -> String;
    fn headers(&self, api_key: &str) -> Vec<(&'static str, String)>;
    fn chat_body(&self, ask: &Ask<'_>, user: &str) -> Value;
    fn parse_reply(&self, v: &Value) -> Result<String>;
    fn controls_reasoning(&self) -> bool {
        false
    }

    fn supports_tools(&self) -> bool {
        false
    }
    // Build a tool-enabled chat request from a running `messages` array;
    // `system` is applied by the provider as it sees fit.
    fn tools_request(
        &self,
        ask: &Ask<'_>,
        messages: &[Value],
        tools: &[ToolDef],
        choice: ToolChoice,
    ) -> Value {
        let _ = (ask, messages, tools, choice);
        Value::Null
    }
    fn parse_turn(&self, v: &Value) -> Result<Turn> {
        let _ = v;
        bail!("provider does not support tool calling")
    }
    // OpenAI returns one `{role:tool}` message per call; Anthropic returns a
    // single `{role:user}` message holding all `tool_result` blocks.
    fn tool_result_messages(&self, results: &[(ToolCall, String)]) -> Vec<Value> {
        let _ = results;
        Vec::new()
    }
}

fn openai_tool(t: &ToolDef) -> Value {
    json!({
        "type": "function",
        "function": { "name": t.name, "description": t.description, "parameters": t.schema },
    })
}

fn anthropic_tool(t: &ToolDef) -> Value {
    json!({ "name": t.name, "description": t.description, "input_schema": t.schema })
}

// Unknown ids fall back to the lenient OpenAI-compatible default.
pub(super) fn provider_for(name: &str) -> Box<dyn Provider> {
    match name.trim().to_ascii_lowercase().as_str() {
        "anthropic" | "claude" => Box::new(Anthropic),
        "openrouter" => Box::new(OpenAi::openrouter()),
        _ => Box::new(OpenAi::openai()),
    }
}

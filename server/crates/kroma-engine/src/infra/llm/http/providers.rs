mod anthropic;
mod openai;

#[cfg(test)]
mod test_support;

use anyhow::{bail, Result};
use serde_json::{json, Value};

use super::super::tools::{ToolCall, ToolDef, Turn};

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
    fn chat_body(
        &self,
        model: &str,
        system: &str,
        user: &str,
        max_tokens: u32,
        temperature: f32,
        reasoning: bool,
    ) -> Value;
    fn parse_reply(&self, v: &Value) -> Result<String>;
    // Whether a reasoning-off retry is worth attempting when a model rejects the flag.
    fn reasoning_applies(&self) -> bool {
        false
    }

    fn supports_tools(&self) -> bool {
        false
    }
    // Build a tool-enabled chat request from a running `messages` array;
    // `system` is applied by the provider as it sees fit. Mirrors the vendor
    // request shape, hence the arg count.
    #[allow(clippy::too_many_arguments)]
    fn tools_request(
        &self,
        model: &str,
        system: &str,
        messages: &[Value],
        tools: &[ToolDef],
        max_tokens: u32,
        temperature: f32,
        reasoning: bool,
    ) -> Value {
        let _ = (
            model,
            system,
            messages,
            tools,
            max_tokens,
            temperature,
            reasoning,
        );
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

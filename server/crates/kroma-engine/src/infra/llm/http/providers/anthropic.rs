use anyhow::{anyhow, bail, Result};
use serde_json::{json, Value};

use super::super::super::tools::{ToolCall, ToolDef, Turn};
use super::{anthropic_tool, Provider};

const ANTHROPIC_VERSION: &str = "2023-06-01";

pub(super) struct Anthropic;

impl Provider for Anthropic {
    fn id(&self) -> &'static str {
        "anthropic"
    }
    fn default_base(&self) -> Option<&'static str> {
        Some("https://api.anthropic.com")
    }
    fn chat_url(&self, base: &str) -> String {
        format!("{base}/v1/messages")
    }
    fn models_url(&self, base: &str) -> String {
        format!("{base}/v1/models")
    }
    fn headers(&self, api_key: &str) -> Vec<(&'static str, String)> {
        vec![
            ("content-type", "application/json".to_string()),
            ("x-api-key", api_key.to_string()),
            ("anthropic-version", ANTHROPIC_VERSION.to_string()),
        ]
    }
    fn chat_body(
        &self,
        model: &str,
        system: &str,
        user: &str,
        max_tokens: u32,
        _temperature: f32,
        reasoning: bool,
    ) -> Value {
        // `system` is top-level; temperature is omitted (modern Claude rejects it).
        let mut body = json!({
            "model": model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        });
        if reasoning {
            body["thinking"] = json!({ "type": "adaptive" });
        }
        body
    }
    fn parse_reply(&self, v: &Value) -> Result<String> {
        // Safety classifiers can decline with a 200 + stop_reason "refusal".
        if v.get("stop_reason").and_then(Value::as_str) == Some("refusal") {
            bail!("Anthropic declined the request (stop_reason=refusal)");
        }
        v.get("content")
            .and_then(Value::as_array)
            .and_then(|blocks| {
                blocks
                    .iter()
                    .find(|b| b.get("type").and_then(Value::as_str) == Some("text"))
                    .and_then(|b| b.get("text").and_then(Value::as_str))
            })
            .map(str::to_string)
            .ok_or_else(|| anyhow!("Anthropic response had no text block"))
    }
    fn reasoning_applies(&self) -> bool {
        true
    }
    fn supports_tools(&self) -> bool {
        true
    }
    fn tools_request(
        &self,
        model: &str,
        system: &str,
        messages: &[Value],
        tools: &[ToolDef],
        max_tokens: u32,
        _temperature: f32,
        reasoning: bool,
    ) -> Value {
        let mut body = json!({
            "model": model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": messages,
            "tools": tools.iter().map(anthropic_tool).collect::<Vec<_>>(),
        });
        if reasoning {
            body["thinking"] = json!({ "type": "adaptive" });
        }
        body
    }
    fn parse_turn(&self, v: &Value) -> Result<Turn> {
        if v.get("stop_reason").and_then(Value::as_str) == Some("refusal") {
            bail!("Anthropic declined the request (stop_reason=refusal)");
        }
        // Echo the assistant content array back verbatim (preserves thinking
        // blocks + their signatures, which the API requires on the next turn).
        let content = v
            .get("content")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let mut text = None;
        let mut calls = Vec::new();
        for block in &content {
            match block.get("type").and_then(Value::as_str) {
                Some("text") if text.is_none() => {
                    text = block
                        .get("text")
                        .and_then(Value::as_str)
                        .map(str::to_string);
                }
                Some("tool_use") => {
                    let id = block
                        .get("id")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string();
                    let name = block
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string();
                    let args = block.get("input").cloned().unwrap_or_else(|| json!({}));
                    calls.push(ToolCall { id, name, args });
                }
                _ => {}
            }
        }
        Ok(Turn {
            text,
            tool_calls: calls,
            assistant_msg: json!({ "role": "assistant", "content": content }),
        })
    }
    fn tool_result_messages(&self, results: &[(ToolCall, String)]) -> Vec<Value> {
        let blocks: Vec<Value> = results
            .iter()
            .map(|(call, out)| json!({ "type": "tool_result", "tool_use_id": call.id, "content": out }))
            .collect();
        vec![json!({ "role": "user", "content": blocks })]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infra::llm::http::providers::test_support::defs;

    #[test]
    fn anthropic_tool_use_round_trip() {
        let body = Anthropic.tools_request(
            "m",
            "SYS",
            &[json!({ "role": "user", "content": "hi" })],
            &defs(),
            100,
            0.0,
            false,
        );
        assert_eq!(body["system"], "SYS");
        assert_eq!(body["tools"][0]["name"], "find_titles");
        assert!(body["tools"][0]["input_schema"]["properties"]["genre"].is_object());
        assert!(body.get("thinking").is_none());

        let resp = json!({ "stop_reason": "tool_use", "content": [
            { "type": "text", "text": "let me look" },
            { "type": "tool_use", "id": "toolu_1", "name": "find_titles", "input": { "genre": "Horror" } },
        ] });
        let turn = Anthropic.parse_turn(&resp).unwrap();
        assert_eq!(turn.text.as_deref(), Some("let me look"));
        assert_eq!(turn.tool_calls.len(), 1);
        assert_eq!(turn.tool_calls[0].id, "toolu_1");
        assert_eq!(turn.tool_calls[0].args["genre"], "Horror");
        // Echoed assistant content preserves all blocks (text + tool_use).
        assert_eq!(turn.assistant_msg["role"], "assistant");
        assert_eq!(turn.assistant_msg["content"][1]["type"], "tool_use");

        let results = vec![(turn.tool_calls[0].clone(), "ok".to_string())];
        let msgs = Anthropic.tool_result_messages(&results);
        assert_eq!(msgs.len(), 1); // one user turn holding all tool_result blocks
        assert_eq!(msgs[0]["role"], "user");
        assert_eq!(msgs[0]["content"][0]["type"], "tool_result");
        assert_eq!(msgs[0]["content"][0]["tool_use_id"], "toolu_1");
    }

    #[test]
    fn anthropic_refusal_errors_and_reasoning_adds_thinking() {
        assert!(Anthropic
            .parse_turn(&json!({ "stop_reason": "refusal", "content": [] }))
            .is_err());
        let body = Anthropic.tools_request("m", "s", &[], &defs(), 10, 0.0, true);
        assert_eq!(body["thinking"]["type"], "adaptive");
    }
}

use anyhow::{anyhow, bail, Result};
use serde_json::{json, Value};

use super::super::super::tools::{ToolCall, ToolDef, Turn};
use super::super::ask::{Ask, Reasoning, ToolChoice};
use super::super::cut_short::CutShort;
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
            ("x-api-key", api_key.to_string()),
            ("anthropic-version", ANTHROPIC_VERSION.to_string()),
        ]
    }
    fn chat_body(&self, ask: &Ask<'_>, user: &str) -> Value {
        // `system` is top-level; temperature is omitted (modern Claude rejects it).
        let mut body = json!({
            "model": ask.model,
            "system": ask.system,
            "messages": [{"role": "user", "content": user}],
        });
        set_budget(&mut body, ask);
        body
    }
    fn parse_reply(&self, v: &Value) -> Result<String> {
        // Safety classifiers can decline with a 200 + stop_reason "refusal".
        if v.get("stop_reason").and_then(Value::as_str) == Some("refusal") {
            bail!("Anthropic declined the request (stop_reason=refusal)");
        }
        let text = v
            .get("content")
            .and_then(Value::as_array)
            .and_then(|blocks| {
                blocks
                    .iter()
                    .find(|b| b.get("type").and_then(Value::as_str) == Some("text"))
                    .and_then(|b| b.get("text").and_then(Value::as_str))
            });
        match (text, CutShort::anthropic(v)) {
            (Some(text), _) => Ok(text.to_string()),
            (None, Some(cut)) => Err(cut.into()),
            (None, None) => Err(anyhow!("Anthropic response had no text block")),
        }
    }
    fn controls_reasoning(&self) -> bool {
        true
    }
    fn supports_tools(&self) -> bool {
        true
    }
    fn tools_request(
        &self,
        ask: &Ask<'_>,
        messages: &[Value],
        tools: &[ToolDef],
        choice: ToolChoice,
    ) -> Value {
        let mut body = json!({
            "model": ask.model,
            "system": ask.system,
            "messages": messages,
            "tools": tools.iter().map(anthropic_tool).collect::<Vec<_>>(),
        });
        if choice == ToolChoice::None {
            body["tool_choice"] = json!({ "type": "none" });
        }
        set_budget(&mut body, ask);
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
        if text.is_none() && calls.is_empty() {
            if let Some(cut) = CutShort::anthropic(v) {
                return Err(cut.into());
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

fn set_budget(body: &mut Value, ask: &Ask<'_>) {
    match ask.reasoning {
        Reasoning::Off => body["max_tokens"] = json!(ask.answer_tokens),
        Reasoning::On => {
            body["max_tokens"] = json!(ask.tokens_with_reasoning());
            body["thinking"] = json!({ "type": "adaptive" });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infra::llm::http::providers::test_support::{ask, defs};

    #[test]
    fn anthropic_tool_use_round_trip() {
        let body = Anthropic.tools_request(
            &ask(Reasoning::Off, 100),
            &[json!({ "role": "user", "content": "hi" })],
            &defs(),
            ToolChoice::Auto,
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
    fn anthropic_refusal_errors() {
        assert!(Anthropic
            .parse_turn(&json!({ "stop_reason": "refusal", "content": [] }))
            .is_err());
    }

    #[test]
    fn reasoning_on_asks_for_adaptive_thinking_with_room_left_for_the_answer() {
        let body = Anthropic.chat_body(&ask(Reasoning::On, 900), "hi");

        assert_eq!(body["thinking"], json!({ "type": "adaptive" }));
        assert_eq!(body["max_tokens"], 1924);
    }

    #[test]
    fn reasoning_off_leaves_thinking_to_the_model_and_the_budget_to_the_answer() {
        let body =
            Anthropic.tools_request(&ask(Reasoning::Off, 900), &[], &defs(), ToolChoice::Auto);

        assert!(body.get("thinking").is_none());
        assert_eq!(body["max_tokens"], 900);
    }

    #[test]
    fn a_closing_turn_tells_claude_not_to_call_a_tool() {
        let body =
            Anthropic.tools_request(&ask(Reasoning::On, 900), &[], &defs(), ToolChoice::None);

        assert_eq!(body["tool_choice"], json!({ "type": "none" }));
    }

    #[test]
    fn a_reply_that_thought_until_its_budget_ran_out_fails_saying_so() {
        let resp = json!({
            "stop_reason": "max_tokens",
            "content": [{ "type": "thinking", "thinking": "", "signature": "s" }],
            "usage": { "output_tokens": 1924 },
        });

        let reply = Anthropic.parse_reply(&resp).unwrap_err();
        let turn = Anthropic.parse_turn(&resp).err().unwrap();

        assert!(reply.downcast_ref::<CutShort>().is_some());
        assert!(turn.downcast_ref::<CutShort>().is_some());
    }
}

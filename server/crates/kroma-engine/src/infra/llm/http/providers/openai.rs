use anyhow::{anyhow, Result};
use serde_json::{json, Value};

use super::super::super::tools::{ToolCall, ToolDef, Turn};
use super::{openai_tool, Provider};

// The OpenAI chat-completions wire protocol also serves every compatible
// server (Ollama, llama.cpp, LM Studio, vLLM) and OpenRouter, which is the
// same wire format save for its default base URL and an optional `X-Title`
// ranking header - hence config of this one `impl` rather than a near-duplicate.
pub(super) struct OpenAi {
    id: &'static str,
    default_base: Option<&'static str>,
    extra_header: Option<(&'static str, &'static str)>,
}

// `openai()` deliberately mirrors the variant name alongside `openrouter()`.
#[allow(clippy::self_named_constructors)]
impl OpenAi {
    pub(super) const fn openai() -> Self {
        Self {
            id: "openai",
            default_base: None,
            extra_header: None,
        }
    }
    // OpenRouter (<https://openrouter.ai>): identifies KROMA on its usage
    // dashboard via `X-Title`.
    pub(super) const fn openrouter() -> Self {
        Self {
            id: "openrouter",
            default_base: Some("https://openrouter.ai/api/v1"),
            extra_header: Some(("x-title", "KROMA")),
        }
    }
}

impl Provider for OpenAi {
    fn id(&self) -> &'static str {
        self.id
    }
    fn default_base(&self) -> Option<&'static str> {
        self.default_base
    }
    fn chat_url(&self, base: &str) -> String {
        format!("{base}/chat/completions")
    }
    fn models_url(&self, base: &str) -> String {
        format!("{base}/models")
    }
    fn headers(&self, api_key: &str) -> Vec<(&'static str, String)> {
        let mut h = vec![("content-type", "application/json".to_string())];
        if !api_key.is_empty() {
            h.push(("authorization", format!("Bearer {api_key}")));
        }
        if let Some((k, v)) = self.extra_header {
            h.push((k, v.to_string()));
        }
        h
    }
    fn chat_body(
        &self,
        model: &str,
        system: &str,
        user: &str,
        max_tokens: u32,
        temperature: f32,
        _reasoning: bool,
    ) -> Value {
        json!({
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": false,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        })
    }
    fn parse_reply(&self, v: &Value) -> Result<String> {
        v.pointer("/choices/0/message/content")
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| anyhow!("OpenAI response missing choices[0].message.content"))
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
        temperature: f32,
        _reasoning: bool,
    ) -> Value {
        // System is a leading message; the running turns follow.
        let mut msgs = Vec::with_capacity(messages.len() + 1);
        msgs.push(json!({ "role": "system", "content": system }));
        msgs.extend(messages.iter().cloned());
        json!({
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": false,
            "messages": msgs,
            "tools": tools.iter().map(openai_tool).collect::<Vec<_>>(),
        })
    }
    fn parse_turn(&self, v: &Value) -> Result<Turn> {
        let msg = v
            .pointer("/choices/0/message")
            .ok_or_else(|| anyhow!("OpenAI response missing choices[0].message"))?;
        let text = msg
            .get("content")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let mut calls = Vec::new();
        if let Some(tcs) = msg.get("tool_calls").and_then(Value::as_array) {
            for tc in tcs {
                let id = tc
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let f = tc
                    .get("function")
                    .ok_or_else(|| anyhow!("OpenAI tool_call missing function"))?;
                let name = f
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                // Spec says `arguments` is a JSON-encoded string, but several
                // OpenAI-compatible servers (Ollama, llama.cpp, LM Studio) hand
                // back an object instead accept both; empty/garbage → `{}`.
                let args = match f.get("arguments") {
                    Some(Value::String(s)) if !s.trim().is_empty() => {
                        serde_json::from_str(s).unwrap_or_else(|_| json!({}))
                    }
                    Some(obj @ Value::Object(_)) => obj.clone(),
                    _ => json!({}),
                };
                calls.push(ToolCall { id, name, args });
            }
        }
        Ok(Turn {
            text,
            tool_calls: calls,
            assistant_msg: msg.clone(),
        })
    }
    fn tool_result_messages(&self, results: &[(ToolCall, String)]) -> Vec<Value> {
        results
            .iter()
            .map(|(call, out)| json!({ "role": "tool", "tool_call_id": call.id, "content": out }))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infra::llm::http::providers::test_support::{defs, EchoBox};
    use crate::infra::llm::tools::ToolBox;

    #[test]
    fn openai_request_prepends_system_and_maps_tools() {
        let messages = vec![json!({ "role": "user", "content": "hi" })];
        let body = OpenAi::openai().tools_request("m", "SYS", &messages, &defs(), 100, 0.5, false);
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["messages"][0]["content"], "SYS");
        assert_eq!(body["messages"][1]["content"], "hi");
        assert_eq!(body["tools"][0]["type"], "function");
        assert_eq!(body["tools"][0]["function"]["name"], "find_titles");
        assert!(body["tools"][0]["function"]["parameters"]["properties"]["genre"].is_object());
    }

    #[test]
    fn openai_parse_turn_reads_tool_calls_then_results() {
        let resp = json!({ "choices": [{ "message": {
            "role": "assistant", "content": null,
            "tool_calls": [{ "id": "call_1", "type": "function",
                "function": { "name": "find_titles", "arguments": "{\"genre\":\"Horror\"}" } }],
        } }] });
        let turn = OpenAi::openai().parse_turn(&resp).unwrap();
        assert!(turn.text.is_none());
        assert_eq!(turn.tool_calls.len(), 1);
        assert_eq!(turn.tool_calls[0].id, "call_1");
        assert_eq!(turn.tool_calls[0].name, "find_titles");
        assert_eq!(turn.tool_calls[0].args["genre"], "Horror");
        // The raw assistant message is echoed back as the next turn's history.
        assert_eq!(turn.assistant_msg["tool_calls"][0]["id"], "call_1");

        let results = vec![(turn.tool_calls[0].clone(), "ok".to_string())];
        let msgs = OpenAi::openai().tool_result_messages(&results);
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0]["role"], "tool");
        assert_eq!(msgs[0]["tool_call_id"], "call_1");
        assert_eq!(msgs[0]["content"], "ok");
    }

    #[test]
    fn openai_parse_turn_accepts_object_form_arguments() {
        // Ollama / llama.cpp / LM Studio hand back `arguments` as an object, not
        // a JSON string must still parse, not silently drop the args.
        let resp = json!({ "choices": [{ "message": {
            "role": "assistant",
            "tool_calls": [{ "id": "c1", "type": "function",
                "function": { "name": "find_titles", "arguments": { "genre": "Horror" } } }],
        } }] });
        let turn = OpenAi::openai().parse_turn(&resp).unwrap();
        assert_eq!(turn.tool_calls.len(), 1);
        assert_eq!(turn.tool_calls[0].args["genre"], "Horror");
    }

    #[test]
    fn openai_parse_turn_final_text_stops_loop() {
        let resp =
            json!({ "choices": [{ "message": { "role": "assistant", "content": "done" } }] });
        let turn = OpenAi::openai().parse_turn(&resp).unwrap();
        assert!(turn.tool_calls.is_empty());
        assert_eq!(turn.text.as_deref(), Some("done"));
    }

    // Simulates the inner round-trip `run_tools_loop` performs, minus the HTTP call.
    #[test]
    fn simulated_round_trip_dispatches_through_toolbox() {
        let tb = EchoBox;
        let resp = json!({ "choices": [{ "message": { "role": "assistant",
            "tool_calls": [{ "id": "c1", "function": { "name": "find_titles", "arguments": "{\"genre\":\"Horror\"}" } }],
        } }] });
        let turn = OpenAi::openai().parse_turn(&resp).unwrap();
        let mut results = Vec::new();
        for call in turn.tool_calls {
            let out = tb.call(&call.name, &call.args).unwrap();
            results.push((call, out));
        }
        let msgs = OpenAi::openai().tool_result_messages(&results);
        let content = msgs[0]["content"].as_str().unwrap();
        assert!(content.contains("\"echo\":\"find_titles\""));
        assert!(content.contains("Horror"));
    }
}

use anyhow::{anyhow, Result};
use serde_json::{json, Value};

use super::super::super::tools::{ToolCall, ToolDef, Turn};
use super::super::ask::{Ask, ToolChoice};
use super::super::cut_short::CutShort;
use super::{openai_tool, openrouter, Provider};

// The OpenAI chat-completions wire protocol also serves every compatible
// server (Ollama, llama.cpp, LM Studio, vLLM) and OpenRouter, which is the
// same wire format save for its default base URL, an optional `X-Title`
// ranking header and its reasoning control - hence config of this one `impl`
// rather than a near-duplicate.
pub(super) struct OpenAi {
    id: &'static str,
    default_base: Option<&'static str>,
    extra_header: Option<(&'static str, &'static str)>,
    reasoning: ReasoningControl,
}

#[derive(PartialEq, Eq)]
enum ReasoningControl {
    Unsent,
    OpenRouter,
}

// `openai()` deliberately mirrors the variant name alongside `openrouter()`.
#[allow(clippy::self_named_constructors)]
impl OpenAi {
    pub(super) const fn openai() -> Self {
        Self {
            id: "openai",
            default_base: None,
            extra_header: None,
            reasoning: ReasoningControl::Unsent,
        }
    }
    // OpenRouter (<https://openrouter.ai>): identifies KROMA on its usage
    // dashboard via `X-Title`.
    pub(super) const fn openrouter() -> Self {
        Self {
            id: "openrouter",
            default_base: Some("https://openrouter.ai/api/v1"),
            extra_header: Some(("x-title", "KROMA")),
            reasoning: ReasoningControl::OpenRouter,
        }
    }

    fn set_budget(&self, body: &mut Value, ask: &Ask<'_>) {
        match self.reasoning {
            ReasoningControl::Unsent => body["max_tokens"] = json!(ask.answer_tokens),
            ReasoningControl::OpenRouter => openrouter::set_budget(body, ask),
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
        let mut h = Vec::new();
        if !api_key.is_empty() {
            h.push(("authorization", format!("Bearer {api_key}")));
        }
        if let Some((k, v)) = self.extra_header {
            h.push((k, v.to_string()));
        }
        h
    }
    fn chat_body(&self, ask: &Ask<'_>, user: &str) -> Value {
        let mut body = json!({
            "model": ask.model,
            "temperature": ask.temperature,
            "stream": false,
            "messages": [
                {"role": "system", "content": ask.system},
                {"role": "user", "content": user},
            ],
        });
        self.set_budget(&mut body, ask);
        body
    }
    fn parse_reply(&self, v: &Value) -> Result<String> {
        let content = v
            .pointer("/choices/0/message/content")
            .and_then(Value::as_str);
        if content.is_none_or(|text| text.trim().is_empty()) {
            if let Some(cut) = CutShort::openai(v) {
                return Err(cut.into());
            }
        }
        content
            .map(str::to_string)
            .ok_or_else(|| anyhow!("OpenAI response missing choices[0].message.content"))
    }
    fn controls_reasoning(&self) -> bool {
        self.reasoning != ReasoningControl::Unsent
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
        // System is a leading message; the running turns follow.
        let mut msgs = Vec::with_capacity(messages.len() + 1);
        msgs.push(json!({ "role": "system", "content": ask.system }));
        msgs.extend(messages.iter().cloned());
        let mut body = json!({
            "model": ask.model,
            "temperature": ask.temperature,
            "stream": false,
            "messages": msgs,
            "tools": tools.iter().map(openai_tool).collect::<Vec<_>>(),
        });
        if choice == ToolChoice::None {
            body["tool_choice"] = json!("none");
        }
        self.set_budget(&mut body, ask);
        body
    }
    fn parse_turn(&self, v: &Value) -> Result<Turn> {
        let msg = v
            .pointer("/choices/0/message")
            .ok_or_else(|| anyhow!("OpenAI response missing choices[0].message"))?;
        let text = msg
            .get("content")
            .and_then(Value::as_str)
            .filter(|s| !s.trim().is_empty())
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
        if text.is_none() && calls.is_empty() {
            if let Some(cut) = CutShort::openai(v) {
                return Err(cut.into());
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
mod tests;

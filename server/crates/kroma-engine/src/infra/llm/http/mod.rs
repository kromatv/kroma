//! HTTP LLM backend over `curl` (no heavy HTTP dependency same approach as the
//! TMDB client). The wire differences between vendors live behind one
//! [`Provider`] trait, so [`HttpLlm`] is provider-agnostic and adding a new
//! vendor is a single self-contained `impl` + one line in [`provider_for`].
//!
//! Shipped providers:
//!   * **OpenAI-compatible** `POST {base}/chat/completions` Ollama (base
//!     `http://host:11434/v1`), llama.cpp, LM Studio, vLLM, OpenRouter, OpenAI.
//!   * **Anthropic** `POST {base}/v1/messages` (`x-api-key` +
//!     `anthropic-version`) Claude.

mod curl;
mod providers;

use anyhow::{anyhow, bail, Result};
use serde_json::{json, Value};

use super::tools::{ToolBox, ToolDef};
use super::LlmClient;

use curl::{check_error, curl_get, curl_post, resolve_base};
use providers::{provider_for, Provider};

/// A configured HTTP LLM endpoint (provider + resolved base + model + params).
pub struct HttpLlm {
    provider: Box<dyn Provider>,
    base: String,
    model: String,
    api_key: String,
    temperature: f32,
    reasoning: bool,
}

impl HttpLlm {
    /// Build from settings; `None` when not enough config to be usable (no model,
    /// or an OpenAI-compatible provider with no base URL).
    pub fn from_config(
        provider: &str,
        base_url: &str,
        model: &str,
        api_key: &str,
        temperature: f32,
        reasoning: bool,
    ) -> Option<Self> {
        let model = model.trim();
        if model.is_empty() {
            return None;
        }
        let provider = provider_for(provider);
        let base = resolve_base(base_url, provider.default_base())?;
        Some(Self {
            provider,
            base,
            model: model.to_string(),
            api_key: api_key.trim().to_string(),
            temperature,
            reasoning,
        })
    }

    fn run(&self, system: &str, user: &str, max_tokens: u32, reasoning: bool) -> Result<String> {
        let body = self.provider.chat_body(&self.model, system, user, max_tokens, self.temperature, reasoning);
        let headers = self.provider.headers(&self.api_key);
        let v = curl_post(&self.provider.chat_url(&self.base), &headers, &body)?;
        check_error(&v)?;
        self.provider.parse_reply(&v)
    }

    // A tool that errors is reported to the model as a JSON `{"error":…}`
    // result (it can recover or pick another tool) rather than aborting the loop.
    #[allow(clippy::too_many_arguments)]
    fn run_tools_loop(
        &self,
        system: &str,
        user: &str,
        tools: &[ToolDef],
        toolbox: &dyn ToolBox,
        max_tokens: u32,
        max_steps: usize,
        reasoning: bool,
    ) -> Result<String> {
        let url = self.provider.chat_url(&self.base);
        let headers = self.provider.headers(&self.api_key);
        let mut messages: Vec<Value> = vec![json!({ "role": "user", "content": user })];
        let mut last_text = String::new();
        for step in 0..max_steps {
            let body =
                self.provider.tools_request(&self.model, system, &messages, tools, max_tokens, self.temperature, reasoning);
            let v = curl_post(&url, &headers, &body)?;
            check_error(&v)?;
            let turn = self.provider.parse_turn(&v)?;
            if let Some(t) = &turn.text {
                last_text = t.clone();
            }
            if turn.tool_calls.is_empty() {
                return Ok(last_text);
            }
            messages.push(turn.assistant_msg);
            let mut results = Vec::with_capacity(turn.tool_calls.len());
            for call in turn.tool_calls {
                let out = match toolbox.call(&call.name, &call.args) {
                    Ok(s) => {
                        tracing::debug!(step, tool = %call.name, args = %call.args, bytes = s.len(), "llm tool call");
                        s
                    }
                    Err(e) => {
                        tracing::debug!(step, tool = %call.name, args = %call.args, error = %e, "llm tool call failed");
                        json!({ "error": e.to_string() }).to_string()
                    }
                };
                results.push((call, out));
            }
            messages.extend(self.provider.tool_result_messages(&results));
        }
        bail!("LLM tool loop exhausted {max_steps} steps without a final answer")
    }
}

impl LlmClient for HttpLlm {
    fn available(&self) -> bool {
        true
    }

    fn complete(&self, system: &str, user: &str, max_tokens: u32) -> Result<String> {
        match self.run(system, user, max_tokens, self.reasoning) {
            Ok(text) => Ok(text),
            // Reasoning is unsupported on some models (e.g. Claude Haiku) and 400s
            // there retry once without it so enabling it degrades gracefully.
            Err(e) if self.reasoning && self.provider.reasoning_applies() => {
                tracing::warn!(error = %e, "LLM reasoning request failed; retrying without it");
                self.run(system, user, max_tokens, false)
            }
            Err(e) => Err(e),
        }
    }

    fn supports_tools(&self) -> bool {
        self.provider.supports_tools()
    }

    fn run_tools(
        &self,
        system: &str,
        user: &str,
        tools: &[ToolDef],
        toolbox: &dyn ToolBox,
        max_tokens: u32,
        max_steps: usize,
    ) -> Result<String> {
        match self.run_tools_loop(system, user, tools, toolbox, max_tokens, max_steps, self.reasoning) {
            Ok(s) => Ok(s),
            // Some models 400 on `thinking` (e.g. Claude Haiku) retry the whole
            // loop without it. Catalog tools are read-only, so a replay is safe.
            Err(e) if self.reasoning && self.provider.reasoning_applies() => {
                tracing::warn!(error = %e, "LLM tool run failed; retrying without reasoning");
                self.run_tools_loop(system, user, tools, toolbox, max_tokens, max_steps, false)
            }
            Err(e) => Err(e),
        }
    }

    fn describe(&self) -> String {
        format!("{} {} @ {}", self.provider.id(), self.model, self.provider.chat_url(&self.base))
    }
}

/// List the models an endpoint advertises (`GET {models_url}`), powering the
/// admin "Load models" picker. Standalone (no model needed yet).
pub fn list_models(provider: &str, base_url: &str, api_key: &str) -> Result<Vec<String>> {
    let provider = provider_for(provider);
    let base = resolve_base(base_url, provider.default_base())
        .ok_or_else(|| anyhow!("a base URL is required to list models"))?;
    let v = curl_get(&provider.models_url(&base), &provider.headers(api_key.trim()))?;
    check_error(&v)?;
    let mut ids: Vec<String> = v
        .get("data")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|m| m.get("id").and_then(Value::as_str))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    ids.sort();
    ids.dedup();
    Ok(ids)
}

//! HTTP LLM backend over `kroma_http` (no heavy HTTP dependency, same approach
//! as the TMDB client). The wire differences between vendors live behind one
//! [`Provider`] trait, so [`HttpLlm`] is provider-agnostic and adding a new
//! vendor is a single self-contained `impl` + one line in [`provider_for`].
//!
//! Shipped providers:
//!   * **OpenAI-compatible** `POST {base}/chat/completions` Ollama (base
//!     `http://host:11434/v1`), llama.cpp, LM Studio, vLLM, OpenRouter, OpenAI.
//!   * **Anthropic** `POST {base}/v1/messages` (`x-api-key` +
//!     `anthropic-version`) Claude.

mod ask;
mod cut_short;
mod providers;
mod request;
mod tool_loop;

use anyhow::{anyhow, Result};
use serde_json::Value;

use super::tools::{ToolBox, ToolDef};
use super::LlmClient;

use ask::{Ask, Reasoning};
use cut_short::CutShort;
use providers::{provider_for, Provider};
use request::{get_json, post_json, resolve_base, ApiError};
use tool_loop::ToolRun;

/// A configured HTTP LLM endpoint (provider + resolved base + model + params).
pub struct HttpLlm {
    provider: Box<dyn Provider>,
    base: String,
    model: String,
    api_key: String,
    temperature: f32,
    reasoning: Reasoning,
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
            reasoning: Reasoning::from_setting(reasoning),
        })
    }

    fn ask<'a>(&'a self, system: &'a str, answer_tokens: u32, reasoning: Reasoning) -> Ask<'a> {
        Ask {
            model: &self.model,
            system,
            answer_tokens,
            temperature: self.temperature,
            reasoning,
        }
    }

    fn headers(&self) -> Vec<(&'static str, String)> {
        self.provider.headers(&self.api_key)
    }

    fn chat_url(&self) -> String {
        self.provider.chat_url(&self.base)
    }

    fn run(
        &self,
        system: &str,
        user: &str,
        max_tokens: u32,
        reasoning: Reasoning,
    ) -> Result<String> {
        let body = self
            .provider
            .chat_body(&self.ask(system, max_tokens, reasoning), user);
        let v = post_json(&self.chat_url(), &self.headers(), &body)?;
        self.provider.parse_reply(&v)
    }

    // Catalog tools are read-only, so replaying a tool run is safe.
    fn with_reasoning_retry(
        &self,
        attempt: impl Fn(Reasoning) -> Result<String>,
    ) -> Result<String> {
        match attempt(self.reasoning) {
            Err(e) if self.provider.controls_reasoning() && setting_may_be_why(&e) => {
                let flipped = self.reasoning.flipped();
                tracing::warn!(error = %e, reasoning = %flipped, "LLM request failed; retrying with reasoning flipped");
                attempt(flipped)
            }
            outcome => outcome,
        }
    }
}

fn setting_may_be_why(e: &anyhow::Error) -> bool {
    e.downcast_ref::<CutShort>().is_some()
        || e.downcast_ref::<ApiError>()
            .is_some_and(ApiError::rejected_the_request)
}

impl LlmClient for HttpLlm {
    fn available(&self) -> bool {
        true
    }

    fn complete(&self, system: &str, user: &str, max_tokens: u32) -> Result<String> {
        self.with_reasoning_retry(|reasoning| self.run(system, user, max_tokens, reasoning))
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
        let run = ToolRun {
            user,
            tools,
            toolbox,
            max_steps,
        };
        self.with_reasoning_retry(|reasoning| {
            self.run_tools_loop(&run, &self.ask(system, max_tokens, reasoning))
        })
    }

    fn describe(&self) -> String {
        format!(
            "{} {} @ {}",
            self.provider.id(),
            self.model,
            self.provider.chat_url(&self.base)
        )
    }
}

/// List the models an endpoint advertises (`GET {models_url}`), powering the
/// admin "Load models" picker. Standalone (no model needed yet).
pub fn list_models(provider: &str, base_url: &str, api_key: &str) -> Result<Vec<String>> {
    let provider = provider_for(provider);
    let base = resolve_base(base_url, provider.default_base())
        .ok_or_else(|| anyhow!("a base URL is required to list models"))?;
    let v = get_json(
        &provider.models_url(&base),
        &provider.headers(api_key.trim()),
    )?;
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

#[cfg(test)]
mod tests;

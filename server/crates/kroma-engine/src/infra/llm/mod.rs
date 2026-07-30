//! Pluggable LLM client behind KROMA's small-text-model features (auto-named home
//! sections, per-user taste profiles). Backends sit behind the [`LlmClient`] trait;
//! [`http`] speaks any OpenAI-compatible server or the Anthropic Messages API.

use std::sync::Arc;

use crate::services::settings::Settings;

mod http;
mod tools;

pub use http::list_models;
pub use tools::{ToolBox, ToolDef};

/// A one-off client from unsaved config, for the admin Test / Load-models probes.
/// `None` when the config can't form a usable client.
pub fn build_http(
    provider: &str,
    base_url: &str,
    model: &str,
    api_key: &str,
    temperature: f32,
    reasoning: bool,
) -> Option<Arc<dyn LlmClient>> {
    http::HttpLlm::from_config(provider, base_url, model, api_key, temperature, reasoning)
        .map(|c| Arc::new(c) as Arc<dyn LlmClient>)
}

pub trait LlmClient: Send + Sync {
    fn available(&self) -> bool;

    // Blocking call; must be made from a blocking context.
    fn complete(&self, system: &str, user: &str, max_tokens: u32) -> anyhow::Result<String>;

    // `false` clients only do [`complete`]; tool-driven features must check this
    // and fall back to a prompt path.
    fn supports_tools(&self) -> bool {
        false
    }

    // Dispatches each requested call through `toolbox` and feeds results back, up
    // to `max_steps`, until the model produces a final answer. Blocking.
    fn run_tools(
        &self,
        system: &str,
        user: &str,
        tools: &[ToolDef],
        toolbox: &dyn ToolBox,
        max_tokens: u32,
        max_steps: usize,
    ) -> anyhow::Result<String> {
        let _ = (system, user, tools, toolbox, max_tokens, max_steps);
        anyhow::bail!("this LLM client does not support tool calling")
    }

    fn describe(&self) -> String;
}

/// Never fails: an unconfigured feature yields a [`Disabled`] client, so callers
/// can always call `complete` and check `available()` first. Several configured
/// providers yield a failover chain, default first.
pub fn from_settings(settings: &Settings) -> Arc<dyn LlmClient> {
    if !settings.get_bool("llmEnabled", false) {
        return Arc::new(Disabled);
    }
    let clients: Vec<Arc<dyn LlmClient>> = crate::services::settings::ordered_providers(settings)
        .iter()
        .filter_map(|p| {
            http::HttpLlm::from_config(&p.provider, p.base_url.trim(), p.model.trim(), p.api_key.trim(), p.temperature, p.reasoning)
                .map(|c| Arc::new(c) as Arc<dyn LlmClient>)
        })
        .collect();
    match clients.len() {
        0 => Arc::new(Disabled),
        1 => clients.into_iter().next().expect("one client"),
        _ => Arc::new(Failover { clients }),
    }
}

struct Failover {
    clients: Vec<Arc<dyn LlmClient>>,
}

impl LlmClient for Failover {
    fn available(&self) -> bool {
        self.clients.iter().any(|c| c.available())
    }

    fn supports_tools(&self) -> bool {
        self.clients.iter().any(|c| c.supports_tools())
    }

    fn complete(&self, system: &str, user: &str, max_tokens: u32) -> anyhow::Result<String> {
        let mut last = None;
        for c in &self.clients {
            match c.complete(system, user, max_tokens) {
                Ok(s) => return Ok(s),
                Err(e) => {
                    tracing::warn!(provider = %c.describe(), error = %e, "LLM provider failed; trying next");
                    last = Some(e);
                }
            }
        }
        Err(last.unwrap_or_else(|| anyhow::anyhow!("no LLM provider available")))
    }

    fn run_tools(
        &self,
        system: &str,
        user: &str,
        tools: &[ToolDef],
        toolbox: &dyn ToolBox,
        max_tokens: u32,
        max_steps: usize,
    ) -> anyhow::Result<String> {
        let mut last = None;
        for c in self.clients.iter().filter(|c| c.supports_tools()) {
            match c.run_tools(system, user, tools, toolbox, max_tokens, max_steps) {
                Ok(s) => return Ok(s),
                Err(e) => {
                    tracing::warn!(provider = %c.describe(), error = %e, "LLM tool run failed; trying next");
                    last = Some(e);
                }
            }
        }
        Err(last.unwrap_or_else(|| anyhow::anyhow!("no tool-capable LLM provider available")))
    }

    fn describe(&self) -> String {
        let chain: Vec<String> = self.clients.iter().map(|c| c.describe()).collect();
        format!("failover[{}]", chain.join(" → "))
    }
}

/// The client used when no LLM is configured: `available()` is false and
/// `complete()` errors, so dependent features degrade rather than break.
pub struct Disabled;

impl LlmClient for Disabled {
    fn available(&self) -> bool {
        false
    }
    fn complete(&self, _system: &str, _user: &str, _max_tokens: u32) -> anyhow::Result<String> {
        anyhow::bail!("no LLM configured (enable one under Admin → settings)")
    }
    fn describe(&self) -> String {
        "disabled".to_string()
    }
}

use std::sync::Arc;

use crate::db::testing::TempPool;
use crate::infra::llm::LlmClient;
use crate::services::settings::Settings;
use crate::services::subtitles::progress::{GenRegistry, Handle};

use super::backends::Backend;
use super::Cue;

pub(super) fn cue(timing: &str, text: &str) -> Cue {
    Cue {
        timing: timing.to_string(),
        text: text.to_string(),
    }
}

pub(super) struct FakeLlm {
    pub(super) reply: std::result::Result<String, ()>,
}

impl LlmClient for FakeLlm {
    fn available(&self) -> bool {
        true
    }
    fn complete(&self, _system: &str, _user: &str, _max_tokens: u32) -> anyhow::Result<String> {
        match &self.reply {
            Ok(s) => Ok(s.clone()),
            Err(()) => anyhow::bail!("provider down"),
        }
    }
    fn describe(&self) -> String {
        "fake".to_string()
    }
}

pub(super) fn backend(label: &str, reply: std::result::Result<String, ()>) -> Backend {
    Backend {
        label: label.to_string(),
        client: Arc::new(FakeLlm { reply }),
        token_cap: 8192,
    }
}

pub(super) fn test_pool() -> TempPool {
    crate::db::testing::temp_pool("subs-translate")
}

pub(super) fn settings_pool() -> (TempPool, Settings) {
    let pool = crate::db::testing::temp_pool("translate");
    let settings = Settings::load(&pool);
    (pool, settings)
}

pub(super) fn configure(settings: &Settings, pool: &kroma_db::Pool, base: &str, max_tokens: i64) {
    settings.set_patch(
        pool,
        std::collections::BTreeMap::from([
            ("llmEnabled".to_string(), serde_json::json!(true)),
            ("llmProvider".to_string(), serde_json::json!("openai")),
            ("llmBaseUrl".to_string(), serde_json::json!(base)),
            ("llmModel".to_string(), serde_json::json!("test-model")),
            ("llmApiKey".to_string(), serde_json::json!("k")),
            ("llmMaxTokens".to_string(), serde_json::json!(max_tokens)),
        ]),
    );
}

pub(super) fn handle() -> Handle {
    Arc::new(GenRegistry::default()).start("itm-1", "translate", Some("fr".into()))
}

pub(super) fn vtt_with(n: usize) -> String {
    let mut out = String::from("WEBVTT\n\n");
    for i in 1..=n {
        out.push_str(&format!(
            "00:00:{:02}.000 --> 00:00:{:02}.000\nLine {i}\n\n",
            i,
            i + 1
        ));
    }
    out
}

pub(super) fn numbered_translation(request: &serde_json::Value) -> (u16, serde_json::Value) {
    let user = request
        .pointer("/messages/1/content")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    let body: String = user
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| {
            let (num, rest) = l.split_once('.').unwrap_or(("1", l));
            format!("{}. [fr] {}\n", num.trim(), rest.trim())
        })
        .collect();
    (
        200,
        serde_json::json!({ "choices": [{ "message": { "content": body } }] }),
    )
}

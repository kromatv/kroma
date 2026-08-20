use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use tracing::{info, warn};

use crate::infra::llm::{build_http, LlmClient};
use crate::services::settings::{self, Settings};

use super::batch::translate_batch;
use super::Cue;

const TRANSLATE_TEMP: f32 = 0.2;

pub(super) struct Backend {
    pub(super) label: String,
    pub(super) client: Arc<dyn LlmClient>,
    pub(super) token_cap: u32,
}

pub(super) fn build_backends(settings: &Settings) -> Vec<Backend> {
    settings::ordered_providers(settings)
        .into_iter()
        .filter_map(|p| {
            let client =
                build_http(&p.provider, p.base_url.trim(), p.model.trim(), p.api_key.trim(), TRANSLATE_TEMP, p.reasoning)?;
            let name = if p.name.trim().is_empty() { p.provider.clone() } else { p.name.clone() };
            Some(Backend {
                label: format!("{name} ({})", p.model),
                client,
                token_cap: p.max_tokens.clamp(64, 8192) as u32,
            })
        })
        .collect()
}

pub(super) fn translate_one(
    backends: &[Backend],
    active: &AtomicUsize,
    batch: &[Cue],
    target_lang: &str,
) -> std::result::Result<Vec<Option<String>>, String> {
    let start = active.load(Ordering::Relaxed).min(backends.len().saturating_sub(1));
    let mut first_err: Option<String> = None;
    for (i, b) in backends.iter().enumerate().skip(start) {
        match translate_batch(b.client.as_ref(), batch, target_lang, b.token_cap) {
            Ok(v) => {
                if i != start {
                    info!(backend = %b.label, "subtitle translate: switched provider (previous one failed)");
                    active.store(i, Ordering::Relaxed);
                }
                return Ok(v);
            }
            Err(e) => {
                warn!(backend = %b.label, "subtitle translate: provider failed: {e}");
                if first_err.is_none() {
                    first_err = Some(e);
                }
            }
        }
    }
    Err(first_err.unwrap_or_else(|| "no usable LLM provider".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::subtitles::translate::test_support::{backend, cue, test_pool};

    #[test]
    fn translate_one_uses_first_backend_when_it_works() {
        let backends = vec![backend("a", Ok("1. Bonjour\n2. Salut".into())), backend("b", Err(()))];
        let active = AtomicUsize::new(0);
        let batch = [cue("t0", "Hello"), cue("t1", "Hi")];
        let out = translate_one(&backends, &active, &batch, "French").unwrap();
        assert_eq!(out, vec![Some("Bonjour".to_string()), Some("Salut".to_string())]);
        assert_eq!(active.load(Ordering::Relaxed), 0); // stayed on the primary
    }

    #[test]
    fn translate_one_fails_over_and_sticks() {
        let backends = vec![backend("a", Err(())), backend("b", Ok("1. Bonjour\n2. Salut".into()))];
        let active = AtomicUsize::new(0);
        let batch = [cue("t0", "Hello"), cue("t1", "Hi")];
        let out = translate_one(&backends, &active, &batch, "French").unwrap();
        assert_eq!(out[0].as_deref(), Some("Bonjour"));
        assert_eq!(active.load(Ordering::Relaxed), 1); // switched to the working backend
    }

    #[test]
    fn translate_one_errors_when_all_backends_fail() {
        let backends = vec![backend("a", Err(())), backend("b", Err(()))];
        let active = AtomicUsize::new(0);
        let batch = [cue("t0", "Hello")];
        let err = translate_one(&backends, &active, &batch, "French").unwrap_err();
        assert!(err.contains("LLM request failed"), "unexpected: {err}");
    }

    #[test]
    fn build_backends_is_empty_without_any_provider() {
        let pool = test_pool();
        let s = Settings::load(&pool); // default settings carry no configured provider
        assert!(build_backends(&s).is_empty());
    }
}

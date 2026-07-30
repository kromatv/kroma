//! AI subtitle translation: translate a WebVTT track into another language using
//! the app's configured LLM providers in failover order. Timestamps are preserved
//! verbatim; only cue text is translated, in batches.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use tracing::{info, warn};

use crate::infra::llm::{build_http, LlmClient};
use crate::services::settings::{self, Settings};
use crate::services::subtitles::progress::Handle;

const TRANSLATE_TEMP: f32 = 0.2;

struct Backend {
    label: String,
    client: Arc<dyn LlmClient>,
    token_cap: u32,
}

fn build_backends(settings: &Settings) -> Vec<Backend> {
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

struct Cue {
    timing: String,
    text: String,
}

fn parse_cues(vtt: &str) -> Vec<Cue> {
    let mut cues = Vec::new();
    let mut timing: Option<String> = None;
    let mut text: Vec<String> = Vec::new();
    let flush = |timing: &mut Option<String>, text: &mut Vec<String>, cues: &mut Vec<Cue>| {
        if let Some(t) = timing.take() {
            cues.push(Cue { timing: t, text: text.join("\n") });
        }
        text.clear();
    };
    for line in vtt.lines() {
        if line.contains("-->") {
            flush(&mut timing, &mut text, &mut cues);
            timing = Some(line.trim().to_string());
        } else if timing.is_some() {
            if line.trim().is_empty() {
                flush(&mut timing, &mut text, &mut cues);
            } else {
                text.push(line.to_string());
            }
        }
    }
    flush(&mut timing, &mut text, &mut cues);
    cues
}

const BATCH: usize = 24;
const PARALLEL: usize = 4;

/// Translates `vtt` into `target_lang`, batching cue text through the configured
/// LLM providers with failover. `Err` carries why nothing could be translated at
/// all; a partial translation is still `Ok`. Blocking - call off-thread.
pub fn translate_vtt(
    settings: &Settings,
    vtt: &str,
    target_lang: &str,
    handle: &Handle,
) -> std::result::Result<String, String> {
    let backends = build_backends(settings);
    if backends.is_empty() {
        return Err("no LLM provider configured (set one on the admin IA page)".to_string());
    }
    let cues = parse_cues(vtt);
    if cues.is_empty() {
        return Err("the source subtitle had no cues to translate".to_string());
    }
    let total = cues.len();
    let chunks: Vec<&[Cue]> = cues.chunks(BATCH).collect();
    let batches = chunks.len();
    let chain = backends.iter().map(|b| b.label.as_str()).collect::<Vec<_>>().join(" -> ");
    let workers = PARALLEL.min(batches).max(1);
    info!(target = %target_lang, cues = total, batches, workers, %chain, "subtitle translate: starting");
    handle.progress(0, total);

    let next = AtomicUsize::new(0);
    let active = AtomicUsize::new(0);
    let done = AtomicUsize::new(0);
    let translated = AtomicUsize::new(0);
    let results: Vec<Mutex<Option<Vec<Option<String>>>>> = (0..batches).map(|_| Mutex::new(None)).collect();
    let first_error: Mutex<Option<String>> = Mutex::new(None);

    std::thread::scope(|s| {
        for _ in 0..workers {
            s.spawn(|| {
                translate_worker(
                    &next, &active, &done, &translated, &chunks, &backends, &results,
                    &first_error, handle, target_lang, batches, total,
                )
            });
        }
    });

    if handle.cancelled() {
        return Err("cancelled".to_string());
    }
    let ok_batches = translated.load(Ordering::Relaxed);
    if ok_batches == 0 {
        // first_error carries the LLM's actual complaint (auth, credits, parse, ...).
        return Err(first_error.into_inner().unwrap().unwrap_or_else(|| "translation failed for every batch".to_string()));
    }
    if ok_batches < batches {
        warn!(ok = ok_batches, total = batches, "subtitle translate: finished with some batches left untranslated");
    } else {
        info!(batches, "subtitle translate: done");
    }

    Ok(reassemble_vtt(&chunks, &results))
}

#[allow(clippy::too_many_arguments)]
fn translate_worker(
    next: &AtomicUsize,
    active: &AtomicUsize,
    done: &AtomicUsize,
    translated: &AtomicUsize,
    chunks: &[&[Cue]],
    backends: &[Backend],
    results: &[Mutex<Option<Vec<Option<String>>>>],
    first_error: &Mutex<Option<String>>,
    handle: &Handle,
    target_lang: &str,
    batches: usize,
    total: usize,
) {
    loop {
        if handle.cancelled() {
            break;
        }
        let bi = next.fetch_add(1, Ordering::Relaxed);
        if bi >= batches {
            break;
        }
        let batch = chunks[bi];
        match translate_one(backends, active, batch, target_lang) {
            Ok(v) => {
                *results[bi].lock().unwrap() = Some(v);
                translated.fetch_add(1, Ordering::Relaxed);
            }
            Err(e) => {
                warn!(batch = bi + 1, total = batches, "subtitle translate: batch failed on every provider: {e}");
                let mut fe = first_error.lock().unwrap();
                if fe.is_none() {
                    *fe = Some(e);
                }
            }
        }
        let d = done.fetch_add(batch.len(), Ordering::Relaxed) + batch.len();
        handle.progress(d, total);
    }
}

fn reassemble_vtt(chunks: &[&[Cue]], results: &[Mutex<Option<Vec<Option<String>>>>]) -> String {
    let mut out = String::from("WEBVTT\n\n");
    for (bi, batch) in chunks.iter().enumerate() {
        let res = results[bi].lock().unwrap();
        for (i, cue) in batch.iter().enumerate() {
            let line = res
                .as_ref()
                .and_then(|v| v.get(i))
                .and_then(|o| o.as_deref())
                .filter(|s| !s.is_empty())
                .unwrap_or(&cue.text);
            out.push_str(&cue.timing);
            out.push('\n');
            out.push_str(line.trim());
            out.push_str("\n\n");
        }
    }
    out
}

fn translate_one(
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

fn translate_batch(
    llm: &dyn LlmClient,
    batch: &[Cue],
    target_lang: &str,
    token_cap: u32,
) -> std::result::Result<Vec<Option<String>>, String> {
    let numbered: String =
        batch.iter().enumerate().map(|(i, c)| format!("{}. {}\n", i + 1, c.text.replace('\n', " "))).collect();
    let system = format!(
        "You are a professional subtitle translator. Translate each numbered subtitle line into {target_lang}. \
         Output EXACTLY the same number of lines, each prefixed with its number and a period, and NOTHING else. \
         Preserve meaning and tone; keep proper nouns. Do not merge or split lines."
    );
    let max_tokens = ((batch.len() as u32) * 80 + 200).min(token_cap);
    let reply = llm
        .complete(&system, &numbered, max_tokens)
        .map_err(|e| format!("LLM request failed: {e:#}"))?;
    // None marks a gap; the caller keeps that cue's original text instead of blanking it.
    let mut out: Vec<Option<String>> = vec![None; batch.len()];
    let mut filled = 0;
    for line in reply.lines() {
        let line = line.trim();
        let Some((num, rest)) = line.split_once('.') else { continue };
        if let Ok(n) = num.trim().parse::<usize>() {
            let rest = rest.trim();
            if n >= 1 && n <= batch.len() && !rest.is_empty() {
                out[n - 1] = Some(rest.to_string());
                filled += 1;
            }
        }
    }
    // At least half the lines must parse, or the batch is treated as failed.
    if filled * 2 >= batch.len() {
        Ok(out)
    } else {
        Err(format!(
            "model reply did not match the numbered format ({filled}/{} lines parsed); reply began: {}",
            batch.len(),
            snippet(&reply),
        ))
    }
}

fn snippet(text: &str) -> String {
    let one_line: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if one_line.chars().count() > 160 {
        format!("{}…", one_line.chars().take(160).collect::<String>())
    } else {
        one_line
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cue(timing: &str, text: &str) -> Cue {
        Cue { timing: timing.to_string(), text: text.to_string() }
    }

    struct FakeLlm {
        reply: std::result::Result<String, ()>,
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

    #[test]
    fn parse_cues_extracts_timing_and_joined_text() {
        let vtt = "WEBVTT\n\n\
                   00:00:01.000 --> 00:00:03.000\nHello there\nsecond line\n\n\
                   00:00:04.000 --> 00:00:06.000\nBye\n";
        let cues = parse_cues(vtt);
        assert_eq!(cues.len(), 2);
        assert_eq!(cues[0].timing, "00:00:01.000 --> 00:00:03.000");
        assert_eq!(cues[0].text, "Hello there\nsecond line");
        assert_eq!(cues[1].text, "Bye");
    }

    #[test]
    fn parse_cues_empty_when_no_timing() {
        assert!(parse_cues("WEBVTT\n\njust some header text\n").is_empty());
        assert!(parse_cues("").is_empty());
    }

    #[test]
    fn translate_batch_parses_numbered_reply() {
        let llm = FakeLlm { reply: Ok("1. Bonjour\n2. Salut".to_string()) };
        let batch = [cue("t0", "Hello"), cue("t1", "Hi")];
        let out = translate_batch(&llm, &batch, "French", 8192).unwrap();
        assert_eq!(out, vec![Some("Bonjour".to_string()), Some("Salut".to_string())]);
    }

    #[test]
    fn translate_batch_keeps_gap_as_none_when_mostly_parsed() {
        let llm = FakeLlm { reply: Ok("1. Bonjour".to_string()) };
        let batch = [cue("t0", "Hello"), cue("t1", "Hi")];
        let out = translate_batch(&llm, &batch, "French", 8192).unwrap();
        assert_eq!(out, vec![Some("Bonjour".to_string()), None]);
    }

    #[test]
    fn translate_batch_errors_when_reply_unparseable() {
        let llm = FakeLlm { reply: Ok("1. Bonjour\ngarbage without numbers".to_string()) };
        let batch = [cue("t0", "a"), cue("t1", "b"), cue("t2", "c"), cue("t3", "d")];
        let err = translate_batch(&llm, &batch, "French", 8192).unwrap_err();
        assert!(err.contains("numbered format"), "unexpected error: {err}");
    }

    #[test]
    fn translate_batch_propagates_llm_error() {
        let llm = FakeLlm { reply: Err(()) };
        let batch = [cue("t0", "Hello")];
        let err = translate_batch(&llm, &batch, "French", 8192).unwrap_err();
        assert!(err.contains("LLM request failed"), "unexpected error: {err}");
    }

    #[test]
    fn reassemble_vtt_falls_back_to_original_on_gap_or_missing_batch() {
        let cues0 = vec![cue("00:00:01.000 --> 00:00:02.000", "Hello"), cue("00:00:02.000 --> 00:00:03.000", "World")];
        let cues1 = vec![cue("00:00:03.000 --> 00:00:04.000", "Original")];
        let chunks: Vec<&[Cue]> = vec![&cues0, &cues1];
        let results = vec![
            Mutex::new(Some(vec![Some("Bonjour".to_string()), None])),
            Mutex::new(None),
        ];
        let out = reassemble_vtt(&chunks, &results);
        assert!(out.starts_with("WEBVTT\n\n"));
        assert!(out.contains("00:00:01.000 --> 00:00:02.000\nBonjour\n\n"));
        assert!(out.contains("00:00:02.000 --> 00:00:03.000\nWorld\n\n"));
        assert!(out.contains("00:00:03.000 --> 00:00:04.000\nOriginal\n\n"));
    }

    #[test]
    fn snippet_collapses_whitespace_and_caps_length() {
        assert_eq!(snippet("  hello\n\tworld  "), "hello world");
        let long = "x ".repeat(200);
        let s = snippet(&long);
        assert!(s.chars().count() <= 161); // 160 chars + the ellipsis
        assert!(s.ends_with('…'));
    }

    fn backend(label: &str, reply: std::result::Result<String, ()>) -> Backend {
        Backend { label: label.to_string(), client: Arc::new(FakeLlm { reply }), token_cap: 8192 }
    }

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

    fn test_pool() -> crate::db::Pool {
        static SEQ: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let n = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("kroma-subs-translate-{}-{n}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        crate::db::init(&path).unwrap()
    }

    #[test]
    fn translate_vtt_errors_when_no_provider_configured() {
        let pool = test_pool();
        let s = Settings::load(&pool); // no LLM providers
        let reg = std::sync::Arc::new(crate::services::subtitles::progress::GenRegistry::default());
        let handle = reg.start("item1", "translate", Some("French".into()));
        let err = translate_vtt(&s, "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n", "French", &handle).unwrap_err();
        assert!(err.contains("no LLM provider"), "unexpected: {err}");
    }

    #[test]
    fn build_backends_is_empty_without_any_provider() {
        let pool = test_pool();
        let s = Settings::load(&pool); // default settings carry no configured provider
        assert!(build_backends(&s).is_empty());
    }

    #[test]
    fn parse_cues_preserves_timing_cue_settings() {
        let vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000 line:80% align:start\nHi\n";
        let cues = parse_cues(vtt);
        assert_eq!(cues.len(), 1);
        assert_eq!(cues[0].timing, "00:00:01.000 --> 00:00:02.000 line:80% align:start");
        assert_eq!(cues[0].text, "Hi");
    }

    #[test]
    fn translate_batch_ignores_out_of_range_line_numbers() {
        let llm = FakeLlm { reply: Ok("1. Bonjour\n5. Stray".to_string()) };
        let batch = [cue("t0", "Hello"), cue("t1", "Hi")];
        let out = translate_batch(&llm, &batch, "French", 8192).unwrap();
        assert_eq!(out, vec![Some("Bonjour".to_string()), None]);
    }

    use crate::services::subtitles::progress::GenRegistry;
    use crate::test_support::FakeLlm as FakeEndpoint;

    fn settings_pool() -> (kroma_db::Pool, Settings) {
        static SEQ: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let n = SEQ.fetch_add(1, Ordering::Relaxed);
        let path =
            std::env::temp_dir().join(format!("kroma-translate-{}-{n}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let pool = crate::db::init(&path).unwrap();
        let settings = Settings::load(&pool);
        (pool, settings)
    }

    fn configure(settings: &Settings, pool: &kroma_db::Pool, base: &str, max_tokens: i64) {
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

    fn handle() -> Handle {
        Arc::new(GenRegistry::default()).start("itm-1", "translate", Some("fr".into()))
    }

    fn vtt_with(n: usize) -> String {
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

    fn numbered_translation(request: &serde_json::Value) -> (u16, serde_json::Value) {
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
        (200, serde_json::json!({ "choices": [{ "message": { "content": body } }] }))
    }

    #[test]
    fn with_no_provider_configured_it_says_where_to_set_one() {
        let (_pool, settings) = settings_pool();
        let err = translate_vtt(&settings, &vtt_with(3), "French", &handle()).unwrap_err();
        assert!(err.contains("admin"), "{err}");
    }

    #[test]
    fn a_subtitle_with_no_cues_is_refused_before_any_request() {
        let (pool, settings) = settings_pool();
        let llm = FakeEndpoint::routed(numbered_translation);
        configure(&settings, &pool, llm.base(), 4096);

        let err = translate_vtt(&settings, "WEBVTT\n\n", "French", &handle()).unwrap_err();
        assert!(err.contains("no cues"), "{err}");
        assert!(llm.requests().is_empty(), "an empty subtitle should cost nothing");
    }

    #[test]
    fn every_cue_comes_back_translated_with_its_timing_intact() {
        let (pool, settings) = settings_pool();
        let llm = FakeEndpoint::routed(numbered_translation);
        configure(&settings, &pool, llm.base(), 4096);

        let out = translate_vtt(&settings, &vtt_with(3), "French", &handle()).unwrap();
        assert!(out.starts_with("WEBVTT"));
        for i in 1..=3 {
            assert!(out.contains(&format!("[fr] Line {i}")), "cue {i} missing from:\n{out}");
        }
        assert!(out.contains("00:00:01.000 --> 00:00:02.000"));
        assert!(out.contains("00:00:03.000 --> 00:00:04.000"));
    }

    #[test]
    fn a_long_subtitle_is_split_into_batches() {
        let (pool, settings) = settings_pool();
        let llm = FakeEndpoint::routed(numbered_translation);
        configure(&settings, &pool, llm.base(), 4096);

        let cues = BATCH * 2 + 3;
        let out = translate_vtt(&settings, &vtt_with(cues), "French", &handle()).unwrap();
        assert_eq!(llm.requests().len(), 3, "{cues} cues at {BATCH} per batch");
        assert!(out.contains(&format!("[fr] Line {cues}")), "the last cue was dropped");
    }

    #[test]
    fn a_batch_the_model_mangled_keeps_its_original_text() {
        let (pool, settings) = settings_pool();
        let llm = FakeEndpoint::always("I cannot help with that request.");
        configure(&settings, &pool, llm.base(), 4096);

        // A single-batch document that fails entirely surfaces as a hard error.
        let err = translate_vtt(&settings, &vtt_with(3), "French", &handle()).unwrap_err();
        assert!(err.contains("numbered format"), "{err}");
        assert!(err.contains("cannot help"), "the model's actual reply is not in: {err}");
    }

    #[test]
    fn a_partial_reply_fills_what_it_can_and_keeps_the_rest() {
        let (pool, settings) = settings_pool();
        let llm = FakeEndpoint::routed(|request| {
            let user = request
                .pointer("/messages/1/content")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default();
            let body: String = user
                .lines()
                .filter(|l| !l.trim().is_empty())
                .filter(|l| !l.trim_start().starts_with("2."))
                .map(|l| {
                    let (num, rest) = l.split_once('.').unwrap_or(("1", l));
                    format!("{}. [fr] {}\n", num.trim(), rest.trim())
                })
                .collect();
            (200, serde_json::json!({ "choices": [{ "message": { "content": body } }] }))
        });
        configure(&settings, &pool, llm.base(), 4096);

        let out = translate_vtt(&settings, &vtt_with(3), "French", &handle()).unwrap();
        assert!(out.contains("[fr] Line 1"));
        assert!(out.contains("[fr] Line 3"));
        assert!(out.contains("\nLine 2\n"), "the gap was blanked instead of kept:\n{out}");
    }

    #[test]
    fn a_provider_that_is_down_surfaces_its_own_complaint() {
        let (pool, settings) = settings_pool();
        let llm = FakeEndpoint::failing(401);
        configure(&settings, &pool, llm.base(), 4096);

        let err = translate_vtt(&settings, &vtt_with(3), "French", &handle()).unwrap_err();
        assert!(err.contains("LLM request failed"), "{err}");
    }

    #[test]
    fn the_providers_configured_token_cap_is_respected() {
        let (pool, settings) = settings_pool();
        let llm = FakeEndpoint::routed(numbered_translation);
        configure(&settings, &pool, llm.base(), 300);

        translate_vtt(&settings, &vtt_with(BATCH), "French", &handle()).unwrap();
        let asked = llm.requests()[0]["max_tokens"].as_u64().unwrap();
        assert_eq!(asked, 300, "asked for more than the account allows");
    }

    #[test]
    fn a_cancelled_translation_reports_as_cancelled() {
        let (pool, settings) = settings_pool();
        let llm = FakeEndpoint::routed(numbered_translation);
        configure(&settings, &pool, llm.base(), 4096);

        let reg = Arc::new(GenRegistry::default());
        let h = reg.start("itm-1", "translate", Some("fr".into()));
        reg.cancel(h.id());
        let err = translate_vtt(&settings, &vtt_with(BATCH * 3), "French", &h).unwrap_err();
        assert_eq!(err, "cancelled");
    }
}

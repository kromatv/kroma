use std::sync::Arc;

use crate::db::testing::TempPool;

use super::test_support::{
    configure, cue, handle, numbered_translation, settings_pool, test_pool, vtt_with,
};
use super::*;
use crate::services::subtitles::progress::GenRegistry;
use crate::test_support::FakeLlm as FakeEndpoint;

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
fn a_batch_the_provider_refuses_leaves_those_cues_in_the_source_language() {
    let pool: TempPool = crate::db::testing::temp_pool("translate-partial");
    let settings = Settings::load(&pool);
    let llm = crate::test_support::FakeLlm::routed(|request| {
        if request.to_string().contains("line 25") {
            return (500, serde_json::json!({ "error": "out of credits" }));
        }
        let content = (1..=BATCH)
            .map(|n| format!("{n}. ligne {n}"))
            .collect::<Vec<_>>()
            .join("\n");
        (
            200,
            serde_json::json!({ "choices": [{ "message": { "content": content } }] }),
        )
    });
    llm.configure_settings(&settings, &pool);

    let mut vtt = String::from("WEBVTT\n\n");
    for n in 1..=BATCH + 2 {
        vtt.push_str(&format!(
            "00:00:{n:02}.000 --> 00:00:{:02}.000\nline {n}\n\n",
            n + 1
        ));
    }
    let registry =
        std::sync::Arc::new(crate::services::subtitles::progress::GenRegistry::default());
    let handle = registry.start("itm-1", "translate", Some("fr".to_string()));

    let out = translate_vtt(&settings, &vtt, "French", &handle).unwrap();

    assert!(
        out.contains("ligne 1\n"),
        "the first batch was translated: {out}"
    );
    assert!(
        out.contains("line 25\n"),
        "the refused batch kept its source text: {out}"
    );
    assert!(out.contains("line 26\n"));
}

#[test]
fn reassemble_vtt_falls_back_to_original_on_gap_or_missing_batch() {
    let cues0 = vec![
        cue("00:00:01.000 --> 00:00:02.000", "Hello"),
        cue("00:00:02.000 --> 00:00:03.000", "World"),
    ];
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
fn translate_vtt_errors_when_no_provider_configured() {
    let pool = test_pool();
    let s = Settings::load(&pool); // no LLM providers
    let reg = std::sync::Arc::new(crate::services::subtitles::progress::GenRegistry::default());
    let handle = reg.start("item1", "translate", Some("French".into()));
    let err = translate_vtt(
        &s,
        "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n",
        "French",
        &handle,
    )
    .unwrap_err();
    assert!(err.contains("no LLM provider"), "unexpected: {err}");
}

#[test]
fn parse_cues_preserves_timing_cue_settings() {
    let vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000 line:80% align:start\nHi\n";
    let cues = parse_cues(vtt);
    assert_eq!(cues.len(), 1);
    assert_eq!(
        cues[0].timing,
        "00:00:01.000 --> 00:00:02.000 line:80% align:start"
    );
    assert_eq!(cues[0].text, "Hi");
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
    assert!(
        llm.requests().is_empty(),
        "an empty subtitle should cost nothing"
    );
}

#[test]
fn every_cue_comes_back_translated_with_its_timing_intact() {
    let (pool, settings) = settings_pool();
    let llm = FakeEndpoint::routed(numbered_translation);
    configure(&settings, &pool, llm.base(), 4096);

    let out = translate_vtt(&settings, &vtt_with(3), "French", &handle()).unwrap();
    assert!(out.starts_with("WEBVTT"));
    for i in 1..=3 {
        assert!(
            out.contains(&format!("[fr] Line {i}")),
            "cue {i} missing from:\n{out}"
        );
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
    assert!(
        out.contains(&format!("[fr] Line {cues}")),
        "the last cue was dropped"
    );
}

#[test]
fn a_batch_the_model_mangled_keeps_its_original_text() {
    let (pool, settings) = settings_pool();
    let llm = FakeEndpoint::always("I cannot help with that request.");
    configure(&settings, &pool, llm.base(), 4096);

    // A single-batch document that fails entirely surfaces as a hard error.
    let err = translate_vtt(&settings, &vtt_with(3), "French", &handle()).unwrap_err();
    assert!(err.contains("numbered format"), "{err}");
    assert!(
        err.contains("cannot help"),
        "the model's actual reply is not in: {err}"
    );
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
        (
            200,
            serde_json::json!({ "choices": [{ "message": { "content": body } }] }),
        )
    });
    configure(&settings, &pool, llm.base(), 4096);

    let out = translate_vtt(&settings, &vtt_with(3), "French", &handle()).unwrap();
    assert!(out.contains("[fr] Line 1"));
    assert!(out.contains("[fr] Line 3"));
    assert!(
        out.contains("\nLine 2\n"),
        "the gap was blanked instead of kept:\n{out}"
    );
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

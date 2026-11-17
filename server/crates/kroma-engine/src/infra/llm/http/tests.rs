use serde_json::{json, Value};

use super::*;
use crate::test_support::FakeLlm;

fn answer() -> Value {
    json!({ "choices": [{ "finish_reason": "stop", "message": { "content": "{\"sections\":[]}" } }] })
}

fn spent_reasoning() -> Value {
    json!({
        "choices": [{ "finish_reason": "length", "message": { "content": null } }],
        "usage": { "completion_tokens": 1924, "completion_tokens_details": { "reasoning_tokens": 1924 } },
    })
}

fn client(provider: &str, llm: &FakeLlm, reasoning: bool) -> HttpLlm {
    HttpLlm::from_config(provider, llm.base(), "m", "k", 0.7, reasoning).unwrap()
}

#[test]
fn a_model_that_cannot_stop_reasoning_is_retried_with_room_to_reason() {
    let llm = FakeLlm::routed(|body| match body["reasoning"]["enabled"].as_bool() {
        Some(false) => (
            400,
            json!({ "error": { "code": 400, "message": "Reasoning is mandatory for this endpoint" } }),
        ),
        _ => (200, answer()),
    });

    let reply = client("openrouter", &llm, false).complete("SYS", "groups", 900);

    let sent = llm.requests();
    assert_eq!(reply.unwrap(), "{\"sections\":[]}");
    assert_eq!(sent.len(), 2);
    assert_eq!(sent[1]["reasoning"], json!({ "max_tokens": 1024 }));
    assert_eq!(sent[1]["max_tokens"], 1924);
}

#[test]
fn a_reply_that_reasoned_past_its_budget_is_retried_with_reasoning_off() {
    let llm = FakeLlm::routed(|body| match body["reasoning"].get("max_tokens") {
        Some(_) => (200, spent_reasoning()),
        None => (200, answer()),
    });

    let reply = client("openrouter", &llm, true).complete("SYS", "groups", 900);

    let sent = llm.requests();
    assert!(reply.is_ok());
    assert_eq!(sent[1]["reasoning"], json!({ "enabled": false }));
}

#[test]
fn a_reply_cut_short_both_ways_reports_the_second_attempt() {
    let llm = FakeLlm::routed(|_| (200, spent_reasoning()));

    let err = client("openrouter", &llm, false)
        .complete("SYS", "groups", 900)
        .unwrap_err();

    assert!(err.downcast_ref::<CutShort>().is_some());
    assert_eq!(llm.requests().len(), 2);
}

#[test]
fn a_rate_limited_request_is_not_retried() {
    let llm = FakeLlm::routed(|_| {
        (
            429,
            json!({ "error": { "code": 429, "message": "Rate limit exceeded" } }),
        )
    });

    let err = client("openrouter", &llm, false)
        .complete("SYS", "groups", 900)
        .unwrap_err();

    assert_eq!(err.to_string(), "LLM API error: Rate limit exceeded");
    assert_eq!(llm.requests().len(), 1);
}

#[test]
fn a_plain_openai_compatible_server_is_not_retried_for_its_reasoning() {
    let llm = FakeLlm::routed(|_| (200, spent_reasoning()));

    let err = client("openai", &llm, false)
        .complete("SYS", "groups", 900)
        .unwrap_err();

    assert!(err.downcast_ref::<CutShort>().is_some());
    assert_eq!(llm.requests().len(), 1);
}

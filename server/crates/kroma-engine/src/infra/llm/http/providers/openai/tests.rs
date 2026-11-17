use super::*;
use crate::infra::llm::http::ask::Reasoning;
use crate::infra::llm::http::providers::test_support::{ask, defs, EchoBox};
use crate::infra::llm::tools::ToolBox;

#[test]
fn openai_request_prepends_system_and_maps_tools() {
    let messages = vec![json!({ "role": "user", "content": "hi" })];
    let body = OpenAi::openai().tools_request(
        &ask(Reasoning::Off, 100),
        &messages,
        &defs(),
        ToolChoice::Auto,
    );
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
    let resp = json!({ "choices": [{ "message": { "role": "assistant", "content": "done" } }] });
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

#[test]
fn a_plain_openai_compatible_server_is_never_sent_a_reasoning_control() {
    for reasoning in [Reasoning::On, Reasoning::Off] {
        let body = OpenAi::openai().chat_body(&ask(reasoning, 900), "hi");

        assert!(body.get("reasoning").is_none(), "{body}");
        assert!(body.get("reasoning_effort").is_none(), "{body}");
        assert_eq!(body["max_tokens"], 900);
    }
}

#[test]
fn a_reply_that_spent_its_budget_reasoning_fails_saying_so() {
    let resp = json!({
        "choices": [{ "finish_reason": "length", "message": { "role": "assistant", "content": null } }],
        "usage": { "completion_tokens": 900, "completion_tokens_details": { "reasoning_tokens": 900 } },
    });

    let err = OpenAi::openrouter().parse_reply(&resp).unwrap_err();

    assert!(err.downcast_ref::<CutShort>().is_some());
    assert!(
        err.to_string()
            .contains("900 tokens out, 900 of them reasoning"),
        "{err}"
    );
}

#[test]
fn a_tool_turn_cut_short_before_any_text_or_call_fails_saying_so() {
    let resp = json!({
        "choices": [{ "finish_reason": "length", "message": { "role": "assistant", "content": "" } }],
        "usage": { "completion_tokens": 2048 },
    });

    let err = OpenAi::openrouter().parse_turn(&resp).err().unwrap();

    assert!(err.downcast_ref::<CutShort>().is_some());
}

#[test]
fn a_closing_turn_tells_the_model_not_to_call_a_tool() {
    let body =
        OpenAi::openai().tools_request(&ask(Reasoning::Off, 100), &[], &defs(), ToolChoice::None);

    assert_eq!(body["tool_choice"], "none");
    assert_eq!(body["tools"][0]["function"]["name"], "find_titles");
}

#[test]
fn an_ordinary_turn_leaves_the_tool_choice_to_the_model() {
    let body =
        OpenAi::openai().tools_request(&ask(Reasoning::Off, 100), &[], &defs(), ToolChoice::Auto);

    assert!(body.get("tool_choice").is_none());
}

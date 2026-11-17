use anyhow::{bail, Result};
use serde_json::{json, Value};

use super::super::tools::{ToolBox, ToolCall, ToolDef};
use super::ask::{Ask, ToolChoice};
use super::request::post_json;
use super::HttpLlm;

const CLOSING_NOTE: &str = "No more lookups are available. Reply now with the final answer, \
                            in the format the instructions ask for, from what you have gathered.";

pub(super) struct ToolRun<'a> {
    pub(super) user: &'a str,
    pub(super) tools: &'a [ToolDef],
    pub(super) toolbox: &'a dyn ToolBox,
    pub(super) max_steps: usize,
}

impl HttpLlm {
    pub(super) fn run_tools_loop(&self, run: &ToolRun<'_>, ask: &Ask<'_>) -> Result<String> {
        let (url, headers) = (self.chat_url(), self.headers());
        let mut messages: Vec<Value> = vec![json!({ "role": "user", "content": run.user })];
        let mut last_text = String::new();
        for step in 0..run.max_steps {
            let choice = if step + 1 == run.max_steps {
                messages.push(json!({ "role": "user", "content": CLOSING_NOTE }));
                ToolChoice::None
            } else {
                ToolChoice::Auto
            };
            let body = self
                .provider
                .tools_request(ask, &messages, run.tools, choice);
            let turn = self
                .provider
                .parse_turn(&post_json(&url, &headers, &body)?)?;
            if let Some(text) = &turn.text {
                last_text.clone_from(text);
            }
            if turn.tool_calls.is_empty() {
                return Ok(last_text);
            }
            messages.push(turn.assistant_msg);
            let results = dispatch(run.toolbox, step, turn.tool_calls);
            messages.extend(self.provider.tool_result_messages(&results));
        }
        bail!(
            "LLM tool loop exhausted {} steps without a final answer",
            run.max_steps
        )
    }
}

// A tool that errors is reported to the model as a JSON `{"error":…}` result
// (it can recover or pick another tool) rather than aborting the loop.
fn dispatch(toolbox: &dyn ToolBox, step: usize, calls: Vec<ToolCall>) -> Vec<(ToolCall, String)> {
    calls
        .into_iter()
        .map(|call| {
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
            (call, out)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::infra::llm::http::cut_short::CutShort;
    use crate::infra::llm::http::providers::test_support::{defs, EchoBox};
    use crate::infra::llm::LlmClient;
    use crate::test_support::FakeLlm;

    fn tool_call() -> Value {
        json!({ "choices": [{ "finish_reason": "tool_calls", "message": { "role": "assistant", "content": null,
            "tool_calls": [{ "id": "c1", "type": "function",
                "function": { "name": "find_titles", "arguments": "{\"genre\":\"Drama\"}" } }] } }] })
    }

    fn answer(text: &str) -> Value {
        json!({ "choices": [{ "finish_reason": "stop", "message": { "role": "assistant", "content": text } }] })
    }

    fn run_tools(llm: &FakeLlm, max_steps: usize) -> Result<String> {
        let client = HttpLlm::from_config("openai", llm.base(), "m", "k", 0.7, false).unwrap();
        client.run_tools("SYS", "seed", &defs(), &EchoBox, 2048, max_steps)
    }

    #[test]
    fn the_last_step_withholds_the_tools_and_asks_for_the_answer() {
        let llm = FakeLlm::routed(|body| match body.get("tool_choice") {
            Some(_) => (200, answer(r#"{"members":["t2"]}"#)),
            None => (200, tool_call()),
        });

        let reply = run_tools(&llm, 3).unwrap();

        let sent = llm.requests();
        assert_eq!(reply, r#"{"members":["t2"]}"#);
        assert_eq!(sent.len(), 3);
        assert!(sent[1].get("tool_choice").is_none());
        assert_eq!(sent[2]["tool_choice"], "none");
        assert_eq!(
            sent[2]["messages"].as_array().unwrap().last().unwrap()["content"],
            CLOSING_NOTE
        );
    }

    #[test]
    fn a_model_that_answers_early_is_never_sent_the_closing_note() {
        let llm = FakeLlm::routed(|_| (200, answer("done")));

        let reply = run_tools(&llm, 3).unwrap();

        assert_eq!(reply, "done");
        assert_eq!(llm.requests().len(), 1);
    }

    #[test]
    fn a_model_that_still_calls_a_tool_on_the_closing_turn_exhausts_the_loop() {
        let llm = FakeLlm::routed(|_| (200, tool_call()));

        let err = run_tools(&llm, 3).unwrap_err();

        assert_eq!(
            err.to_string(),
            "LLM tool loop exhausted 3 steps without a final answer"
        );
    }

    #[test]
    fn a_turn_cut_short_before_any_text_or_call_fails_the_run() {
        let llm = FakeLlm::routed(|_| {
            (
                200,
                json!({ "choices": [{ "finish_reason": "length", "message": { "content": null } }],
                          "usage": { "completion_tokens": 2048 } }),
            )
        });

        let err = run_tools(&llm, 3).unwrap_err();

        assert!(err.downcast_ref::<CutShort>().is_some(), "{err}");
        assert_eq!(llm.requests().len(), 1);
    }
}

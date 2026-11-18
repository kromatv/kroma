use std::fmt;

use serde_json::Value;

/// A reply that stopped at its token budget before any answer: the model spent
/// the whole budget, usually on reasoning.
#[derive(Debug, PartialEq, Eq)]
pub(super) struct CutShort {
    stop: String,
    spent: Option<u64>,
    reasoning: Option<u64>,
}

impl CutShort {
    pub(super) fn openai(v: &Value) -> Option<Self> {
        let choice = v.pointer("/choices/0")?;
        let reason = choice.get("finish_reason").and_then(Value::as_str)?;
        (reason == "length").then(|| Self {
            stop: format!("finish_reason {reason}"),
            spent: v
                .pointer("/usage/completion_tokens")
                .and_then(Value::as_u64),
            reasoning: v
                .pointer("/usage/completion_tokens_details/reasoning_tokens")
                .and_then(Value::as_u64),
        })
    }

    pub(super) fn anthropic(v: &Value) -> Option<Self> {
        let reason = v.get("stop_reason").and_then(Value::as_str)?;
        (reason == "max_tokens").then(|| Self {
            stop: format!("stop_reason {reason}"),
            spent: v.pointer("/usage/output_tokens").and_then(Value::as_u64),
            reasoning: None,
        })
    }
}

impl fmt::Display for CutShort {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "the model spent its whole token budget before writing an answer ({}",
            self.stop
        )?;
        if let Some(spent) = self.spent {
            write!(f, ", {spent} tokens out")?;
        }
        if let Some(reasoning) = self.reasoning {
            write!(f, ", {reasoning} of them reasoning")?;
        }
        f.write_str(")")
    }
}

impl std::error::Error for CutShort {}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn a_reply_cut_short_while_reasoning_names_the_tokens_it_spent() {
        let reply = json!({
            "choices": [{ "finish_reason": "length", "message": { "content": null } }],
            "usage": { "completion_tokens": 900, "completion_tokens_details": { "reasoning_tokens": 900 } },
        });

        let cut = CutShort::openai(&reply).unwrap();

        assert_eq!(
            cut.to_string(),
            "the model spent its whole token budget before writing an answer \
             (finish_reason length, 900 tokens out, 900 of them reasoning)"
        );
    }

    #[test]
    fn a_reply_that_stopped_on_its_own_was_not_cut_short() {
        let reply =
            json!({ "choices": [{ "finish_reason": "stop", "message": { "content": "" } }] });

        assert_eq!(CutShort::openai(&reply), None);
    }

    #[test]
    fn a_claude_reply_cut_short_names_its_stop_reason_and_output() {
        let reply = json!({ "stop_reason": "max_tokens", "usage": { "output_tokens": 1924 } });

        let cut = CutShort::anthropic(&reply).unwrap();

        assert_eq!(
            cut.to_string(),
            "the model spent its whole token budget before writing an answer \
             (stop_reason max_tokens, 1924 tokens out)"
        );
    }
}

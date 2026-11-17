use serde_json::{json, Value};

use super::super::ask::{Ask, Reasoning};

/// Spells the setting in OpenRouter's `reasoning` object, whose cap counts
/// against the request's `max_tokens` (docs/reference/llm-providers.md).
pub(super) fn set_budget(body: &mut Value, ask: &Ask<'_>) {
    match ask.reasoning {
        Reasoning::Off => {
            body["max_tokens"] = json!(ask.answer_tokens);
            body["reasoning"] = json!({ "enabled": false });
        }
        Reasoning::On => {
            body["max_tokens"] = json!(ask.tokens_with_reasoning());
            body["reasoning"] = json!({ "max_tokens": ask.reasoning_tokens() });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infra::llm::http::ask::ToolChoice;
    use crate::infra::llm::http::providers::test_support::{ask, defs};
    use crate::infra::llm::http::providers::{OpenAi, Provider};

    #[test]
    fn reasoning_off_reaches_openrouter_as_its_off_switch() {
        let body = OpenAi::openrouter().chat_body(&ask(Reasoning::Off, 900), "hi");

        assert_eq!(body["reasoning"], json!({ "enabled": false }));
        assert_eq!(body["max_tokens"], 900);
    }

    #[test]
    fn reasoning_on_gets_its_own_budget_on_top_of_the_answer() {
        let body = OpenAi::openrouter().chat_body(&ask(Reasoning::On, 900), "hi");

        assert_eq!(body["reasoning"], json!({ "max_tokens": 1024 }));
        assert_eq!(body["max_tokens"], 1924);
    }

    #[test]
    fn a_long_answer_leaves_as_much_again_to_reason_with() {
        let body = OpenAi::openrouter().chat_body(&ask(Reasoning::On, 4096), "hi");

        assert_eq!(body["reasoning"], json!({ "max_tokens": 4096 }));
        assert_eq!(body["max_tokens"], 8192);
    }

    #[test]
    fn a_tool_turn_carries_the_same_reasoning_control() {
        let body = OpenAi::openrouter().tools_request(
            &ask(Reasoning::Off, 2048),
            &[],
            &defs(),
            ToolChoice::Auto,
        );

        assert_eq!(body["reasoning"], json!({ "enabled": false }));
        assert_eq!(body["max_tokens"], 2048);
    }
}

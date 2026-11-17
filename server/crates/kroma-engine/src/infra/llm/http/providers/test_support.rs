use anyhow::Result;
use serde_json::{json, Value};

use super::super::super::tools::{ToolBox, ToolDef};
use super::super::ask::{Ask, Reasoning};

pub(in crate::infra::llm::http) fn ask(reasoning: Reasoning, answer_tokens: u32) -> Ask<'static> {
    Ask {
        model: "m",
        system: "SYS",
        answer_tokens,
        temperature: 0.5,
        reasoning,
    }
}

pub(in crate::infra::llm::http) fn defs() -> Vec<ToolDef> {
    vec![ToolDef {
        name: "find_titles".into(),
        description: "list titles".into(),
        schema: json!({ "type": "object", "properties": { "genre": { "type": "string" } } }),
    }]
}

pub(in crate::infra::llm::http) struct EchoBox;

impl ToolBox for EchoBox {
    fn defs(&self) -> Vec<ToolDef> {
        defs()
    }
    fn call(&self, name: &str, args: &Value) -> Result<String> {
        Ok(json!({ "echo": name, "args": args }).to_string())
    }
}

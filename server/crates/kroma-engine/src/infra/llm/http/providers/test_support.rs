use anyhow::Result;
use serde_json::{json, Value};

use super::super::super::tools::{ToolBox, ToolDef};

pub(super) fn defs() -> Vec<ToolDef> {
    vec![ToolDef {
        name: "find_titles".into(),
        description: "list titles".into(),
        schema: json!({ "type": "object", "properties": { "genre": { "type": "string" } } }),
    }]
}

pub(super) struct EchoBox;

impl ToolBox for EchoBox {
    fn defs(&self) -> Vec<ToolDef> {
        defs()
    }
    fn call(&self, name: &str, args: &Value) -> Result<String> {
        Ok(json!({ "echo": name, "args": args }).to_string())
    }
}

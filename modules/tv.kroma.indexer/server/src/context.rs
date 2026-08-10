//! The evaluation context for definition templates and filters.

use std::collections::HashMap;

use crate::definition::Definition;
use crate::IndexerConfig;

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Str(String),
    Bool(bool),
    List(Vec<String>),
    Nil,
}

impl Value {
    /// Go-template truthiness.
    pub fn truthy(&self) -> bool {
        match self {
            Value::Str(s) => !s.is_empty(),
            Value::Bool(b) => *b,
            Value::List(l) => !l.is_empty(),
            Value::Nil => false,
        }
    }

    pub fn render(&self) -> String {
        match self {
            Value::Str(s) => s.clone(),
            Value::Bool(b) => b.to_string(),
            Value::List(l) => l.join(" "),
            Value::Nil => String::new(),
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct Context {
    pub keywords: String,
    pub categories: Vec<String>,
    pub config: HashMap<String, Value>,
    pub query: HashMap<String, String>,
    pub result: HashMap<String, String>,
    pub dot: Option<Value>,
}

impl Context {
    /// Definition settings overlaid with the admin-entered [`IndexerConfig`].
    pub fn with_config(def: &Definition, cfg: &IndexerConfig) -> Self {
        let mut config = HashMap::new();
        for s in &def.settings {
            let raw = cfg
                .settings
                .get(&s.name)
                .cloned()
                .or_else(|| s.default.clone());
            let value = match s.kind.as_str() {
                "checkbox" => Value::Bool(matches!(
                    raw.as_deref(),
                    Some("true") | Some("1") | Some("yes") | Some("on")
                )),
                // info_* settings are display-only.
                k if k.starts_with("info") => continue,
                _ => Value::Str(raw.unwrap_or_default()),
            };
            config.insert(s.name.clone(), value);
        }
        // Templates always expect the site link as `.Config.sitelink`.
        config.insert("sitelink".to_string(), Value::Str(cfg.base_url.clone()));
        Context { config, ..Default::default() }
    }

    /// `[]` is the bare dot; unknown paths resolve to [`Value::Nil`].
    pub fn resolve(&self, path: &[&str]) -> Value {
        match path {
            [] => self.dot.clone().unwrap_or(Value::Nil),
            ["True"] => Value::Bool(true),
            ["False"] => Value::Bool(false),
            ["Keywords"] => Value::Str(self.keywords.clone()),
            ["Categories"] => Value::List(self.categories.clone()),
            ["Config", key] => self.config.get(*key).cloned().unwrap_or(Value::Nil),
            ["Query", key] => {
                self.query.get(*key).map(|s| Value::Str(s.clone())).unwrap_or(Value::Nil)
            }
            ["Result", key] => {
                self.result.get(*key).map(|s| Value::Str(s.clone())).unwrap_or(Value::Nil)
            }
            _ => Value::Nil,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_list_value_is_truthy_only_when_it_has_members_and_renders_space_joined() {
        assert!(Value::List(vec!["a".into(), "b".into()]).truthy());
        assert!(!Value::List(Vec::new()).truthy());
        assert_eq!(Value::List(vec!["100".into(), "200".into()]).render(), "100 200");
        assert_eq!(Value::List(Vec::new()).render(), "");
    }

    #[test]
    fn a_path_the_context_does_not_model_resolves_to_nil_rather_than_panicking() {
        let ctx = Context { keywords: "kw".into(), ..Context::default() };
        assert_eq!(ctx.resolve(&["Keywords"]), Value::Str("kw".into()));
        assert_eq!(ctx.resolve(&["Config", "sitelink", "extra"]), Value::Nil);
        assert_eq!(ctx.resolve(&["Whatever"]), Value::Nil);
        assert_eq!(ctx.resolve(&[]), Value::Nil);
    }
}

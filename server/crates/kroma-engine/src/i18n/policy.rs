//! The policy file beside the locale folders, `i18n.json`, as the server reads
//! it: which language the messages are written in, how far each other one has
//! come, and what an unfinished one reads in. The TypeScript half of the same
//! rules is `packages/i18n/src/project.ts`. `build.rs` compiles this file
//! into the build script, and the tests of `i18n.rs` compile it again.

use std::collections::BTreeMap;

use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stage {
    Draft,
    Beta,
    Stable,
}

#[derive(Debug, Default)]
struct LocalePolicy {
    stage: Option<Stage>,
    fallback: Option<String>,
}

#[derive(Debug)]
pub struct Policy {
    pub source: String,
    pub fallback: Option<String>,
    locales: BTreeMap<String, LocalePolicy>,
}

fn text(value: &Value, field: &str) -> Option<String> {
    value.get(field)?.as_str().map(str::to_owned)
}

impl Policy {
    pub fn parse(json: &str) -> Result<Policy, String> {
        let root: Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
        let source = text(&root, "source").ok_or("`source` is missing")?;
        let mut locales = BTreeMap::new();
        if let Some(named) = root.get("locales").and_then(Value::as_object) {
            for (code, policy) in named {
                let stage = match text(policy, "stage").as_deref() {
                    None => None,
                    Some("draft") => Some(Stage::Draft),
                    Some("beta") => Some(Stage::Beta),
                    Some("stable") => Some(Stage::Stable),
                    Some(other) => return Err(format!("`{code}` has the unknown stage `{other}`")),
                };
                let fallback = text(policy, "fallback");
                locales.insert(code.clone(), LocalePolicy { stage, fallback });
            }
        }
        Ok(Policy {
            source,
            fallback: text(&root, "fallback"),
            locales,
        })
    }

    /// A folder the file does not name is a draft; the source is always stable.
    pub fn stage(&self, locale: &str) -> Stage {
        if locale == self.source {
            return Stage::Stable;
        }
        self.locales
            .get(locale)
            .and_then(|policy| policy.stage)
            .unwrap_or(Stage::Draft)
    }

    /// Whether a reader can be offered `locale`: anything past a draft.
    pub fn offered(&self, locale: &str) -> bool {
        self.stage(locale) != Stage::Draft
    }

    /// The locales a message is looked up in when `locale` renders, itself
    /// first: its own fallback where the file names one, else the languages its
    /// tag is a region of, then the project's fallback, then the source.
    pub fn chain(&self, locale: &str, exists: &dyn Fn(&str) -> bool) -> Vec<String> {
        let mut chain: Vec<String> = Vec::new();
        let mut visited: Vec<String> = Vec::new();
        self.visit(locale, exists, &mut chain, &mut visited);
        if let Some(fallback) = &self.fallback {
            self.visit(fallback, exists, &mut chain, &mut visited);
        }
        push(&mut chain, &self.source, exists);
        if !chain.iter().any(|code| code == locale) {
            chain.insert(0, locale.to_owned());
        }
        chain
    }

    fn visit(
        &self,
        code: &str,
        exists: &dyn Fn(&str) -> bool,
        chain: &mut Vec<String>,
        visited: &mut Vec<String>,
    ) {
        if visited.iter().any(|seen| seen == code) {
            return;
        }
        visited.push(code.to_owned());
        push(chain, code, exists);
        match self.locales.get(code).and_then(|p| p.fallback.as_deref()) {
            Some(named) => self.visit(named, exists, chain, visited),
            None => {
                for parent in parents(code) {
                    push(chain, parent, exists);
                }
            }
        }
    }
}

fn push(chain: &mut Vec<String>, code: &str, exists: &dyn Fn(&str) -> bool) {
    if exists(code) && !chain.iter().any(|known| known == code) {
        chain.push(code.to_owned());
    }
}

// `pt-BR` gives `pt`; `zh-Hant-TW` gives `zh-Hant`, then `zh`.
fn parents(tag: &str) -> Vec<&str> {
    let mut found = Vec::new();
    let mut rest = tag;
    while let Some(cut) = rest.rfind('-') {
        rest = &rest[..cut];
        found.push(rest);
    }
    found
}

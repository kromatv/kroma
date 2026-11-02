//! The operator's network rules as stored in the `networkRules` setting, and
//! the validation every write passes before it is stored.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// The settings key the rules live under. Not one the generic settings
/// endpoint writes: only [`super::Network::set_rules`] does, after validation.
pub const SETTING_KEY: &str = "networkRules";

pub const MAX_BODY_BYTES: usize = 64 * 1024;

const MAX_RULES: usize = 200;
const MAX_ID_CHARS: usize = 64;
const MAX_CALLER_CHARS: usize = 128;
const MAX_PURPOSE_CHARS: usize = 64;
const MAX_HOST_CHARS: usize = 253;
const MAX_NOTE_CHARS: usize = 500;
const MAX_NETWORK_CHARS: usize = 64;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NetworkRules {
    pub default_action: DefaultAction,
    pub rules: Vec<Rule>,
}

/// What a call no rule matches gets. `Allow` sends it direct.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DefaultAction {
    #[default]
    Allow,
    Block,
}

/// One rule. Each of `caller`, `purpose`, `host`, `port` and `address` must match
/// when set; `host` is an exact name or address, or `*.suffix` for the suffix and
/// every name under it, and `address` is a range (`10.0.0.0/8`) a literal address
/// falls in, since a name is not resolved to decide where it goes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Rule {
    pub id: String,
    pub caller: Option<String>,
    pub purpose: Option<String>,
    pub host: Option<String>,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub address: Option<String>,
    pub action: Action,
    pub note: Option<String>,
}

/// What a matching rule does: send the call direct, refuse it, or send it through
/// the network of that name. On the wire it is one word.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action {
    Direct,
    Block,
    Network(String),
}

impl Serialize for Action {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(match self {
            Action::Direct => "direct",
            Action::Block => "block",
            Action::Network(name) => name,
        })
    }
}

impl<'de> Deserialize<'de> for Action {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Ok(match String::deserialize(deserializer)?.as_str() {
            "direct" => Action::Direct,
            "block" => Action::Block,
            name => Action::Network(name.to_string()),
        })
    }
}

/// Why a rules write was refused. [`RulesError::code`] is what the API answers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RulesError {
    TooManyRules,
    InvalidId(String),
    DuplicateId(String),
    InvalidCaller(String),
    InvalidPurpose(String),
    InvalidHost(String),
    InvalidAddress(String),
    InvalidNetwork(String),
    InvalidNote,
}

impl RulesError {
    pub fn code(&self) -> &'static str {
        match self {
            RulesError::TooManyRules => "too_many_rules",
            RulesError::InvalidId(_) => "invalid_rule_id",
            RulesError::DuplicateId(_) => "duplicate_rule_id",
            RulesError::InvalidCaller(_) => "invalid_caller",
            RulesError::InvalidPurpose(_) => "invalid_purpose",
            RulesError::InvalidHost(_) => "invalid_host",
            RulesError::InvalidAddress(_) => "invalid_address",
            RulesError::InvalidNetwork(_) => "invalid_network",
            RulesError::InvalidNote => "invalid_note",
        }
    }
}

impl std::fmt::Display for RulesError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RulesError::TooManyRules => write!(f, "at most {MAX_RULES} rules"),
            RulesError::InvalidId(id) => write!(f, "invalid rule id: {id:?}"),
            RulesError::DuplicateId(id) => write!(f, "two rules share the id {id:?}"),
            RulesError::InvalidCaller(caller) => write!(f, "invalid caller: {caller:?}"),
            RulesError::InvalidPurpose(purpose) => write!(f, "invalid purpose: {purpose:?}"),
            RulesError::InvalidHost(host) => write!(f, "invalid host: {host:?}"),
            RulesError::InvalidAddress(range) => write!(f, "invalid address range: {range:?}"),
            RulesError::InvalidNetwork(name) => write!(f, "invalid network name: {name:?}"),
            RulesError::InvalidNote => write!(f, "a note is at most {MAX_NOTE_CHARS} characters"),
        }
    }
}

impl std::error::Error for RulesError {}

impl NetworkRules {
    /// The stored rules, or the defaults (allow, no rules) when nothing valid is
    /// stored.
    pub fn from_setting(value: Value) -> Self {
        serde_json::from_value::<Self>(value)
            .ok()
            .and_then(|rules| rules.validated().ok())
            .unwrap_or_default()
    }

    /// These rules with every host lowercased and trimmed, or the first reason
    /// they cannot be stored.
    pub fn validated(mut self) -> Result<Self, RulesError> {
        if self.rules.len() > MAX_RULES {
            return Err(RulesError::TooManyRules);
        }
        let mut seen = std::collections::HashSet::new();
        for rule in &mut self.rules {
            rule.host = rule
                .host
                .take()
                .map(|host| host.trim().trim_end_matches('.').to_ascii_lowercase());
            check(rule)?;
            if !seen.insert(rule.id.clone()) {
                return Err(RulesError::DuplicateId(rule.id.clone()));
            }
        }
        Ok(self)
    }
}

fn check(rule: &Rule) -> Result<(), RulesError> {
    if !is_token(&rule.id, MAX_ID_CHARS, |c| {
        c.is_ascii_alphanumeric() || matches!(c, '-' | '_')
    }) {
        return Err(RulesError::InvalidId(rule.id.clone()));
    }
    if let Some(caller) = &rule.caller {
        if !is_token(caller, MAX_CALLER_CHARS, |c| {
            c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_')
        }) {
            return Err(RulesError::InvalidCaller(caller.clone()));
        }
    }
    if let Some(purpose) = &rule.purpose {
        if !is_token(purpose, MAX_PURPOSE_CHARS, |c| {
            c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_')
        }) {
            return Err(RulesError::InvalidPurpose(purpose.clone()));
        }
    }
    if let Some(host) = &rule.host {
        if !is_host_pattern(host) {
            return Err(RulesError::InvalidHost(host.clone()));
        }
    }
    if let Some(range) = &rule.address {
        if address_range(range).is_none() {
            return Err(RulesError::InvalidAddress(range.clone()));
        }
    }
    if let Action::Network(name) = &rule.action {
        if !is_token(name, MAX_NETWORK_CHARS, |c| {
            c.is_ascii_alphanumeric() || matches!(c, '-' | '_')
        }) {
            return Err(RulesError::InvalidNetwork(name.clone()));
        }
    }
    if let Some(note) = &rule.note {
        if note.chars().count() > MAX_NOTE_CHARS {
            return Err(RulesError::InvalidNote);
        }
    }
    Ok(())
}

pub(super) fn address_range(range: &str) -> Option<(std::net::IpAddr, u32)> {
    let (address, bits) = range.split_once('/')?;
    let address: std::net::IpAddr = address.parse().ok()?;
    let bits: u32 = bits.parse().ok()?;
    let width = if address.is_ipv4() { 32 } else { 128 };
    (bits <= width).then_some((address, bits))
}

fn is_token(value: &str, max_chars: usize, allowed: impl Fn(char) -> bool) -> bool {
    !value.is_empty() && value.len() <= max_chars && value.chars().all(allowed)
}

fn is_host_pattern(host: &str) -> bool {
    let name = host.strip_prefix("*.").unwrap_or(host);
    is_token(name, MAX_HOST_CHARS, |c| {
        c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '-' | ':')
    }) && !name.starts_with('.')
}

#[cfg(test)]
mod tests;

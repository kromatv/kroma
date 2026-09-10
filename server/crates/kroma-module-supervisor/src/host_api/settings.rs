//! The settings half of the callback API: one typed read, one batched write, and
//! the two declarations that decide which of the core's keys the caller gets.

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::{Extension, Json};
use kroma_module_host::{HostCtx, SettingReach, SettingReachOf};
use serde_json::{json, Value};

use super::Caller;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Use {
    Read,
    Write,
}

#[derive(serde::Deserialize)]
pub(super) struct SettingQuery {
    key: String,
    kind: String,
    default: String,
}

#[derive(serde::Deserialize)]
pub(super) struct SettingsPatch {
    patch: std::collections::BTreeMap<String, Value>,
}

fn asked_with(q: &SettingQuery) -> Value {
    match q.kind.as_str() {
        "bool" => json!(q.default == "true"),
        "i64" => json!(q.default.parse::<i64>().unwrap_or(0)),
        _ => json!(q.default),
    }
}

fn declares(caller: &Caller, key: &str, how: Use) -> bool {
    match how {
        Use::Read => caller.declares_read(key),
        Use::Write => caller.declares_write(key),
    }
}

fn may_reach(reach: SettingReach, caller: &Caller, key: &str, how: Use) -> bool {
    match reach {
        SettingReach::Unknown | SettingReach::CoreOnly => false,
        SettingReach::Declared => declares(caller, key, how),
        SettingReach::Any => true,
    }
}

fn log_a_refusal(reach: SettingReach, caller: &Caller, key: &str) {
    if reach == SettingReach::Unknown {
        tracing::debug!(
            module = %caller.name(),
            key = %key,
            "a module reached for a setting the core does not have",
        );
        return;
    }
    tracing::warn!(
        module = %caller.name(),
        key = %key,
        "a module reached for a setting it may not have",
    );
}

fn log_a_reach_the_declaration_omits(caller: &Caller, key: &str, how: Use) {
    if caller.declares_nothing() || declares(caller, key, how) {
        return;
    }
    tracing::debug!(
        module = %caller.name(),
        key = %key,
        write = how == Use::Write,
        "a module reached a setting its manifest does not declare",
    );
}

pub(super) async fn get_setting<S: HostCtx>(
    State(host): State<S>,
    Extension(SettingReachOf(reach)): Extension<SettingReachOf>,
    Extension(caller): Extension<Caller>,
    Query(q): Query<SettingQuery>,
) -> Json<Value> {
    let asked_for = reach(&q.key);
    if !may_reach(asked_for, &caller, &q.key, Use::Read) {
        log_a_refusal(asked_for, &caller, &q.key);
        return Json(json!({ "value": asked_with(&q) }));
    }
    log_a_reach_the_declaration_omits(&caller, &q.key, Use::Read);
    let value = match q.kind.as_str() {
        "bool" => json!(host.setting_bool(&q.key, q.default == "true")),
        "i64" => json!(host.setting_i64(&q.key, q.default.parse().unwrap_or(0))),
        _ => json!(host.setting_str(&q.key, &q.default)),
    };
    Json(json!({ "value": value }))
}

pub(super) async fn set_settings<S: HostCtx>(
    State(host): State<S>,
    Extension(SettingReachOf(reach)): Extension<SettingReachOf>,
    Extension(caller): Extension<Caller>,
    Json(body): Json<SettingsPatch>,
) -> StatusCode {
    if let Some(key) = body
        .patch
        .keys()
        .find(|key| !may_reach(reach(key), &caller, key, Use::Write))
    {
        log_a_refusal(reach(key), &caller, key);
        return StatusCode::FORBIDDEN;
    }
    for key in body.patch.keys() {
        log_a_reach_the_declaration_omits(&caller, key, Use::Write);
    }
    host.set_settings(body.patch);
    StatusCode::NO_CONTENT
}

#[cfg(test)]
mod tests {
    use super::*;

    fn query(kind: &str, default: &str) -> SettingQuery {
        SettingQuery {
            key: "anything".to_string(),
            kind: kind.to_string(),
            default: default.to_string(),
        }
    }

    #[test]
    fn a_withheld_key_answers_in_the_type_the_caller_asked_with() {
        assert_eq!(asked_with(&query("bool", "true")), json!(true));
        assert_eq!(asked_with(&query("bool", "nope")), json!(false));
        assert_eq!(asked_with(&query("i64", "42")), json!(42));
        assert_eq!(asked_with(&query("i64", "not a number")), json!(0));
        assert_eq!(asked_with(&query("str", "fallback")), json!("fallback"));
    }
}

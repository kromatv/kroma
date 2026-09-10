//! The settings half of the callback API: one typed read, one batched write, and
//! the keys the core answers for itself rather than for a sidecar.

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::{Extension, Json};
use kroma_module_host::HostCtx;
use serde_json::{json, Value};

/// Asks the core whether a settings key is withheld from a module. `true` means
/// no sidecar reads or writes it through the callback: the supervisor carries the
/// question, the core owns the answer.
#[derive(Clone, Copy)]
pub struct WithheldSettings(pub fn(&str) -> bool);

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

pub(super) async fn get_setting<S: HostCtx>(
    State(host): State<S>,
    Extension(WithheldSettings(withheld)): Extension<WithheldSettings>,
    Query(q): Query<SettingQuery>,
) -> Json<Value> {
    if withheld(&q.key) {
        tracing::warn!(key = %q.key, "a module asked for a setting the core keeps to itself");
        return Json(json!({ "value": asked_with(&q) }));
    }
    let value = match q.kind.as_str() {
        "bool" => json!(host.setting_bool(&q.key, q.default == "true")),
        "i64" => json!(host.setting_i64(&q.key, q.default.parse().unwrap_or(0))),
        _ => json!(host.setting_str(&q.key, &q.default)),
    };
    Json(json!({ "value": value }))
}

pub(super) async fn set_settings<S: HostCtx>(
    State(host): State<S>,
    Extension(WithheldSettings(withheld)): Extension<WithheldSettings>,
    Json(body): Json<SettingsPatch>,
) -> StatusCode {
    if let Some(key) = body.patch.keys().find(|key| withheld(key)) {
        tracing::warn!(key = %key, "refusing a module's write to a setting the core keeps to itself");
        return StatusCode::FORBIDDEN;
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

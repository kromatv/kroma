//! The settings half of the callback API: one typed read and one batched write,
//! each answered only for a key the core hands out and the calling module
//! declared for that use.

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::{Extension, Json};
use kroma_module_host::{HostCtx, SettingReach, SettingReachOf, json_error};
use serde_json::{Value, json};

use super::Caller;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Use {
    Read,
    Write,
}

impl Use {
    fn declaration(self) -> &'static str {
        match self {
            Use::Read => "settings.read",
            Use::Write => "settings.write",
        }
    }
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

fn declares(caller: &Caller, key: &str, how: Use) -> bool {
    match how {
        Use::Read => caller.declares_read(key),
        Use::Write => caller.declares_write(key),
    }
}

fn refusal(reach: SettingReach, caller: &Caller, key: &str, how: Use) -> Option<String> {
    let declaration = how.declaration();
    match reach {
        SettingReach::Unknown => Some(format!(
            "{declaration}: \"{key}\" is not a setting of this server"
        )),
        SettingReach::CoreOnly => Some(format!(
            "{declaration}: \"{key}\" is the core's own and reaches no module, declared or not"
        )),
        SettingReach::Declared if declares(caller, key, how) => None,
        SettingReach::Declared => Some(format!(
            "{declaration}: \"{key}\" is not declared; add it to {declaration} in module.json"
        )),
    }
}

fn refused(caller: &Caller, refusal: &str) -> Response {
    tracing::warn!(module = %caller.name(), refusal = %refusal, "a module reached for a setting");
    caller.say(&format!("WARN {refusal}"));
    json_error(StatusCode::FORBIDDEN, refusal)
}

pub(super) async fn get_setting<S: HostCtx>(
    State(host): State<S>,
    Extension(SettingReachOf(reach)): Extension<SettingReachOf>,
    Extension(caller): Extension<Caller>,
    Query(q): Query<SettingQuery>,
) -> Response {
    if let Some(refusal) = refusal(reach(&q.key), &caller, &q.key, Use::Read) {
        return refused(&caller, &refusal);
    }
    let value = match q.kind.as_str() {
        "bool" => json!(host.setting_bool(&q.key, q.default == "true")),
        "i64" => json!(host.setting_i64(&q.key, q.default.parse().unwrap_or(0))),
        _ => json!(host.setting_str(&q.key, &q.default)),
    };
    Json(json!({ "value": value })).into_response()
}

pub(super) async fn set_settings<S: HostCtx>(
    State(host): State<S>,
    Extension(SettingReachOf(reach)): Extension<SettingReachOf>,
    Extension(caller): Extension<Caller>,
    Json(body): Json<SettingsPatch>,
) -> Response {
    if let Some(refusal) = body
        .patch
        .keys()
        .find_map(|key| refusal(reach(key), &caller, key, Use::Write))
    {
        return refused(&caller, &refusal);
    }
    host.set_settings(body.patch);
    StatusCode::NO_CONTENT.into_response()
}

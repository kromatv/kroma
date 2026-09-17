//! Settings management: the grouped settings schema (+ current values) and a
//! patch endpoint that persists changes to the settings store.

use std::collections::BTreeMap;

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::api::error::{json_error, lerr};
use crate::api::extract::AuthUser;
use crate::infra::events::ServerEvent;
use crate::model::Permission;
use crate::services::email::{self, RelayError};
use crate::services::settings::{self, EmailDelivery};
use crate::state::SharedState;
use axum::routing::{get, post};
use axum::Router;

/// Admin settings. Paths are relative to the `/api/admin` nest.
pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/settings", get(get_settings).put(put_settings))
        .route("/settings/smtp-test", post(smtp_test))
        .route("/settings/relay-test", post(relay_test))
}

#[derive(Debug, Deserialize)]
pub struct SettingsQuery {
    #[serde(default)]
    pub view: Option<String>,
}

/// `GET /api/admin/settings?view=general|network|transcoder` → grouped schema +
/// current values.
pub async fn get_settings(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Query(q): Query<SettingsQuery>,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let view = q.view.unwrap_or_else(|| "general".into());
    let groups = settings::groups(
        &view,
        &state.settings,
        &state.config,
        super::user_locale(&user),
    );
    Ok(Json(crate::api::dto::SettingsView { view, groups }).into_response())
}

/// `PUT /api/admin/settings` body = `{ key: value, … }` → persist a patch.
pub async fn put_settings(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(patch): Json<BTreeMap<String, Value>>,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let written = state.settings.set_patch(&state.db, patch);
    // The HLS engine caches its disk budget; refresh it so a new
    // `transcodeCacheLimit` takes effect live (next reaper sweep) without a restart.
    if written.iter().any(|k| k == "transcodeCacheLimit") {
        state
            .hls
            .set_cache_budget(settings::transcode_cache_limit_bytes(&state.settings));
    }
    // The ffmpeg concurrency gate caches its budget; refresh it so a new
    // `mediaConcurrency` throttles (or opens up) background media work live.
    if written.iter().any(|k| k == "mediaConcurrency") {
        crate::infra::ffmpeg_gate::set_capacity(settings::media_workers(&state.settings));
    }
    // A server that booted with the switch off has no identifier, and the moment
    // it is switched on the settings page has to name one: it is what an operator
    // quotes to have their row erased.
    if written.iter().any(|k| k == settings::stats::ENABLED_KEY) {
        settings::stats::ensure_identity(&state.settings, &state.db);
    }
    // The embedded torrent engine's listen port / rate limits (rqbit*) are owned
    // by the Downloads sidecar now; it applies them on its next engine (re)start.
    // The SettingsUpdated event below is the signal a live-reconfig would key on.
    state.events.publish(ServerEvent::SettingsUpdated);
    Ok(Json(json!({ "updated": written })).into_response())
}

/// `POST /api/admin/settings/smtp-test` → send a short probe to the caller's own
/// address with the saved SMTP settings. The answer names the address it went
/// to; a failure carries the localized reason plus the transport's own words.
pub async fn smtp_test(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let loc = super::user_locale(&user);
    if settings::email_delivery(&state.settings) != EmailDelivery::Smtp {
        return Err(lerr(loc, StatusCode::BAD_REQUEST, "admin.smtpTestDisabled"));
    }
    if let Err(e) = email::send_test(&state.settings, &user.email, loc).await {
        let prefix = crate::i18n::t(loc, "admin.smtpTestFailed", &[]);
        return Err(json_error(StatusCode::BAD_GATEWAY, &format!("{prefix}: {e}")));
    }
    Ok(Json(json!({ "sentTo": user.email })).into_response())
}

/// `POST /api/admin/settings/relay-test` → send a short probe to the caller's
/// own address through the kroma.tv relay. It registers this server with the
/// relay if it has not yet; a mailbox that has not allowed the server is told
/// so, and a verification from the member editor is what asks it.
pub async fn relay_test(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let loc = super::user_locale(&user);
    if settings::email_delivery(&state.settings) != EmailDelivery::Relay {
        return Err(lerr(loc, StatusCode::BAD_REQUEST, "admin.relayTestDisabled"));
    }
    let Some(origin) = super::web_base(&state) else {
        return Err(lerr(loc, StatusCode::BAD_REQUEST, "admin.relayTestNoAddress"));
    };
    let target = email::RelayTarget {
        url: super::relay_url(&state),
        origin: &origin,
    };
    match email::relay_test(&state.settings, &state.db, &target, &user.email, loc).await {
        Ok(()) => Ok(Json(json!({ "sentTo": user.email })).into_response()),
        Err(RelayError::ConsentRequired | RelayError::Gone) => Err(lerr(
            loc,
            StatusCode::BAD_REQUEST,
            "admin.relayTestUnconfirmed",
        )),
        Err(e) => {
            let prefix = crate::i18n::t(loc, "admin.relayTestFailed", &[]);
            Err(json_error(StatusCode::BAD_GATEWAY, &format!("{prefix}: {e}")))
        }
    }
}

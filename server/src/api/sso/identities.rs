use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;

use super::finish::FlowKeys;
use super::{now, provider_name, sign_in_config};
use crate::api::dto::IdentityView;
use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::i18n::ReqLocale;
use crate::model::{Permission, User};
use crate::services::settings::SignIn;
use crate::services::sso::admit::{self, Outcome};
use crate::services::sso::flows::Collected;
use crate::state::SharedState;

/// `GET /api/auth/me/identities` (Bearer) → `IdentityView[]`, newest first.
pub async fn list(State(state): State<SharedState>, AuthUser(user): AuthUser) -> Response {
    let config = sign_in_config(&state);
    match query(&state.db, move |pool| db::list_identities(&pool, &user.id)).await {
        Ok(rows) => Json(
            rows.into_iter()
                .map(|row| IdentityView {
                    provider: provider_name(&config, &row.issuer),
                    id: row.id,
                    name: row.label,
                    created_at: row.created_at,
                    last_used: row.last_used,
                })
                .collect::<Vec<_>>(),
        )
        .into_response(),
        Err(resp) => resp,
    }
}

/// Whether `means` still lets `user` sign in: a password counts while
/// passwords are on, or always for whoever can change that setting, and a
/// passkey counts while passkeys are on.
pub(crate) fn has_a_way_in(config: &SignIn, user: &User, means: db::SignInMeans) -> bool {
    let password_works = config.password() || user.permissions.contains(&Permission::SettingsManage);
    (means.password && password_works)
        || (config.passkeys() && means.passkeys > 0)
        || means.identities > 0
}

/// `DELETE /api/auth/me/identities/:id` (Bearer) → 204. `409` when it is the
/// account's last way in, `404` when the identity is not the caller's.
pub async fn unlink(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Response {
    let config = sign_in_config(&state);
    let removed = query(&state.db, move |pool| {
        let mut means = db::sign_in_means(&pool, &user.id)?;
        means.identities -= 1;
        if !has_a_way_in(&config, &user, means) {
            return Ok(None);
        }
        db::unlink_identity(&pool, &user.id, &id).map(Some)
    })
    .await;
    match removed {
        Ok(Some(true)) => StatusCode::NO_CONTENT.into_response(),
        Ok(Some(false)) => lerr(loc, StatusCode::NOT_FOUND, "sso.identityUnknown"),
        Ok(None) => lerr(loc, StatusCode::CONFLICT, "sso.lastWayIn"),
        Err(resp) => resp,
    }
}

/// `POST /api/auth/sso/claim` (Bearer) `{ flowId, secret, code }` → 204. Links
/// the identity of a flow that ended without an account to the caller: the
/// person proved who they are at the provider, then here.
pub async fn claim(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthUser(user): AuthUser,
    Json(keys): Json<FlowKeys>,
) -> Response {
    let collected = state
        .sso
        .flows
        .collect(&keys.flow_id, &keys.secret, &keys.code, now());
    let waiting = match collected {
        Collected::Done(done) => match *done {
            (flow, Outcome::Waiting(_, identity)) => Some((flow, identity)),
            _ => None,
        },
        _ => None,
    };
    let Some((flow, identity)) = waiting else {
        return lerr(loc, StatusCode::NOT_FOUND, "sso.flowExpired");
    };
    let linked = query(&state.db, move |pool| {
        admit::link(&pool, &user.id, &identity)
    })
    .await;
    match linked {
        Ok(Outcome::Linked) => {
            state.sso.flows.close(&flow.id);
            StatusCode::NO_CONTENT.into_response()
        }
        Ok(_) => lerr(loc, StatusCode::CONFLICT, "sso.linkedElsewhere"),
        Err(resp) => resp,
    }
}

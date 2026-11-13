use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Redirect, Response};
use serde::Deserialize;

use super::{now, sign_in_config};
use crate::api::util::{blocking, query};
use crate::db;
use crate::i18n::{self, ReqLocale};
use crate::model::{Audience, NotificationEvent, NotificationSpec, Permission};
use crate::services::settings::{self, Provider};
use crate::services::sso::admit::{admit, Outcome, Waiting};
use crate::services::sso::flows::Flow;
use crate::services::sso::identify::{identify, provider_said};
use crate::services::sso::person::Person;
use crate::state::SharedState;

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    pub state: Option<String>,
    pub code: Option<String>,
    pub error: Option<String>,
}

/// `GET /api/auth/sso/callback?state&code` → 303 back to the client that began
/// the flow. This is the address a provider redirects the person's browser to.
/// Whatever happened is parked under the flow; the redirect carries only the
/// code that, with the starter's secret, collects it.
pub async fn callback(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    Query(q): Query<CallbackQuery>,
) -> Response {
    let flow = q
        .state
        .as_deref()
        .and_then(|sent| state.sso.flows.arrive(sent, now()));
    let Some(flow) = flow else {
        return (
            StatusCode::BAD_REQUEST,
            i18n::t(loc, "sso.flowExpired", &[]),
        )
            .into_response();
    };

    let outcome = match (q.error, q.code) {
        (Some(error), _) => Outcome::Failed(provider_said(&error)),
        (None, None) => Outcome::Failed(provider_said("no_code")),
        (None, Some(code)) => match settle(&state, &flow, code).await {
            Ok(outcome) => outcome,
            Err(resp) => return resp,
        },
    };
    match state.sso.flows.settle(&flow.id, outcome) {
        Some(code) => {
            Redirect::to(&format!("{}/sso?flow={}&code={code}", flow.origin, flow.id))
                .into_response()
        }
        None => (
            StatusCode::BAD_REQUEST,
            i18n::t(loc, "sso.flowExpired", &[]),
        )
            .into_response(),
    }
}

async fn settle(state: &SharedState, flow: &Flow, code: String) -> Result<Outcome, Response> {
    let provider = sign_in_config(state)
        .provider(&flow.provider_id)
        .filter(|p| p.fingerprint() == flow.fingerprint)
        .cloned();
    let Some(provider) = provider else {
        return Ok(Outcome::Failed(provider_said("changed")));
    };

    let (caller, asked, flown) = (state.clone(), provider.clone(), flow.clone());
    let identified =
        blocking(move || Ok(identify(&caller.sso.directory, &asked, &flown, &code, now()))).await?;
    let identity = match identified {
        Ok(identity) => identity,
        Err(e) => {
            tracing::warn!(provider = %provider.id, error = ?e, "provider sign-in failed");
            return Ok(Outcome::Failed(e.code()));
        }
    };

    let (decided_by, intent) = (provider.clone(), flow.intent.clone());
    let outcome = query(&state.db, move |pool| {
        let outcome = admit(&pool, &decided_by, identity, &intent, now())?;
        if let Outcome::SignedIn { user_id, created: true } = &outcome {
            db::set_whats_new_seen(&pool, user_id, crate::VERSION)?;
        }
        Ok(outcome)
    })
    .await?;
    if matches!(outcome, Outcome::Tested(_)) {
        settings::mark_provider_tested(&state.settings, &state.db, &provider.id, &flow.fingerprint);
    }
    if let Outcome::Waiting(Waiting::Requested { filed: true }, identity) = &outcome {
        tell_the_admins(state, &provider, &identity.person).await;
    }
    Ok(outcome)
}

async fn tell_the_admins(state: &SharedState, provider: &Provider, person: &Person) {
    let spec = NotificationSpec::new(
        NotificationEvent::SystemJoinRequested,
        "notifications.system.join.requested.title",
        "notifications.system.join.requested.body",
    )
    .param("user", person.name.clone().unwrap_or_else(|| person.label()))
    .param("provider", provider.label.clone())
    .link("/admin/users");
    let teller = state.clone();
    let _ = blocking(move || {
        crate::services::notify::emit(
            &teller,
            &Audience::permission(Permission::UsersManage),
            &spec,
        );
        Ok(())
    })
    .await;
}

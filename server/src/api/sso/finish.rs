use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

use super::now;
use crate::api::accounts::{auth_result, device_hints};
use crate::api::dto::{FlowResult, TestReportView};
use crate::api::error::lerr;
use crate::api::util::query;
use crate::db;
use crate::i18n::ReqLocale;
use crate::services::sso::admit::{Outcome, Refusal, TestReport, Waiting};
use crate::services::sso::flows::Collected;
use crate::state::SharedState;

/// The two halves of a flow: the secret its start returned, and the code its
/// redirect carried.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowKeys {
    pub flow_id: String,
    pub secret: String,
    #[serde(default)]
    pub code: String,
}

fn refusal_word(refusal: Refusal) -> &'static str {
    match refusal {
        Refusal::Group => "group",
        Refusal::Blocked => "blocked",
        Refusal::Full => "full",
        Refusal::NoEmail => "noEmail",
        Refusal::InviteInvalid => "inviteInvalid",
        Refusal::LinkedElsewhere => "linkedElsewhere",
    }
}

fn report_view(report: TestReport) -> TestReportView {
    TestReportView {
        subject: report.person.subject,
        username: report.person.username,
        email: report.person.email,
        name: report.person.name,
        groups: report.person.groups,
        admitted: report.admitted,
    }
}

/// `POST /api/auth/sso/finish` `{ flowId, secret, code }` → `{ status, … }`.
/// A sign-in answers with the shape a password sign-in returns, under
/// `status: "signedIn"`. `404` for a flow that is unknown, lapsed or already
/// collected, and for either half being wrong: the four read alike.
pub async fn finish(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    headers: HeaderMap,
    Json(keys): Json<FlowKeys>,
) -> Response {
    let collected = state
        .sso
        .flows
        .collect(&keys.flow_id, &keys.secret, &keys.code, now());
    let outcome = match collected {
        Collected::Unknown => return lerr(loc, StatusCode::NOT_FOUND, "sso.flowExpired"),
        Collected::Pending => return Json(FlowResult::Pending).into_response(),
        Collected::Done(done) => done.1,
    };
    let result = match outcome {
        Outcome::SignedIn { user_id, .. } => {
            let user = match query(&state.db, move |pool| db::user_by_id(&pool, &user_id)).await {
                Ok(Some(user)) => user,
                Ok(None) => return lerr(loc, StatusCode::NOT_FOUND, "sso.flowExpired"),
                Err(resp) => return resp,
            };
            match auth_result(&state, user, device_hints(&headers)).await {
                Ok(result) => FlowResult::SignedIn(result),
                Err(resp) => return resp,
            }
        }
        Outcome::Waiting(Waiting::Requested { .. }, _) => FlowResult::Requested,
        Outcome::Waiting(Waiting::EmailTaken, _) => FlowResult::EmailTaken,
        Outcome::Waiting(Waiting::InvitationOnly, _) => FlowResult::InvitationOnly,
        Outcome::Refused(refusal) => FlowResult::Refused {
            reason: refusal_word(refusal),
        },
        Outcome::Failed(reason) => FlowResult::Failed { reason },
        Outcome::Linked => FlowResult::Linked,
        Outcome::Tested(report) => FlowResult::Tested {
            report: report_view(report),
        },
    };
    Json(result).into_response()
}

//! `/api/admin/importers`: the modules that read another media server, and the
//! owner's sign-in to that server through one of them.
//!
//! An importer is whichever module answers the `importer` point. The list is
//! the installed ones and the ones the official registry offers. A sign-in, a
//! survey and a forget pass through to an installed one, and the core keeps no
//! part of the sign-in: the reference the importer gives goes back to the
//! caller.

use std::sync::Arc;

use axum::extract::{DefaultBodyLimit, Path, State};
use axum::http::StatusCode;
use axum::response::Response;
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use kroma_module_manifest::{ConfigField, ModuleManifest};
use kroma_module_supervisor::Supervisor;
use serde::Serialize;
use serde_json::{Value, json};

use super::store::offers::{self, Offer};
use crate::api::error::{json_error, lerr};
use crate::api::extract::AuthUser;
use crate::api::util::blocking;
use crate::model::import::{Connected, Survey};
use crate::model::{Permission, User};
use crate::services::importers::{ConnectAsk, ForgetAsk, Importers, POINT, SurveyAsk, Unanswered};
use crate::state::SharedState;

const MAX_ASK_BYTES: usize = 64 * 1024;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/importers", get(list))
        .route("/importers/{id}/connect", post(connect))
        .route("/importers/{id}/survey", post(survey))
        .route("/importers/{id}/forget", post(forget))
        .layer(DefaultBodyLimit::max(MAX_ASK_BYTES))
}

/// One importer of the list: installed here, or offered by the official
/// registry. Only a `running` one can be asked.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Importer {
    id: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    icon: Option<String>,
    installed: bool,
    running: bool,
    fields: Vec<ConfigField>,
}

/// `registry_error` says why the official registry could not be read. The list
/// then holds the installed importers alone.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImporterList {
    importers: Vec<Importer>,
    #[serde(skip_serializing_if = "Option::is_none")]
    registry_error: Option<String>,
}

fn service(state: &SharedState) -> Option<Arc<Importers>> {
    kroma_module_host::service::<Importers>(state)
}

fn installed(manifest: &ModuleManifest, running: &[String]) -> Option<Importer> {
    let answer = manifest.contributes.iter().find(|c| c.point == POINT)?;
    Some(Importer {
        id: manifest.id.clone(),
        name: manifest.name.clone(),
        label: answer.label.clone(),
        icon: None,
        installed: true,
        running: running.contains(&manifest.id),
        fields: answer.fields.clone(),
    })
}

fn offered(offer: Offer) -> Importer {
    Importer {
        id: offer.id,
        name: offer.name,
        label: offer.label,
        icon: offer.icon,
        installed: false,
        running: false,
        fields: offer.fields,
    }
}

/// `GET /api/admin/importers` the importers installed here, then the ones the
/// official registry offers and this server does not have. An installed one
/// has its icon at `/api/modules/:id/icon`, an offered one carries it inline.
pub async fn list(
    State(state): State<SharedState>,
    Extension(sup): Extension<Arc<Supervisor>>,
    AuthUser(user): AuthUser,
) -> Result<Json<ImporterList>, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let running = service(&state).map_or_else(Vec::new, |importers| importers.answering());
    let mut importers: Vec<Importer> = kroma_module_kernel::manifests(&state)
        .iter()
        .filter_map(|manifest| installed(manifest, &running))
        .collect();
    let (offers, registry_error) = offers::official(&state, &sup, POINT).await;
    let missing: Vec<Importer> = offers
        .into_iter()
        .filter(|offer| importers.iter().all(|here| here.id != offer.id))
        .map(offered)
        .collect();
    importers.extend(missing);
    Ok(Json(ImporterList {
        importers,
        registry_error,
    }))
}

async fn asked<T, F>(state: &SharedState, user: &User, call: F) -> Result<Json<T>, Response>
where
    T: Send + 'static,
    F: FnOnce(&Importers) -> Result<T, Unanswered> + Send + 'static,
{
    super::require(user, Permission::SettingsManage)?;
    let importers = service(state).ok_or_else(|| unanswered(user, Unanswered::Absent))?;
    let answer = blocking(move || Ok(call(&importers))).await?;
    answer.map(Json).map_err(|why| unanswered(user, why))
}

fn unanswered(user: &User, why: Unanswered) -> Response {
    match why {
        Unanswered::Absent => lerr(
            super::user_locale(user),
            StatusCode::NOT_FOUND,
            "error.moduleDisabled",
        ),
        Unanswered::Failed(reason) => json_error(StatusCode::BAD_GATEWAY, &reason),
        Unanswered::Unreadable(detail) => {
            tracing::warn!(%detail, "an importer's answer could not be used");
            json_error(
                StatusCode::BAD_GATEWAY,
                "the importer gave an answer this server cannot read",
            )
        }
    }
}

/// `POST /api/admin/importers/:id/connect` signs in to another server with the
/// form the owner filled, or asks how a sign-in in progress stands. Polled with
/// the `pending` id until it answers `ready` or `refused`.
pub async fn connect(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(ask): Json<ConnectAsk>,
) -> Result<Json<Connected>, Response> {
    asked(&state, &user, move |importers| importers.connect(&id, &ask)).await
}

/// `POST /api/admin/importers/:id/survey` what one server of a sign-in holds.
/// A POST, so the reference to the sign-in stays out of the URL.
pub async fn survey(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(ask): Json<SurveyAsk>,
) -> Result<Json<Survey>, Response> {
    asked(&state, &user, move |importers| importers.survey(&id, &ask)).await
}

/// `POST /api/admin/importers/:id/forget` has the importer delete a sign-in.
pub async fn forget(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(ask): Json<ForgetAsk>,
) -> Result<Json<Value>, Response> {
    let forgotten =
        move |importers: &Importers| importers.forget(&id, &ask).map(|()| json!({ "ok": true }));
    asked(&state, &user, forgotten).await
}

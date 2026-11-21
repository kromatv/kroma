//! `/api/admin/setup`: the guided setup of the owner who made this server's
//! first account. The owner reads where they stopped and moves on, and an ended
//! setup answers its checklist. Anyone else reads no setup and changes none.

use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::Response;
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use kroma_module_manifest::ModuleManifest;
use kroma_module_supervisor::Supervisor;
use serde::Deserialize;

use crate::api::error::{json_error, lerr};
use crate::api::extract::AuthUser;
use crate::api::util::blocking;
use crate::model::User;
use crate::model::setup::{LINES, Setup, SetupAnswer, Start, Step};
use crate::services::setup;
use crate::state::SharedState;

const IMPORTER: &str = "importer";

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/setup", get(read).put(advance))
        .route("/setup/end", post(end))
        .route("/setup/confirm/{step}", post(confirm))
        .route("/setup/dismiss/{step}", post(dismiss))
}

/// The step the owner is on, and how their setup began.
#[derive(Deserialize)]
pub struct Advance {
    step: Step,
    start: Start,
}

fn importer_only(manifest: &ModuleManifest) -> bool {
    !manifest.contributes.is_empty()
        && manifest
            .contributes
            .iter()
            .all(|contribution| contribution.point == IMPORTER)
}

fn holds_a_module(supervisor: &Supervisor) -> bool {
    supervisor
        .installed_manifests()
        .iter()
        .any(|manifest| !importer_only(manifest))
}

fn refused(user: &User) -> Response {
    lerr(
        super::user_locale(user),
        StatusCode::FORBIDDEN,
        "error.permissionDenied",
    )
}

async fn answer(
    state: SharedState,
    supervisor: &Supervisor,
    user: &User,
    change: impl FnOnce(&mut Setup) -> bool + Send + 'static,
) -> Result<SetupAnswer, Response> {
    let module = holds_a_module(supervisor);
    let id = user.id.clone();
    let setup = blocking(move || setup::answer(&state, &id, module, change)).await?;
    Ok(SetupAnswer { setup })
}

async fn changed(
    state: SharedState,
    supervisor: &Supervisor,
    user: &User,
    change: impl FnOnce(&mut Setup) + Send + 'static,
) -> Result<Json<SetupAnswer>, Response> {
    let answered = answer(state, supervisor, user, |setup| {
        change(setup);
        true
    })
    .await?;
    if answered.setup.is_none() {
        return Err(refused(user));
    }
    Ok(Json(answered))
}

/// `GET /api/admin/setup`: the caller's setup, or `{ "setup": null }` for
/// anyone it does not lead and on a server whose owner came before it.
pub async fn read(
    State(state): State<SharedState>,
    Extension(supervisor): Extension<Arc<Supervisor>>,
    AuthUser(user): AuthUser,
) -> Result<Json<SetupAnswer>, Response> {
    Ok(Json(answer(state, &supervisor, &user, |_| false).await?))
}

/// `PUT /api/admin/setup`: the owner is on `step`. The furthest step reached
/// never goes back. 403 for anyone the setup does not lead.
pub async fn advance(
    State(state): State<SharedState>,
    Extension(supervisor): Extension<Arc<Supervisor>>,
    AuthUser(user): AuthUser,
    Json(body): Json<Advance>,
) -> Result<Json<SetupAnswer>, Response> {
    changed(state, &supervisor, &user, move |setup| {
        setup.advance(body.step, body.start)
    })
    .await
}

/// `POST /api/admin/setup/end`: the owner left the setup, with "Finish later"
/// or from its last screen. What is not done is the checklist from now on.
pub async fn end(
    State(state): State<SharedState>,
    Extension(supervisor): Extension<Arc<Supervisor>>,
    AuthUser(user): AuthUser,
) -> Result<Json<SetupAnswer>, Response> {
    changed(state, &supervisor, &user, |setup| setup.ended = true).await
}

/// `POST /api/admin/setup/confirm/:step`: the owner answered a step that leaves
/// nothing else behind (the modules with none picked, the statistics). 400 for
/// a step whose result the server sees for itself.
pub async fn confirm(
    State(state): State<SharedState>,
    Extension(supervisor): Extension<Arc<Supervisor>>,
    AuthUser(user): AuthUser,
    Path(step): Path<Step>,
) -> Result<Json<SetupAnswer>, Response> {
    if !step.confirmed_by_the_owner() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "this step is not confirmed",
        ));
    }
    changed(state, &supervisor, &user, move |setup| {
        setup.done.insert(step);
    })
    .await
}

/// `POST /api/admin/setup/dismiss/:step`: the owner takes a line off the
/// checklist for good. 400 for a step that is never a line.
pub async fn dismiss(
    State(state): State<SharedState>,
    Extension(supervisor): Extension<Arc<Supervisor>>,
    AuthUser(user): AuthUser,
    Path(step): Path<Step>,
) -> Result<Json<SetupAnswer>, Response> {
    if !LINES.contains(&step) {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "this step is not a line",
        ));
    }
    changed(state, &supervisor, &user, move |setup| {
        setup.dismissed.insert(step);
    })
    .await
}

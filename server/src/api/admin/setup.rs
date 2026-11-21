//! `/api/admin/setup`: the guided setup of the owner who made this server's
//! first account. The owner reads where they stopped and moves on, and an ended
//! setup answers its checklist. Anyone else reads no setup and changes none.

use std::sync::Arc;

use axum::extract::{FromRequestParts, Path};
use axum::http::StatusCode;
use axum::http::request::Parts;
use axum::response::{IntoResponse, Response};
use axum::routing::{MethodRouter, get, post};
use axum::{Extension, Json, Router};
use kroma_module_manifest::ModuleManifest;
use kroma_module_supervisor::Supervisor;
use serde::Deserialize;

use crate::api::error::{json_error, lerr};
use crate::api::extract::AuthUser;
use crate::api::util::blocking;
use crate::model::User;
use crate::model::setup::{LINES, Setup, SetupAnswer, Start, Step};
use crate::services::setup::{self, Asker};
use crate::state::SharedState;

const IMPORTER: &str = "importer";

pub fn routes() -> Router<SharedState> {
    super::noun("/setup", get(read).put(advance), actions())
}

fn actions() -> [(&'static str, MethodRouter<SharedState>); 3] {
    [
        ("end", post(end)),
        ("confirm/{step}", post(confirm)),
        ("dismiss/{step}", post(dismiss)),
    ]
}

/// The step the owner is on, and how their setup began.
#[derive(Deserialize)]
pub struct Advance {
    step: Step,
    start: Start,
}

/// Who asks about the setup, on which server, and whether that server holds a
/// module: what every setup route reads before it answers.
pub struct Caller {
    state: SharedState,
    user: User,
    module: bool,
}

impl FromRequestParts<SharedState> for Caller {
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &SharedState,
    ) -> Result<Self, Self::Rejection> {
        let AuthUser(user) = AuthUser::from_request_parts(parts, state).await?;
        let Extension(supervisor) = Extension::<Arc<Supervisor>>::from_request_parts(parts, state)
            .await
            .map_err(IntoResponse::into_response)?;
        Ok(Self {
            state: state.clone(),
            user,
            module: holds_a_module(&supervisor),
        })
    }
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
    caller: &Caller,
    change: impl FnOnce(&mut Setup) -> bool + Send + 'static,
) -> Result<SetupAnswer, Response> {
    let state = caller.state.clone();
    let asker = Asker {
        user: caller.user.id.clone(),
        module: caller.module,
    };
    let setup = blocking(move || setup::answer(&state, &asker, change)).await?;
    Ok(SetupAnswer { setup })
}

async fn changed(
    caller: Caller,
    change: impl FnOnce(&mut Setup) + Send + 'static,
) -> Result<Json<SetupAnswer>, Response> {
    let answered = answer(&caller, |setup| {
        change(setup);
        true
    })
    .await?;
    if answered.setup.is_none() {
        return Err(refused(&caller.user));
    }
    Ok(Json(answered))
}

/// `GET /api/admin/setup`: the caller's setup, or `{ "setup": null }` for
/// anyone it does not lead and on a server whose owner came before it.
pub async fn read(caller: Caller) -> Result<Json<SetupAnswer>, Response> {
    Ok(Json(answer(&caller, |_| false).await?))
}

/// `PUT /api/admin/setup`: the owner is on `step`. The furthest step reached
/// never goes back. 403 for anyone the setup does not lead.
pub async fn advance(
    caller: Caller,
    Json(body): Json<Advance>,
) -> Result<Json<SetupAnswer>, Response> {
    changed(caller, move |setup| setup.advance(body.step, body.start)).await
}

/// `POST /api/admin/setup/end`: the owner left the setup, with "Finish later"
/// or from its last screen. What is not done is the checklist from now on.
pub async fn end(caller: Caller) -> Result<Json<SetupAnswer>, Response> {
    changed(caller, |setup| setup.ended = true).await
}

/// `POST /api/admin/setup/confirm/:step`: the owner answered a step that leaves
/// nothing else behind (the modules with none picked, the statistics). 400 for
/// a step whose result the server sees for itself.
pub async fn confirm(
    caller: Caller,
    Path(step): Path<Step>,
) -> Result<Json<SetupAnswer>, Response> {
    if !step.confirmed_by_the_owner() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "this step is not confirmed",
        ));
    }
    changed(caller, move |setup| {
        setup.done.insert(step);
    })
    .await
}

/// `POST /api/admin/setup/dismiss/:step`: the owner takes a line off the
/// checklist for good. 400 for a step that is never a line.
pub async fn dismiss(
    caller: Caller,
    Path(step): Path<Step>,
) -> Result<Json<SetupAnswer>, Response> {
    if !LINES.contains(&step) {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "this step is not a line",
        ));
    }
    changed(caller, move |setup| {
        setup.dismissed.insert(step);
    })
    .await
}

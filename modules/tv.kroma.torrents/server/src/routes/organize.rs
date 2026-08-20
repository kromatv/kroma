//! `/organize/*` file naming templates + the library rename tool.
//! Gated on `library.manage` (it moves library files). The naming templates
//! are stored as settings; this exposes them with a live sample and drives the
//! preview + apply of a bulk rename.

use std::collections::BTreeMap;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{json, Value};

use kroma_module_sdk::domain::{Permission, User};

use crate::dtos::{NamingTemplatesView, NamingView, OrganizePlan, OrganizeResult, SampleBody};
use kroma_module_sdk::host::{blocking, json_error, AuthUser, HostStorage};

use crate::organize::{
    self,
    naming::{Casing, NamingTemplates},
};

pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/organize/naming", get(get_naming::<S>).put(save_naming::<S>))
        .route("/organize/sample", post(sample::<S>))
        .route("/organize/preview", get(preview::<S>))
        .route("/organize/apply", post(apply::<S>))
}

fn require<S: HostStorage>(state: &S, user: &User) -> Result<(), Response> {
    if user.can(Permission::LibraryManage) {
        Ok(())
    } else {
        state.require(user, Permission::LibraryManage)
    }
}

fn view_of(tpl: &NamingTemplates) -> NamingTemplatesView {
    NamingTemplatesView {
        movie_folder: tpl.movie_folder.clone(),
        movie_file: tpl.movie_file.clone(),
        series_folder: tpl.series_folder.clone(),
        season_folder: tpl.season_folder.clone(),
        episode_file: tpl.episode_file.clone(),
        case: tpl.case.as_key().to_string(),
    }
}

fn templates_of(body: &NamingTemplatesView) -> NamingTemplates {
    NamingTemplates {
        movie_folder: body.movie_folder.clone(),
        movie_file: body.movie_file.clone(),
        series_folder: body.series_folder.clone(),
        season_folder: body.season_folder.clone(),
        episode_file: body.episode_file.clone(),
        case: Casing::from_key(&body.case),
    }
}

/// `GET /organize/naming` current templates + a sample.
pub async fn get_naming<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    require(&state, &user)?;
    let tpl = NamingTemplates::read(|k, d| state.setting_str(k, d));
    Ok(Json(NamingView { templates: view_of(&tpl), sample: organize::sample(&tpl) }).into_response())
}

/// `POST /organize/sample` render the sample for the given (unsaved)
/// templates, for the live preview as the admin types.
pub async fn sample<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Json(body): Json<SampleBody>,
) -> Result<Response, Response> {
    require(&state, &user)?;
    Ok(Json(organize::sample(&templates_of(&body))).into_response())
}

/// `PUT /organize/naming` persist the templates.
pub async fn save_naming<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Json(body): Json<NamingTemplatesView>,
) -> Result<Response, Response> {
    require(&state, &user)?;
    let mut patch: BTreeMap<String, Value> = BTreeMap::new();
    patch.insert("namingMovieFolder".into(), json!(body.movie_folder.trim()));
    patch.insert("namingMovieFile".into(), json!(body.movie_file.trim()));
    patch.insert("namingSeriesFolder".into(), json!(body.series_folder.trim()));
    patch.insert("namingSeasonFolder".into(), json!(body.season_folder.trim()));
    patch.insert("namingEpisodeFile".into(), json!(body.episode_file.trim()));
    patch.insert("namingCase".into(), json!(Casing::from_key(&body.case).as_key()));
    state.set_settings(patch);
    Ok(Json(json!({ "ok": true })).into_response())
}

/// `GET /organize/preview` the non-destructive rename plan.
pub async fn preview<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    require(&state, &user)?;
    let plan: OrganizePlan = blocking(move || organize::plan(&state)).await?;
    Ok(Json(plan).into_response())
}

/// `POST /organize/apply` execute the rename (destructive).
pub async fn apply<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    require(&state, &user)?;
    let result: OrganizeResult = match tokio::task::spawn_blocking(move || {
        organize::apply(&state, &|line| tracing::info!(target: "organize", "{line}"))
    })
    .await
    {
        Ok(Ok(r)) => r,
        Ok(Err(e)) => return Err(json_error(StatusCode::BAD_REQUEST, &format!("{e:#}"))),
        Err(_) => {
            return Err(json_error(StatusCode::INTERNAL_SERVER_ERROR, "internal error"))
        }
    };
    Ok(Json(result).into_response())
}

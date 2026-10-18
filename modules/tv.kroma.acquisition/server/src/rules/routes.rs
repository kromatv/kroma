//! The rules editor's API: profiles, custom formats and size limits, a box to
//! test them against a release name, and how one title's files measure up.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, put};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::json;

use kroma_module_sdk::domain::{Permission, User};
use kroma_module_sdk::engine::model::RequestKind;
use kroma_module_sdk::engine::services::jobs::now_ms;
use kroma_module_sdk::host::{AuthUser, HostStorage, json_error};
use kroma_scene::{CustomFormat, FormatSet, Quality, QualityProfile, Sizes};

use super::files::{JudgedFile, held_units, judge_title_files, unit_below_target};
use super::{load, original_language, set_default_profile, store};

pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .merge(super::blocklist::routes::<S>())
        .merge(super::judgement::routes::<S>())
        .route("/acquisition/rules", get(rules::<S>))
        .route(
            "/acquisition/profiles/{id}",
            put(save_profile::<S>).delete(delete_profile::<S>),
        )
        .route("/acquisition/default-profile", put(default_profile::<S>))
        .route(
            "/acquisition/formats/{id}",
            put(save_format::<S>).delete(delete_format::<S>),
        )
        .route("/acquisition/sizes", put(save_sizes::<S>))
        .route("/acquisition/titles/{kind}/{tmdb_id}", get(title::<S>))
        .route(
            "/acquisition/titles/{kind}/{tmdb_id}/profile",
            put(title_profile::<S>),
        )
}

pub(super) fn require_reader<S: HostStorage>(state: &S, user: &User) -> Result<(), Response> {
    if user.can(Permission::RequestsManage) || user.can(Permission::LibraryManage) {
        return Ok(());
    }
    state.require(user, Permission::SettingsManage)
}

pub(super) fn bad(reason: impl std::fmt::Display) -> Response {
    json_error(StatusCode::BAD_REQUEST, &reason.to_string())
}

pub(super) async fn run<T, F>(f: F) -> Result<T, Response>
where
    F: FnOnce() -> anyhow::Result<T> + Send + 'static,
    T: Send + 'static,
{
    match tokio::task::spawn_blocking(f).await {
        Ok(Ok(v)) => Ok(v),
        Ok(Err(e)) => Err(bad(format!("{e:#}"))),
        Err(_) => Err(json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal error",
        )),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RulesView {
    profiles: Vec<QualityProfile>,
    default_profile: String,
    formats: Vec<CustomFormat>,
    sizes: Sizes,
    qualities: Vec<Quality>,
}

/// `GET /acquisition/rules`: every rule, and the quality vocabulary.
async fn rules<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    require_reader(&state, &user)?;
    let book = run(move || load(&state)).await?;
    Ok(Json(RulesView {
        profiles: book.profiles,
        default_profile: book.default_profile,
        formats: book.formats,
        sizes: book.sizes,
        qualities: Quality::ALL.to_vec(),
    })
    .into_response())
}

async fn save_profile<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(profile): Json<QualityProfile>,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    if profile.id != id || id.trim().is_empty() {
        return Err(bad("the profile id must match the address"));
    }
    profile.validate().map_err(bad)?;
    run(move || {
        load(&state)?;
        store::save_profile(state.store(), &profile, now_ms())
    })
    .await?;
    Ok(Json(json!({ "ok": true })).into_response())
}

async fn delete_profile<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    let removed = run(move || {
        let book = load(&state)?;
        if book.default_profile == id {
            anyhow::bail!(
                "the default profile cannot be deleted; make another one the default first"
            );
        }
        store::delete_profile(state.store(), &id)
    })
    .await?;
    Ok(Json(json!({ "ok": removed })).into_response())
}

#[derive(Deserialize)]
struct DefaultBody {
    id: String,
}

async fn default_profile<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Json(body): Json<DefaultBody>,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    run(move || {
        let book = load(&state)?;
        if !book.profiles.iter().any(|p| p.id == body.id) {
            anyhow::bail!("no profile is called {}", body.id);
        }
        set_default_profile(&state, &body.id)
    })
    .await?;
    Ok(Json(json!({ "ok": true })).into_response())
}

async fn save_format<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(format): Json<CustomFormat>,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    if format.id != id || id.trim().is_empty() || format.name.trim().is_empty() {
        return Err(bad(
            "a format needs a name, and its id must match the address",
        ));
    }
    FormatSet::compile(std::slice::from_ref(&format))
        .map_err(|e| bad(format!("{}: {}", e.format, e.reason)))?;
    run(move || {
        load(&state)?;
        store::save_format(state.store(), &format, now_ms())
    })
    .await?;
    Ok(Json(json!({ "ok": true })).into_response())
}

async fn delete_format<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    let removed = run(move || {
        load(&state)?;
        store::delete_format(state.store(), &id)
    })
    .await?;
    Ok(Json(json!({ "ok": removed })).into_response())
}

async fn save_sizes<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Json(sizes): Json<Sizes>,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    validate_sizes(&sizes).map_err(bad)?;
    run(move || {
        load(&state)?;
        store::save_sizes(state.store(), &sizes)
    })
    .await?;
    Ok(Json(json!({ "ok": true })).into_response())
}

fn validate_sizes(sizes: &Sizes) -> Result<(), String> {
    if sizes.movie_runtime == 0 || sizes.episode_runtime == 0 {
        return Err("a runtime must be at least one minute".into());
    }
    for limit in sizes.movie.iter().chain(&sizes.episode) {
        let max = limit.max.unwrap_or(f64::INFINITY);
        let preferred = limit.preferred.unwrap_or(limit.min);
        if limit.min < 0.0 || limit.min > max || preferred < limit.min || preferred > max {
            return Err(format!(
                "the limits for {} are out of order",
                limit.quality.id()
            ));
        }
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TitleView {
    profile_id: String,
    profile_name: String,
    custom_profile: bool,
    cutoff_unmet: bool,
    files: Vec<JudgedFile>,
}

fn kind_of(raw: &str) -> Result<RequestKind, Response> {
    RequestKind::parse(raw).ok_or_else(|| bad("unknown kind"))
}

/// `GET /acquisition/titles/:kind/:tmdbId`: the title's files, judged by its
/// profile, and whether it could still be upgraded.
async fn title<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Path((kind, tmdb_id)): Path<(String, u64)>,
) -> Result<Response, Response> {
    require_reader(&state, &user)?;
    let kind = kind_of(&kind)?;
    let view = run(move || {
        let book = load(&state)?;
        let chosen = store::title_profile(state.store(), kind, tmdb_id)?;
        let profile = book.profile(chosen.as_deref());
        let original = original_language(&state, kind, tmdb_id)?;
        let files = judge_title_files(
            &state,
            kind,
            tmdb_id,
            &book.rules(profile),
            original.as_ref(),
        )?;
        let cutoff_unmet = held_units(&files)
            .into_iter()
            .any(|(season, episode)| unit_below_target(&files, season, episode, profile));
        Ok(TitleView {
            profile_id: profile.id.clone(),
            profile_name: profile.name.clone(),
            custom_profile: chosen.is_some(),
            cutoff_unmet,
            files,
        })
    })
    .await?;
    Ok(Json(view).into_response())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TitleProfileBody {
    #[serde(default)]
    profile_id: Option<String>,
}

async fn title_profile<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Path((kind, tmdb_id)): Path<(String, u64)>,
    Json(body): Json<TitleProfileBody>,
) -> Result<Response, Response> {
    require_reader(&state, &user)?;
    let kind = kind_of(&kind)?;
    run(move || {
        let book = load(&state)?;
        if let Some(id) = body.profile_id.as_deref() {
            if !book.profiles.iter().any(|p| p.id == id) {
                anyhow::bail!("no profile is called {id}");
            }
        }
        store::set_title_profile(state.store(), kind, tmdb_id, body.profile_id.as_deref())
    })
    .await?;
    Ok(Json(json!({ "ok": true })).into_response())
}

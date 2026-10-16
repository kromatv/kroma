//! Acquisition by title rather than by request: an interactive search and its
//! grab for any title, and the titles whose files their profile would still
//! upgrade.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::json;

use kroma_module_sdk::db;
use kroma_module_sdk::domain::{Permission, User};
use kroma_module_sdk::engine::model::RequestKind;
use kroma_module_sdk::host::{json_error, AuthUser, HostStorage};
use kroma_scene::{cutoff_unmet, Evaluation};

use crate::rules::files::judge_title_files;
use crate::search::{SearchScope, Subject};

pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/acquisition/titles/{kind}/{tmdb_id}/search", post(search::<S>))
        .route("/acquisition/titles/{kind}/{tmdb_id}/grab", post(grab::<S>))
        .route("/acquisition/cutoff", get(cutoff::<S>))
}

fn require<S: HostStorage>(state: &S, user: &User) -> Result<(), Response> {
    if user.can(Permission::LibraryManage) || user.can(Permission::RequestsManage) {
        return Ok(());
    }
    state.require(user, Permission::SettingsManage)
}

fn subject_of(kind: &str, tmdb_id: u64) -> Result<Subject, Response> {
    let kind = RequestKind::parse(kind)
        .ok_or_else(|| json_error(StatusCode::BAD_REQUEST, "unknown kind"))?;
    Ok(Subject::Title { kind, tmdb_id })
}

async fn run<T, F>(f: F) -> Result<T, Response>
where
    F: FnOnce() -> anyhow::Result<T> + Send + 'static,
    T: Send + 'static,
{
    match tokio::task::spawn_blocking(f).await {
        Ok(Ok(v)) => Ok(v),
        Ok(Err(e)) => Err(json_error(StatusCode::BAD_REQUEST, &format!("{e:#}"))),
        Err(_) => Err(json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal error",
        )),
    }
}

#[derive(Deserialize)]
struct SearchBody {
    #[serde(default)]
    scope: SearchScope,
}

/// `POST /acquisition/titles/:kind/:tmdbId/search`: every indexer, judged by
/// the title's profile and against what it holds.
async fn search<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Path((kind, tmdb_id)): Path<(String, u64)>,
    Json(body): Json<SearchBody>,
) -> Result<Response, Response> {
    require(&state, &user)?;
    let subject = subject_of(&kind, tmdb_id)?;
    let view = run(move || crate::search::interactive_search(&state, &subject, body.scope)).await?;
    Ok(Json(view).into_response())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrabBody {
    #[serde(default)]
    scope: SearchScope,
    guid: String,
    indexer_id: String,
}

/// `POST /acquisition/titles/:kind/:tmdbId/grab`: one release of the last
/// search of this title.
async fn grab<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Path((kind, tmdb_id)): Path<(String, u64)>,
    Json(body): Json<GrabBody>,
) -> Result<Response, Response> {
    require(&state, &user)?;
    let subject = subject_of(&kind, tmdb_id)?;
    let host = state.clone();
    let row = run(move || {
        crate::search::grab_cached(&host, &subject, body.scope, &body.guid, &body.indexer_id)
    })
    .await?;
    let id = row.id.clone();
    tokio::task::spawn_blocking(move || crate::peers::downloads::activate(&state, &row.id));
    Ok(Json(json!({ "id": id })).into_response())
}

/// One monitored title its profile would still upgrade.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CutoffEntry {
    pub kind: RequestKind,
    pub tmdb_id: u64,
    pub title: String,
    pub year: Option<u32>,
    pub poster_url: Option<String>,
    pub profile_name: String,
    pub units: usize,
    pub below: usize,
    pub best_quality: Option<String>,
}

/// `GET /acquisition/cutoff`: monitored titles with a file below its profile.
async fn cutoff<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    require(&state, &user)?;
    let entries = run(move || cutoff_list(&state)).await?;
    Ok(Json(entries).into_response())
}

pub fn cutoff_list<S: HostStorage>(state: &S) -> anyhow::Result<Vec<CutoffEntry>> {
    let book = crate::rules::load(state)?;
    let conn = state.db().get()?;
    let titles = db::list_monitored(&conn)?;
    drop(conn);
    let mut out = Vec::new();
    for title in titles {
        let profile = book.profile_for(state, title.kind, title.tmdb_id)?;
        let original = crate::rules::original_language(state, title.kind, title.tmdb_id)?;
        let files = judge_title_files(
            state,
            title.kind,
            title.tmdb_id,
            &book.rules(profile),
            original.as_ref(),
        )?;
        if files.is_empty() {
            continue;
        }
        let mut units: Vec<(Option<u32>, Option<u32>)> =
            files.iter().map(|f| (f.season, f.episode)).collect();
        units.sort_unstable();
        units.dedup();
        let below = units
            .iter()
            .filter(|&&(season, episode)| {
                let held: Vec<Evaluation> = files
                    .iter()
                    .filter(|f| f.holds(season, episode))
                    .map(|f| f.evaluation.clone())
                    .collect();
                cutoff_unmet(&held, profile)
            })
            .count();
        if below == 0 {
            continue;
        }
        out.push(CutoffEntry {
            kind: title.kind,
            tmdb_id: title.tmdb_id,
            title: title.title,
            year: title.year,
            poster_url: title.poster_url,
            profile_name: profile.name.clone(),
            units: units.len(),
            below,
            best_quality: files
                .iter()
                .max_by_key(|f| (f.evaluation.quality_rank, f.evaluation.format_score))
                .map(|f| f.evaluation.quality.id().to_string()),
        });
    }
    Ok(out)
}

//! `/api/edits/people` and `/api/edits/studios`: who and which studios TMDB
//! offers for a name being typed in a title's edit, behind `library.manage`.
//!
//! - `GET /api/edits/people?q=` → `{ results: [{ tmdbId, name, photoUrl,
//!   department, knownFor }] }`, asked in the reader's language.
//! - `GET /api/edits/studios?q=` → `{ results: [{ tmdbId, name, logoUrl,
//!   country }] }`.
//!
//! At most ten, in TMDB's order. `q` is trimmed; a blank one, or a server
//! without a TMDB key, offers nobody. 400 when `q` is longer than 100
//! characters, 502 when TMDB did not answer.

use axum::extract::{FromRequestParts, Query, State};
use axum::http::request::Parts;
use axum::http::StatusCode;
use axum::response::Response;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::api::error::json_error;
use crate::api::extract::AuthUser;
use crate::api::permission::require;
use crate::api::util::blocking;
use crate::i18n::AskedLocale;
use crate::infra::metadata::company_search::{self, TmdbStudio};
use crate::infra::metadata::person_search::{self, TmdbPerson};
use crate::model::Permission;
use crate::services::settings;
use crate::state::SharedState;

const MAX_QUERY_CHARS: usize = 100;

#[derive(Debug, Deserialize)]
pub(super) struct SearchParams {
    #[serde(default)]
    q: String,
}

#[derive(Debug, Serialize)]
pub(super) struct Offered<T> {
    results: Vec<T>,
}

pub(super) struct Editor {
    language: Option<&'static str>,
}

impl FromRequestParts<SharedState> for Editor {
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &SharedState,
    ) -> Result<Self, Self::Rejection> {
        let AuthUser(user) = AuthUser::from_request_parts(parts, state).await?;
        require(&user, Permission::LibraryManage)?;
        let Ok(AskedLocale(language)) = AskedLocale::from_request_parts(parts, state).await;
        Ok(Editor { language })
    }
}

struct Asked {
    api_key: String,
    query: String,
}

pub(super) async fn people(
    State(state): State<SharedState>,
    editor: Editor,
    Query(params): Query<SearchParams>,
) -> Result<Json<Offered<TmdbPerson>>, Response> {
    let asked = asked(&state, &params)?;
    let language = settings::metadata_language_for(&state.settings, &state.config, editor.language);
    offered(asked, move |asked| {
        person_search::people(&asked.api_key, &language, &asked.query)
    })
    .await
}

pub(super) async fn studios(
    State(state): State<SharedState>,
    _editor: Editor,
    Query(params): Query<SearchParams>,
) -> Result<Json<Offered<TmdbStudio>>, Response> {
    let asked = asked(&state, &params)?;
    offered(asked, |asked| {
        company_search::studios(&asked.api_key, &asked.query)
    })
    .await
}

fn asked(state: &SharedState, params: &SearchParams) -> Result<Option<Asked>, Response> {
    if params.q.chars().count() > MAX_QUERY_CHARS {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "q: at most 100 characters",
        ));
    }
    let query = params.q.trim();
    let api_key = state.config.tmdb_api_key.clone();
    Ok(api_key.filter(|_| !query.is_empty()).map(|api_key| Asked {
        api_key,
        query: query.to_owned(),
    }))
}

async fn offered<T, F>(asked: Option<Asked>, search: F) -> Result<Json<Offered<T>>, Response>
where
    F: FnOnce(Asked) -> anyhow::Result<Vec<T>> + Send + 'static,
    T: Send + 'static,
{
    let Some(asked) = asked else {
        return Ok(Json(Offered {
            results: Vec::new(),
        }));
    };
    match blocking(move || Ok(search(asked))).await? {
        Ok(results) => Ok(Json(Offered { results })),
        Err(unanswered) => Err(json_error(
            StatusCode::BAD_GATEWAY,
            &format!("{unanswered:#}"),
        )),
    }
}

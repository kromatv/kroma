//! The watch-history screen: one page of the log, and its library filter.

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::json;

use crate::api::error::json_error;
use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::state::SharedState;

const ROWS_PER_PAGE: usize = 50;
const MOST_ROWS: usize = 200;
const DEEPEST_PAGE: usize = 100_000;

#[derive(Debug, Deserialize)]
pub struct PlaysQuery {
    #[serde(default)]
    pub days: Option<i64>,
    #[serde(default)]
    pub user: Option<String>,
    #[serde(default)]
    pub library: Option<String>,
    #[serde(default)]
    pub item: Option<String>,
    #[serde(default)]
    pub sort: Option<String>,
    #[serde(default)]
    pub limit: Option<usize>,
    #[serde(default)]
    pub offset: Option<usize>,
}

/// `GET /api/admin/stats/plays?days=30&user=&library=&item=&sort=&limit=&offset=`
/// → one page of the watch log. `item` takes an item id or a show id, which
/// matches every episode of that show.
pub async fn plays(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Query(q): Query<PlaysQuery>,
) -> Result<Response, Response> {
    let who = super::present(q.user);
    super::require_history_of(&user, who.as_deref())?;
    let sort = match super::present(q.sort) {
        Some(raw) => db::PlaySort::parse(&raw)
            .ok_or_else(|| json_error(StatusCode::BAD_REQUEST, "unknown sort column"))?,
        None => db::PlaySort::default(),
    };
    let filter = db::PlayFilter {
        since: super::since(q.days, 30).unwrap_or(0),
        user: who,
        library: super::present(q.library),
        item_or_show: super::present(q.item),
        sort,
    };
    let limit = q.limit.unwrap_or(ROWS_PER_PAGE).clamp(1, MOST_ROWS);
    let offset = q.offset.unwrap_or(0).min(DEEPEST_PAGE);
    let (entries, total) = query(&state.db, move |pool| {
        Ok((
            db::plays(&pool, &filter, limit, offset)?,
            db::plays_count(&pool, &filter)?,
        ))
    })
    .await?;
    Ok(Json(json!({ "plays": entries, "total": total })).into_response())
}

/// `GET /api/admin/stats/libraries` → the libraries the watch log references,
/// named.
pub async fn libraries(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    super::super::require_any_admin(&user)?;
    let libraries = query(&state.db, move |pool| db::history_libraries(&pool)).await?;
    Ok(Json(json!({ "libraries": libraries })).into_response())
}

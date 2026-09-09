//! What to play next: a show's up-next episode, and the episodes following one
//! inside its show.

use axum::extract::{Path, State};
use axum::response::{IntoResponse, Response};
use axum::Json;

use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::api::visibility;
use crate::db;
use crate::i18n::ReqLocale;
use crate::state::SharedState;

const UP_NEXT_EPISODES: usize = 20;

/// `GET /api/shows/:id/up-next` (Bearer) → `UpNext | null`. The episode to play to
/// continue this show (resume in-progress, else next unwatched, else first).
pub async fn up_next(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(show_id): Path<String>,
    ReqLocale(locale): ReqLocale,
) -> Response {
    if let Err(resp) = visibility::gate_show(&state, &user, &show_id).await {
        return resp;
    }
    match query(&state.db, move |pool| {
        let mut found = db::up_next_episode(&pool, &user.id, &show_id)?;
        db::localize::overlay_each(&pool, found.as_mut().map(|(i, _)| i), locale)?;
        Ok(found)
    })
    .await
    {
        Ok(Some((item, resume))) => Json(crate::model::UpNext { item, resume }).into_response(),
        Ok(None) => Json(Option::<crate::model::UpNext>::None).into_response(),
        Err(resp) => resp,
    }
}

/// `GET /api/items/:id/next` (Bearer) → `MediaItem | null`. The next episode in
/// the show (sequence-based; drives player autoplay).
pub async fn next_episode(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(item_id): Path<String>,
    ReqLocale(locale): ReqLocale,
) -> Response {
    if let Err(resp) = visibility::gate_item(&state, &user, &item_id).await {
        return resp;
    }
    match query(&state.db, move |pool| {
        let mut item = db::next_episode(&pool, &item_id)?;
        db::localize::overlay_each(&pool, item.as_mut(), locale)?;
        Ok(item)
    })
    .await
    {
        Ok(item) => Json(item).into_response(),
        Err(resp) => resp,
    }
}

/// `GET /api/items/:id/following` (Bearer) → `[MediaItem]`. Up to
/// `UP_NEXT_EPISODES` episodes after `id` in its show (sequence order), for the
/// player's "up next" episode rail. Empty for a movie / the last episode.
pub async fn following_episodes(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(item_id): Path<String>,
    ReqLocale(locale): ReqLocale,
) -> Response {
    if let Err(resp) = visibility::gate_item(&state, &user, &item_id).await {
        return resp;
    }
    match query(&state.db, move |pool| {
        let mut items = db::following_episodes(&pool, &item_id, UP_NEXT_EPISODES)?;
        db::localize::overlay_items(&pool, &mut items, locale)?;
        Ok(items)
    })
    .await
    {
        Ok(items) => Json(items).into_response(),
        Err(resp) => resp,
    }
}

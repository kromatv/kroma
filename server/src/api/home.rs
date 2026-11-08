//! `GET /api/home` the generated home screen: an ordered list of [`Section`]s
//! (For You, "because you watched …", themed rows, trending, recently added),
//! assembled + de-duplicated server-side so clients render them generically.

use axum::extract::{Query, State};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

use crate::api::extract::AuthUser;
use crate::api::media::ListView;
use crate::api::util::query;
use crate::api::{etag, visibility};
use crate::i18n::ReqLocale;
use crate::model::{CardSection, Section};
use crate::services::sections;
use crate::state::SharedState;
use axum::routing::get;
use axum::Router;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/home", get(home))
        .route("/home/featured", get(featured))
        .route_layer(axum::middleware::from_fn(etag::revalidate))
}

#[derive(Debug, Deserialize)]
pub struct HomeQuery {
    pub view: Option<ListView>,
}

/// `GET /api/home` (Bearer) → `Section[]`, or with `?view=card` →
/// `CardSection[]`: every entry slimmed to what a poster draws. Personalized to
/// the caller and remembered between visits (see `services::sections::home`);
/// titles are localized via `Accept-Language`.
pub async fn home(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    ReqLocale(locale): ReqLocale,
    Query(q): Query<HomeQuery>,
) -> Response {
    let gen_state = state.clone();
    let user_id = user.id.clone();
    match query(&state.db, move |pool| {
        Ok(sections::home(&gen_state, &pool, locale, &user_id))
    })
    .await
    {
        Ok(list) => {
            let list = visibility::keep_sections(&user, list);
            match q.view {
                Some(ListView::Card) => Json(cards(&list)).into_response(),
                None => Json(list.as_slice()).into_response(),
            }
        }
        Err(resp) => resp,
    }
}

fn cards(list: &[Section]) -> Vec<CardSection> {
    list.iter().cloned().map(CardSection::from).collect()
}

/// `GET /api/home/featured` (Bearer) → `SectionItem | null`: today's hero pick
/// (see `services::sections::featured`). `null` means an empty catalog or a
/// read failure, which is always logged server-side.
pub async fn featured(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    ReqLocale(locale): ReqLocale,
) -> Response {
    let gen_state = state.clone();
    let user_id = user.id.clone();
    match query(&state.db, move |pool| {
        Ok(sections::hero(&gen_state, &pool, locale, &user_id))
    })
    .await
    {
        Ok(hero) => Json(visibility::keep_section_item(&user, hero)).into_response(),
        Err(resp) => resp,
    }
}

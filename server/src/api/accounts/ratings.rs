//! The account's own ratings country (ACCT-104): whose labels its badges show,
//! and so the rating its ceiling compares.

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::i18n;
use crate::model::ratings_countries;
use crate::services::settings;
use crate::state::SharedState;

pub(super) fn routes() -> Router<SharedState> {
    Router::new().route(
        "/auth/me/ratings",
        get(ratings_country).put(set_ratings_country),
    )
}

#[derive(Debug, Serialize)]
pub struct RatingsCountry {
    pub country: Option<String>,
    pub household: String,
    pub countries: Vec<&'static str>,
}

#[derive(Debug, Deserialize)]
pub struct RatingsCountryBody {
    pub country: Option<String>,
}

/// `GET /api/auth/me/ratings` (Bearer) → the account's ratings country, `null`
/// while it follows the household's, the household's own, and every country
/// one may pick.
pub async fn ratings_country(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    let uid = user.id;
    let stored = query(&state.db, move |pool| db::profile_maturity(&pool, &uid)).await?;
    Ok(Json(answer(&state, stored.ratings_country)).into_response())
}

/// `PUT /api/auth/me/ratings` (Bearer) `{ country }` → as `GET`. `null` follows
/// the household's country again; a country no rating system is known for is
/// refused.
pub async fn set_ratings_country(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(body): Json<RatingsCountryBody>,
) -> Result<Response, Response> {
    let country = match body.country.map(|c| c.trim().to_ascii_uppercase()) {
        Some(code) if !ratings_countries().contains(&code.as_str()) => {
            let loc = i18n::user_locale(&user);
            return Err(lerr(
                loc,
                StatusCode::BAD_REQUEST,
                "error.ratingsCountryUnknown",
            ));
        }
        chosen => chosen,
    };
    let uid = user.id;
    let stored = country.clone();
    query(&state.db, move |pool| {
        db::set_ratings_country(&pool, &uid, stored.as_deref())
    })
    .await?;
    state
        .events
        .publish(crate::infra::events::ServerEvent::LibraryUpdated);
    Ok(Json(answer(&state, country)).into_response())
}

fn answer(state: &SharedState, country: Option<String>) -> RatingsCountry {
    RatingsCountry {
        country,
        household: settings::metadata_country(&state.settings, &state.config),
        countries: ratings_countries(),
    }
}

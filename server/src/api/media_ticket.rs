//! Who may read an item's bytes. The byte routes are reached by players that
//! cannot send a header, so they take a session bearer OR a media ticket in the
//! query string, and nothing else (ACCT-35).

use axum::extract::{FromRequestParts, Query};
use axum::http::request::Parts;
use axum::http::StatusCode;
use axum::response::Response;
use serde::Deserialize;

use crate::api::error::json_error;
use crate::api::extract::bearer_from_headers;
use crate::api::util::query;
use crate::db;
use crate::model::User;
use crate::services::media_ticket;
use crate::state::SharedState;

/// The query parameter a ticket travels in, kept short because an HLS playlist
/// repeats it on every segment URI.
pub const PARAM: &str = "t";

const MAX_TICKET_LEN: usize = 256;

/// The ticket a media URL carries. Flattened into the byte routes' own query
/// structs so one `Query` extraction reads both.
#[derive(Debug, Default, Deserialize)]
pub struct TicketQuery {
    #[serde(default)]
    pub t: Option<String>,
}

impl TicketQuery {
    /// The ticket, once it is short enough to be one.
    pub fn ticket(&self) -> Option<&str> {
        self.t
            .as_deref()
            .map(str::trim)
            .filter(|t| !t.is_empty() && t.len() <= MAX_TICKET_LEN)
    }
}

/// The account a media byte request may be answered for. Resolved from the
/// session bearer when there is one, otherwise from the ticket in the URL. The
/// library grant is NOT checked here: a handler still holds the caller to it, so
/// one answer covers an unknown id and an ungranted one alike.
pub struct MediaViewer(pub User);

impl FromRequestParts<SharedState> for MediaViewer {
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &SharedState,
    ) -> Result<Self, Self::Rejection> {
        if let Some(token) = bearer_from_headers(&parts.headers) {
            let user = query(&state.db, move |pool| db::session_user(&pool, &token)).await?;
            return user.map(MediaViewer).ok_or_else(refused);
        }
        let presented = Query::<TicketQuery>::from_request_parts(parts, state)
            .await
            .map_err(|_| refused())?;
        let ticket = presented.ticket().ok_or_else(refused)?.to_string();
        let now = time::OffsetDateTime::now_utc().unix_timestamp();
        let device =
            media_ticket::device_of(&state.media_ticket_key, &ticket, now).ok_or_else(refused)?;
        let user = query(&state.db, move |pool| {
            db::access_token_user_by_id(&pool, &device)
        })
        .await?;
        user.map(MediaViewer).ok_or_else(refused)
    }
}

fn refused() -> Response {
    json_error(StatusCode::UNAUTHORIZED, "media credential required")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn presented(t: &str) -> TicketQuery {
        TicketQuery { t: Some(t.into()) }
    }

    #[test]
    fn a_ticket_is_what_survives_the_bounds() {
        assert_eq!(presented("abc").ticket(), Some("abc"));
        assert_eq!(presented("  abc  ").ticket(), Some("abc"));
        assert!(TicketQuery::default().ticket().is_none());
        assert!(presented("").ticket().is_none());
        assert!(presented("   ").ticket().is_none());
        assert!(presented(&"x".repeat(MAX_TICKET_LEN + 1))
            .ticket()
            .is_none());
    }
}

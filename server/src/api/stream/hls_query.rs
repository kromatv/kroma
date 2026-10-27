//! The query an HLS master request carries in this server: what the client
//! declared its decoders take, which the engine reads, and the media ticket a
//! `<video>` element presents, which is the core's alone.

use axum::extract::{FromRequestParts, Query};
use axum::http::request::Parts;
use axum::response::{IntoResponse, Response};
use kroma_media::program::ClientDecoders;
use serde::Deserialize;

#[derive(Default, Deserialize)]
struct SubtitleQuery {
    subtitle: Option<String>,
}

use crate::api::media_ticket::TicketQuery;
use crate::state::SharedState;

/// Read as two `Query` extractions rather than one `#[serde(flatten)]`, which
/// routes a query string's values through `deserialize_any` and so hands `maxw`
/// and `maxh` a string no `u32` field accepts.
pub struct HlsQuery {
    pub decoders: ClientDecoders,
    pub ticket: TicketQuery,
    pub subtitle: Option<String>,
}

impl FromRequestParts<SharedState> for HlsQuery {
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &SharedState,
    ) -> Result<Self, Self::Rejection> {
        let Query(decoders) = Query::<ClientDecoders>::from_request_parts(parts, state)
            .await
            .map_err(IntoResponse::into_response)?;
        let Query(ticket) = Query::<TicketQuery>::from_request_parts(parts, state)
            .await
            .map_err(IntoResponse::into_response)?;
        let Query(subtitles) = Query::<SubtitleQuery>::from_request_parts(parts, state)
            .await
            .map_err(IntoResponse::into_response)?;
        Ok(HlsQuery {
            decoders,
            ticket,
            subtitle: subtitles.subtitle,
        })
    }
}

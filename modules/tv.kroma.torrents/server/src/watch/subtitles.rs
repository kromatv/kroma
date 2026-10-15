use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderValue, StatusCode};
use axum::response::Response;
use axum::routing::get;
use axum::Router;

use kroma_module_sdk::host::{json_error, HostStorage};

use super::listing::watched_file;
use super::source::{presented, Presented};
use super::vtt::Vtt;
use super::{engine, manager};

const PARTIAL_HEADER: &str = "X-Kroma-Partial";

pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new().route(
        "/watch/{id}/files/{file}/subtitles/{name}",
        get(subtitles::<S>),
    )
}

async fn subtitles<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    Path((id, file, name)): Path<(String, usize, String)>,
    Query(carried): Query<Presented>,
) -> Result<Response, Response> {
    let index: usize = name
        .trim_end_matches(".vtt")
        .parse()
        .map_err(|_| json_error(StatusCode::NOT_FOUND, "no such subtitle track"))?;
    let watched = watched_file(id, file)?;
    let downloads = manager(&state)?;
    presented(&carried, &downloads, &watched)?;
    let found = engine(&state)?
        .subtitles(&downloads, &watched, index)
        .await?;
    Ok(answered(&found))
}

fn marked(partial: bool) -> HeaderValue {
    match partial {
        true => HeaderValue::from_static("1"),
        false => HeaderValue::from_static("0"),
    }
}

// A track that is still growing must not be kept by anything in front of us:
// the next call answers more of the same file.
fn answered(found: &Vtt) -> Response {
    let keeping = match found.partial {
        true => "no-store",
        false => "public, max-age=86400",
    };
    Response::builder()
        .header(header::CONTENT_TYPE, "text/vtt; charset=utf-8")
        .header(header::CACHE_CONTROL, keeping)
        .header(PARTIAL_HEADER, marked(found.partial))
        .body(Body::from(found.body.to_string()))
        .unwrap_or_else(|_| json_error(StatusCode::INTERNAL_SERVER_ERROR, "internal error"))
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;

    fn header_of(response: &Response, name: &str) -> String {
        response
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default()
            .to_string()
    }

    fn found(partial: bool) -> Vtt {
        Vtt {
            body: Arc::new("WEBVTT\n".to_string()),
            partial,
        }
    }

    #[test]
    fn a_track_still_growing_is_marked_partial_and_kept_by_nobody() {
        let response = answered(&found(true));

        assert_eq!(header_of(&response, PARTIAL_HEADER), "1");
        assert_eq!(header_of(&response, "cache-control"), "no-store");
    }

    #[test]
    fn a_track_out_of_a_file_that_is_all_here_may_be_kept() {
        let response = answered(&found(false));

        assert_eq!(header_of(&response, PARTIAL_HEADER), "0");
        assert!(header_of(&response, "cache-control").contains("max-age"));
        assert_eq!(
            header_of(&response, "content-type"),
            "text/vtt; charset=utf-8"
        );
    }
}

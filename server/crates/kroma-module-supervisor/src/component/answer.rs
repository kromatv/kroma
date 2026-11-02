use std::sync::Arc;

use axum::body::{Body, to_bytes};
use axum::extract::{Request as HttpRequest, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response as HttpResponse};
use kroma_wasm_host::{Header, Request};

use super::pool::{Pool, with_a_slot};

const MAX_REQUEST_BYTES: usize = 64 * 1024 * 1024;

pub(super) async fn answer(State(pool): State<Arc<Pool>>, request: HttpRequest) -> HttpResponse {
    let (parts, body) = request.into_parts();
    let Ok(body) = to_bytes(body, MAX_REQUEST_BYTES).await else {
        return StatusCode::PAYLOAD_TOO_LARGE.into_response();
    };
    let call = Request {
        method: parts.method.to_string(),
        path: parts.uri.path_and_query().map_or_else(
            || parts.uri.path().to_string(),
            |path| path.as_str().to_string(),
        ),
        headers: parts
            .headers
            .iter()
            .filter_map(|(name, value)| {
                Some(Header {
                    name: name.as_str().to_string(),
                    value: value.to_str().ok()?.to_string(),
                })
            })
            .collect(),
        body: body.to_vec(),
    };
    match with_a_slot(&pool, move |pool| pool.call(&call)).await {
        Some(Ok(response)) => {
            let mut built = axum::http::Response::builder().status(response.status);
            for header in &response.headers {
                built = built.header(header.name.as_str(), header.value.as_str());
            }
            built
                .body(Body::from(response.body))
                .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
        }
        Some(Err(reason)) => (StatusCode::BAD_GATEWAY, reason).into_response(),
        None => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}

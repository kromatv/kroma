//! The reverse proxy in front of a running sidecar: one shared client, and the
//! header handling a hop-by-hop-aware relay owes its two ends.

#![expect(
    clippy::disallowed_types,
    reason = "the reverse proxy into a sidecar: proxy_to only builds http://127.0.0.1 URLs, so this client never leaves the machine"
)]

use std::time::Duration;

use axum::body::Body;
use axum::extract::Request;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use futures_util::TryStreamExt as _;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
// Bounds the gap between reads, not the length of the response: a whole-request
// deadline would cap how long a module may stream an SSE feed that is supposed
// to stay open.
const READ_TIMEOUT: Duration = Duration::from_secs(600);

// Shared by every proxied request: a client owns the connection pool, so one
// per request means a fresh handshake and a socket left in TIME_WAIT each time.
fn proxy_client() -> &'static reqwest::Client {
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .read_timeout(READ_TIMEOUT)
            .build()
            .unwrap_or_default()
    })
}

// RFC 9110 section 7.6.1: a connection-scoped header describes the hop it
// arrived on, so forwarding one describes a framing the proxied request does not
// have. `content-length` is the same story - the body is re-framed here.
fn is_hop_by_hop(name: &axum::http::HeaderName) -> bool {
    use axum::http::header;
    name == header::CONNECTION
        || name == header::HOST
        || name == header::CONTENT_LENGTH
        || name == header::TRANSFER_ENCODING
        || name == header::UPGRADE
        || name == header::PROXY_AUTHENTICATE
        || name == header::PROXY_AUTHORIZATION
        || name == header::TE
        || name == header::TRAILER
        || name == "keep-alive"
}

/// Reverse-proxy `req` (its path already rewritten to the module-local path) to
/// a module process on `port`.
pub async fn proxy_to(port: u16, path_and_query: &str, req: Request) -> Response {
    let url = format!("http://127.0.0.1:{port}{path_and_query}");
    let (parts, body) = req.into_parts();
    let body = reqwest::Body::wrap_stream(body.into_data_stream());
    let mut out = proxy_client().request(parts.method, &url).body(body);
    for (name, value) in &parts.headers {
        if !is_hop_by_hop(name) {
            out = out.header(name.as_str(), value.as_bytes());
        }
    }
    let resp = match out.send().await {
        Ok(resp) => resp,
        Err(e) => {
            tracing::warn!(port, error = %e, "module proxy failed");
            return (StatusCode::BAD_GATEWAY, "module unavailable").into_response();
        }
    };
    let mut builder = Response::builder().status(resp.status());
    for (name, value) in resp.headers() {
        if !is_hop_by_hop(name) {
            builder = builder.header(name, value);
        }
    }
    // The status line is already sent, so a body that dies here cannot be
    // answered with a 502; the log is the only place the cause survives.
    let body = resp.bytes_stream().inspect_err(move |e| {
        tracing::warn!(port, error = %e, "module response body failed mid-stream");
    });
    builder
        .body(Body::from_stream(body))
        .unwrap_or_else(|_| (StatusCode::BAD_GATEWAY, "bad upstream response").into_response())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::extract::State;
    use axum::routing::post;
    use axum::Router;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    async fn stub_counting_body() -> (u16, Arc<AtomicUsize>) {
        let seen = Arc::new(AtomicUsize::new(0));
        let app = Router::new()
            .route(
                "/echo",
                post(|State(seen): State<Arc<AtomicUsize>>, body: Body| async move {
                    let mut frames = body.into_data_stream();
                    while let Some(Ok(chunk)) = futures_util::StreamExt::next(&mut frames).await {
                        seen.fetch_add(chunk.len(), Ordering::SeqCst);
                    }
                    "ok"
                }),
            )
            .with_state(seen.clone());
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        (port, seen)
    }

    #[tokio::test]
    async fn a_body_far_larger_than_the_old_buffer_cap_is_streamed_through() {
        let (port, seen) = stub_counting_body().await;
        let chunks = 257 * 16;
        let chunk = axum::body::Bytes::from(vec![b'x'; 64 * 1024]);
        let stream = futures_util::stream::iter(
            std::iter::repeat_n(chunk, chunks).map(Ok::<_, std::io::Error>),
        );
        let req = Request::builder()
            .method("POST")
            .body(Body::from_stream(stream))
            .unwrap();

        let resp = proxy_to(port, "/echo", req).await;

        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(seen.load(Ordering::SeqCst), chunks * 64 * 1024);
    }
}

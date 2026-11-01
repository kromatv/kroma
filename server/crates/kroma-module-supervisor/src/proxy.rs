//! The reverse proxy in front of a running sidecar: one shared client, and the
//! header handling a hop-by-hop-aware relay owes its two ends.

#![expect(
    clippy::disallowed_types,
    reason = "the reverse proxy into a sidecar: proxy_to reaches only a module's Unix socket or http://127.0.0.1, so this client never leaves the machine"
)]

use std::time::Duration;

use axum::body::Body;
use axum::extract::Request;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use futures_util::TryStreamExt as _;

use crate::Endpoint;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
// Bounds the gap between reads, not the length of the response: a whole-request
// deadline would cap how long a module may stream an SSE feed that is supposed
// to stay open.
const READ_TIMEOUT: Duration = Duration::from_secs(600);

fn builder() -> reqwest::ClientBuilder {
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .read_timeout(READ_TIMEOUT)
}

// Shared by every proxied request: a client owns the connection pool, so one
// per request means a fresh handshake and a socket left in TIME_WAIT each time.
fn tcp_client() -> &'static reqwest::Client {
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    CLIENT.get_or_init(|| builder().build().unwrap_or_default())
}

#[cfg(unix)]
fn socket_client(socket: &std::path::Path) -> Option<reqwest::Client> {
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::{Mutex, OnceLock};
    static CLIENTS: OnceLock<Mutex<HashMap<PathBuf, reqwest::Client>>> = OnceLock::new();
    let mut clients = CLIENTS.get_or_init(Mutex::default).lock().ok()?;
    if let Some(client) = clients.get(socket) {
        return Some(client.clone());
    }
    let client = builder().unix_socket(socket).build().ok()?;
    clients.insert(socket.to_path_buf(), client.clone());
    Some(client)
}

#[cfg(not(unix))]
fn socket_client(_socket: &std::path::Path) -> Option<reqwest::Client> {
    None
}

fn target(endpoint: &Endpoint, path_and_query: &str) -> Option<(reqwest::Client, String)> {
    match endpoint {
        Endpoint::Tcp(port) => Some((
            tcp_client().clone(),
            format!("http://127.0.0.1:{port}{path_and_query}"),
        )),
        Endpoint::Unix(socket) => Some((
            socket_client(socket)?,
            format!("http://localhost{path_and_query}"),
        )),
    }
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
/// the module process answering at `endpoint`.
pub async fn proxy_to(endpoint: &Endpoint, path_and_query: &str, req: Request) -> Response {
    let Some((client, url)) = target(endpoint, path_and_query) else {
        tracing::warn!(?endpoint, "no client reaches this module");
        return (StatusCode::BAD_GATEWAY, "module unavailable").into_response();
    };
    let (parts, body) = req.into_parts();
    let body = reqwest::Body::wrap_stream(body.into_data_stream());
    let mut out = client.request(parts.method, &url).body(body);
    for (name, value) in &parts.headers {
        if !is_hop_by_hop(name) {
            out = out.header(name.as_str(), value.as_bytes());
        }
    }
    let resp = match out.send().await {
        Ok(resp) => resp,
        Err(e) => {
            tracing::warn!(?endpoint, error = %e, "module proxy failed");
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
    let endpoint = endpoint.clone();
    let body = resp.bytes_stream().inspect_err(move |e| {
        tracing::warn!(?endpoint, error = %e, "module response body failed mid-stream");
    });
    builder
        .body(Body::from_stream(body))
        .unwrap_or_else(|_| (StatusCode::BAD_GATEWAY, "bad upstream response").into_response())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::extract::State;
    use axum::routing::{get, post};
    use axum::Router;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    fn counting_body(seen: Arc<AtomicUsize>) -> Router {
        Router::new()
            .route(
                "/echo",
                post(
                    |State(seen): State<Arc<AtomicUsize>>, body: Body| async move {
                        let mut frames = body.into_data_stream();
                        while let Some(Ok(chunk)) = futures_util::StreamExt::next(&mut frames).await
                        {
                            seen.fetch_add(chunk.len(), Ordering::SeqCst);
                        }
                        "ok"
                    },
                ),
            )
            .with_state(seen)
    }

    async fn on_a_port(app: Router) -> Endpoint {
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        Endpoint::Tcp(port)
    }

    #[cfg(unix)]
    fn on_a_socket(app: Router, socket: &std::path::Path) -> Endpoint {
        let listener = tokio::net::UnixListener::bind(socket).unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        Endpoint::Unix(socket.to_path_buf())
    }

    #[tokio::test]
    async fn a_body_far_larger_than_the_old_buffer_cap_is_streamed_through() {
        let seen = Arc::new(AtomicUsize::new(0));
        let endpoint = on_a_port(counting_body(seen.clone())).await;
        let chunks = 257 * 16;
        let chunk = axum::body::Bytes::from(vec![b'x'; 64 * 1024]);
        let stream = futures_util::stream::iter(
            std::iter::repeat_n(chunk, chunks).map(Ok::<_, std::io::Error>),
        );
        let req = Request::builder()
            .method("POST")
            .body(Body::from_stream(stream))
            .unwrap();

        let resp = proxy_to(&endpoint, "/echo", req).await;

        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(seen.load(Ordering::SeqCst), chunks * 64 * 1024);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_module_on_a_socket_gets_the_request_with_its_bearer_and_query() {
        let dir = kroma_testing::temp_dir("proxy-unix");
        let app = Router::new().route(
            "/_port/x",
            get(
                |headers: axum::http::HeaderMap, uri: axum::http::Uri| async move {
                    format!(
                        "{} {}",
                        headers["authorization"].to_str().unwrap(),
                        uri.query().unwrap_or_default()
                    )
                },
            ),
        );
        let endpoint = on_a_socket(app, &dir.path().join("m.sock"));
        let req = Request::builder()
            .header("authorization", "Bearer port-token")
            .body(Body::empty())
            .unwrap();

        let resp = proxy_to(&endpoint, "/_port/x?k=v", req).await;

        assert_eq!(resp.status(), StatusCode::OK);
        let body = axum::body::to_bytes(resp.into_body(), 1024).await.unwrap();
        assert_eq!(body, "Bearer port-token k=v");
    }

    #[tokio::test]
    async fn a_module_whose_socket_is_gone_is_a_bad_gateway() {
        let dir = kroma_testing::temp_dir("proxy-gone");
        let endpoint = Endpoint::Unix(dir.path().join("gone.sock"));

        let resp = proxy_to(&endpoint, "/_health", Request::new(Body::empty())).await;

        assert_eq!(resp.status(), StatusCode::BAD_GATEWAY);
    }
}

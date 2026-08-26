//! The reverse proxy in front of a running sidecar: one shared client, and the
//! header handling a hop-by-hop-aware relay owes its two ends.

use std::time::Duration;

use axum::body::Body;
use axum::extract::Request;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use futures_util::TryStreamExt as _;

const MAX_PROXY_BODY_BYTES: usize = 256 * 1024 * 1024;
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
    // Mounted outside the core session gate and buffered before the target
    // module authenticates it, so an unbounded read is a pre-auth
    // memory-exhaustion DoS.
    let bytes = match axum::body::to_bytes(body, MAX_PROXY_BODY_BYTES).await {
        Ok(b) => b,
        Err(_) => return (StatusCode::PAYLOAD_TOO_LARGE, "body too large").into_response(),
    };
    let mut out = proxy_client().request(parts.method, &url).body(bytes);
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

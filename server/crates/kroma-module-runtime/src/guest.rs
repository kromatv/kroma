//! A module as a WebAssembly component. The same [`crate::serve`] builds its
//! router, and the host calls it: there is no socket, no process and no thread,
//! and everything that leaves goes through an import the host rules.

use std::sync::{Arc, OnceLock};

use anyhow::{anyhow, Result};
use axum::body::Body;
use http_body_util::BodyExt;
use kroma_http::loopback::{register, Request as LoopbackRequest, Transport};
use kroma_http::{GuestCall, Response as HttpResponse};
use tower::ServiceExt;

wit_bindgen::generate!({
    path: "wit",
    world: "module",
    pub_export_macro: true,
    export_macro_name: "export_module",
    default_bindings_module: "kroma_module_runtime::guest",
});

pub use exports::kroma::module::route::{Guest, Request, Response};
use kroma::module::types::Header;
use kroma::module::{host_api, net};

mod outside;
#[cfg(feature = "storage")]
mod sql;

const TICK: std::time::Duration = std::time::Duration::from_millis(1);

static ROUTER: OnceLock<axum::Router> = OnceLock::new();
static STOP: OnceLock<Box<dyn Fn() -> std::pin::Pin<Box<dyn std::future::Future<Output = ()>>> + Send + Sync>> =
    OnceLock::new();
static RUNTIME: OnceLock<tokio::runtime::Runtime> = OnceLock::new();

fn runtime() -> &'static tokio::runtime::Runtime {
    RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .expect("a current-thread runtime needs nothing the host withholds")
    })
}

/// Drive `future` to its end on this component's one thread.
pub fn block_on<F: std::future::Future>(future: F) -> F::Output {
    runtime().block_on(future)
}

pub(crate) fn install_router(router: axum::Router) {
    let _ = ROUTER.set(router);
}

fn headers_of(pairs: &[(String, String)]) -> Vec<Header> {
    pairs
        .iter()
        .map(|(name, value)| Header {
            name: name.clone(),
            value: value.clone(),
        })
        .collect()
}

fn request_of(call: &GuestCall) -> net::FetchRequest {
    net::FetchRequest {
        purpose: call.purpose.clone(),
        method: call.method.clone(),
        url: call.url.clone(),
        headers: headers_of(&call.headers),
        body: call.body.clone(),
        max_time_secs: call.max_time_secs,
        max_bytes: call.max_bytes,
        max_redirects: call.max_redirects,
        follow_redirects: call.follow_redirects,
        public_only: call.public_only,
        https_only: call.https_only,
        sealed: call.sealed,
        http2: call.http2,
        digest: call.digest.clone(),
    }
}

fn fetch_through_the_host(call: &GuestCall) -> Result<HttpResponse> {
    net::fetch(&request_of(call))
        .map(response_of)
        .map_err(|reason| anyhow!(reason))
}

fn download_through_the_host(call: &GuestCall, destination: &std::path::Path) -> Result<HttpResponse> {
    net::download(&request_of(call), &destination.to_string_lossy())
        .map(response_of)
        .map_err(|reason| anyhow!(reason))
}

fn response_of(response: kroma::module::types::Response) -> HttpResponse {
    HttpResponse {
        status: response.status,
        headers: response
            .headers
            .into_iter()
            .map(|header| (header.name, header.value))
            .collect(),
        body: response.body,
    }
}

// Every internal URL is the host's API or a peer through it, so what matters is
// the path: the host answers on this module's behalf and checks that.
struct ThroughTheHost;

impl Transport for ThroughTheHost {
    fn name(&self) -> &'static str {
        "component host"
    }

    fn accepts(&self, _url: &str) -> bool {
        true
    }

    fn send(&self, request: &LoopbackRequest<'_>) -> Result<HttpResponse> {
        host_api::call(&wire_request(request))
            .map(response_of)
            .map_err(|reason| anyhow!(reason))
    }

    fn send_all(&self, requests: &[LoopbackRequest<'_>]) -> Vec<Result<HttpResponse>> {
        let wire: Vec<_> = requests.iter().map(wire_request).collect();
        host_api::call_all(&wire)
            .into_iter()
            .map(|answer| answer.map(response_of).map_err(|reason| anyhow!(reason)))
            .collect()
    }
}

fn wire_request(request: &LoopbackRequest<'_>) -> kroma::module::types::Request {
    let mut headers = headers_of(request.headers);
    let body = match request.body {
        Some((content_type, body)) => {
            headers.push(Header {
                name: "content-type".to_string(),
                value: content_type.to_string(),
            });
            body.to_vec()
        }
        None => Vec::new(),
    };
    kroma::module::types::Request {
        method: request.method.as_str().to_string(),
        path: path_of(request.url),
        headers,
        body,
    }
}

fn path_of(url: &str) -> String {
    let after_scheme = url.split_once("://").map_or(url, |(_, rest)| rest);
    match after_scheme.find('/') {
        Some(at) => after_scheme[at..].to_string(),
        None => "/".to_string(),
    }
}

/// Connect this component's HTTP clients to its host. Runs once, before `start`.
pub(crate) fn connect_to_host() {
    register(Arc::new(ThroughTheHost));
    kroma_http::set_guest_fetcher(fetch_through_the_host, download_through_the_host);
    kroma_module_host::outside::connect(&outside::THROUGH_THE_HOST);
    #[cfg(feature = "storage")]
    kroma_sqlite::guest::set_backend(&sql::THROUGH_THE_HOST);
}

pub(crate) fn on_stop(stop: impl Fn() -> std::pin::Pin<Box<dyn std::future::Future<Output = ()>>> + Send + Sync + 'static) {
    let _ = STOP.set(Box::new(stop));
}

static STARTED: OnceLock<Result<(), String>> = OnceLock::new();

fn started(start: fn() -> Result<()>) -> &'static Result<(), String> {
    STARTED.get_or_init(|| {
        connect_to_host();
        start().map_err(|error| format!("{error:#}"))
    })
}

/// Let what the module left running advance for a moment, starting the module if
/// no call has yet. Answers whether anything is still running.
pub fn tick(start: fn() -> Result<()>) -> bool {
    let _ = started(start);
    block_on(async { tokio::time::sleep(TICK).await });
    runtime().metrics().num_alive_tasks() > 0
}

/// Run the module's `on_disable`, if it ever started.
pub fn stop() {
    if STARTED.get().is_none() {
        return;
    }
    if let Some(stop) = STOP.get() {
        block_on(stop());
    }
}

/// What `export_component!` answers each call with: the module started on the
/// first one, then the request through its router.
pub fn handle(request: Request, start: fn() -> Result<()>) -> Response {
    if let Err(reason) = started(start) {
        return failed(500, reason);
    }
    let Some(router) = ROUTER.get().cloned() else {
        return failed(500, "the module did not build its routes");
    };
    let mut built = axum::http::Request::builder()
        .method(request.method.as_str())
        .uri(request.path.as_str());
    for header in &request.headers {
        built = built.header(header.name.as_str(), header.value.as_str());
    }
    let Ok(built) = built.body(Body::from(request.body)) else {
        return failed(400, "the request could not be read");
    };
    block_on(async move {
        let response = match router.oneshot(built).await {
            Ok(response) => response,
            Err(never) => match never {},
        };
        let status = response.status().as_u16();
        let headers = response
            .headers()
            .iter()
            .filter_map(|(name, value)| {
                Some(Header {
                    name: name.as_str().to_string(),
                    value: value.to_str().ok()?.to_string(),
                })
            })
            .collect();
        match response.into_body().collect().await {
            Ok(body) => Response {
                status,
                headers,
                body: body.to_bytes().to_vec(),
            },
            Err(_) => failed(500, "the response could not be read"),
        }
    })
}

fn failed(status: u16, reason: &str) -> Response {
    Response {
        status,
        headers: Vec::new(),
        body: reason.as_bytes().to_vec(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_url_comes_down_to_its_path_and_query() {
        assert_eq!(
            path_of("http+unix://%2Frun%2Fhost.sock/api/_host/settings?key=a"),
            "/api/_host/settings?key=a"
        );
    }
}

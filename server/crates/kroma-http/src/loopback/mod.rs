//! The transport for the internal seam: the core and its modules
//! calling each other on this machine.

#[cfg(not(target_family = "wasm"))]
mod exchange;
#[cfg(not(target_family = "wasm"))]
mod tcp;
mod transport;
#[cfg(not(target_family = "wasm"))]
mod unix;

use std::sync::{Arc, OnceLock, RwLock};
use std::time::Duration;

use anyhow::{bail, Result};

use crate::response::Response;
#[cfg(not(target_family = "wasm"))]
pub use exchange::MAX_BODY_BYTES;
#[cfg(not(target_family = "wasm"))]
pub use tcp::Tcp;
pub use transport::{Method, Request, Transport};
#[cfg(not(target_family = "wasm"))]
pub use unix::unix_url;
#[cfg(unix)]
pub use unix::Unix;

/// The most a response may carry.
#[cfg(target_family = "wasm")]
pub const MAX_BODY_BYTES: usize = 64 * 1024 * 1024;

const DEFAULT_MAX_TIME_SECS: u32 = 30;

fn registry() -> &'static RwLock<Vec<Arc<dyn Transport>>> {
    static REGISTRY: OnceLock<RwLock<Vec<Arc<dyn Transport>>>> = OnceLock::new();
    REGISTRY.get_or_init(|| RwLock::new(built_in()))
}

#[cfg(not(target_family = "wasm"))]
fn built_in() -> Vec<Arc<dyn Transport>> {
    let mut transports: Vec<Arc<dyn Transport>> = vec![Arc::new(Tcp)];
    #[cfg(unix)]
    transports.push(Arc::new(Unix));
    transports
}

#[cfg(target_family = "wasm")]
fn built_in() -> Vec<Arc<dyn Transport>> {
    Vec::new()
}

/// Add a transport ahead of the built-in ones, for the URLs its
/// [`Transport::accepts`] claims. Registered last wins.
pub fn register(transport: Arc<dyn Transport>) {
    registry()
        .write()
        .expect("the transport registry was poisoned")
        .push(transport);
}

fn transport_for(url: &str) -> Result<Arc<dyn Transport>> {
    let transports = registry()
        .read()
        .expect("the transport registry was poisoned");
    if let Some(transport) = transports.iter().rev().find(|t| t.accepts(url)) {
        return Ok(Arc::clone(transport));
    }
    let declined = transports.iter().map(|t| t.name()).collect::<Vec<_>>();
    bail!(
        "no loopback transport reaches {url} (declined by: {})",
        declined.join(", ")
    )
}

/// A prepared exchange with another KROMA process.
///
/// Builder-style options, then one of the executors ([`Loopback::get`],
/// [`Loopback::post_json`], [`Loopback::post_bytes`]). Each blocks the calling
/// thread.
#[derive(Debug, Clone)]
pub struct Loopback {
    headers: Vec<(String, String)>,
    query: Vec<(String, String)>,
    max_time_secs: u32,
}

impl Default for Loopback {
    fn default() -> Self {
        Self {
            headers: Vec::new(),
            query: Vec::new(),
            max_time_secs: DEFAULT_MAX_TIME_SECS,
        }
    }
}

crate::builder::request_builder!(Loopback, query = "URL-encoded query parameter.");

impl Loopback {
    pub fn get(&self, url: &str) -> Result<Response> {
        self.send(Method::Get, url, None)
    }

    /// GET expecting a 2xx JSON body.
    pub fn get_json<T: serde::de::DeserializeOwned>(&self, url: &str) -> Result<T> {
        self.get(url)?.ensure_ok()?.json()
    }

    pub fn post_json(&self, url: &str, body: &serde_json::Value) -> Result<Response> {
        let bytes = serde_json::to_vec(body)?;
        self.send(Method::Post, url, Some(("application/json", &bytes)))
    }

    pub fn post_bytes(&self, url: &str, content_type: &str, body: &[u8]) -> Result<Response> {
        self.send(Method::Post, url, Some((content_type, body)))
    }

    /// POST each `(url, body)`, none waiting on another. Answers in the same order.
    /// For a sweep: a WebAssembly component has one thread, so this is its only way
    /// to ask several peers at once.
    pub fn post_json_all(&self, calls: &[(String, serde_json::Value)]) -> Vec<Result<Response>> {
        #[cfg(not(target_family = "wasm"))]
        {
            std::thread::scope(|threads| {
                let running: Vec<_> = calls
                    .iter()
                    .map(|(url, body)| threads.spawn(move || self.post_json(url, body)))
                    .collect();
                running
                    .into_iter()
                    .map(|call| call.join().unwrap_or_else(|_| bail_panicked()))
                    .collect()
            })
        }
        #[cfg(target_family = "wasm")]
        {
            let urls: Vec<String> = calls.iter().map(|(url, _)| self.with_query(url)).collect();
            let bodies: Vec<Vec<u8>> = calls
                .iter()
                .map(|(_, body)| serde_json::to_vec(body).unwrap_or_default())
                .collect();
            let Some(first) = urls.first() else {
                return Vec::new();
            };
            let transport = match transport_for(first) {
                Ok(transport) => transport,
                Err(error) => {
                    let reason = format!("{error:#}");
                    return calls.iter().map(|_| Err(anyhow::anyhow!(reason.clone()))).collect();
                }
            };
            let requests: Vec<Request<'_>> = urls
                .iter()
                .zip(&bodies)
                .map(|(url, body)| Request {
                    method: Method::Post,
                    url,
                    headers: &self.headers,
                    body: Some(("application/json", body.as_slice())),
                    timeout: Duration::from_secs(u64::from(self.max_time_secs)),
                })
                .collect();
            transport.send_all(&requests)
        }
    }

    fn with_query(&self, url: &str) -> String {
        if self.query.is_empty() {
            return url.to_string();
        }
        let encoded = form_urlencoded::Serializer::new(String::new())
            .extend_pairs(self.query.iter().map(|(k, v)| (k.as_str(), v.as_str())))
            .finish();
        let (before, fragment) = match url.split_once('#') {
            Some((before, fragment)) => (before, Some(fragment)),
            None => (url, None),
        };
        let separator = if before.contains('?') { '&' } else { '?' };
        match fragment {
            Some(fragment) => format!("{before}{separator}{encoded}#{fragment}"),
            None => format!("{before}{separator}{encoded}"),
        }
    }

    fn send(&self, method: Method, url: &str, body: Option<(&str, &[u8])>) -> Result<Response> {
        let url = self.with_query(url);
        transport_for(&url)?.send(&Request {
            method,
            url: &url,
            headers: &self.headers,
            body,
            timeout: Duration::from_secs(u64::from(self.max_time_secs)),
        })
    }
}

#[cfg(not(target_family = "wasm"))]
fn bail_panicked() -> Result<Response> {
    bail!("the call panicked")
}

#[cfg(test)]
mod tests;

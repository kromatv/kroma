//! The transport for the internal seam: the core and its module sidecars
//! calling each other on this machine.

mod tcp;
mod transport;

use std::sync::{Arc, OnceLock, RwLock};
use std::time::Duration;

use anyhow::{bail, Result};

use crate::response::Response;
pub use tcp::{Tcp, MAX_BODY_BYTES};
pub use transport::{Method, Request, Transport};

const DEFAULT_MAX_TIME_SECS: u32 = 30;

fn registry() -> &'static RwLock<Vec<Arc<dyn Transport>>> {
    static REGISTRY: OnceLock<RwLock<Vec<Arc<dyn Transport>>>> = OnceLock::new();
    REGISTRY.get_or_init(|| RwLock::new(vec![Arc::new(Tcp)]))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug)]
    struct Stub(&'static str);

    impl Transport for Stub {
        fn name(&self) -> &'static str {
            "stub"
        }

        fn accepts(&self, url: &str) -> bool {
            url.starts_with(self.0)
        }

        fn send(&self, request: &Request<'_>) -> Result<Response> {
            Ok(Response {
                status: 200,
                headers: vec![("x-transport".into(), self.name().into())],
                body: format!("{} {}", request.method.as_str(), request.url).into_bytes(),
            })
        }
    }

    #[test]
    fn a_url_no_transport_claims_is_an_error_naming_it() {
        let err = Loopback::new()
            .get("http://example.com/_port/x")
            .unwrap_err()
            .to_string();
        assert!(err.contains("example.com"), "{err}");
    }

    #[test]
    fn a_registered_transport_takes_the_urls_it_claims() {
        register(Arc::new(Stub("stub://")));

        let resp = Loopback::new().get("stub://peer/_port/x").unwrap();

        assert_eq!(resp.status, 200);
        assert_eq!(resp.header("x-transport"), Some("stub"));
        assert_eq!(resp.text(), "GET stub://peer/_port/x");
    }

    #[test]
    fn a_post_carries_its_query_rather_than_dropping_it() {
        register(Arc::new(Stub("stub://")));

        let resp = Loopback::new()
            .query("id", "a b")
            .post_json("stub://peer/_port/x", &serde_json::json!({}))
            .unwrap();

        assert_eq!(resp.text(), "POST stub://peer/_port/x?id=a+b");
    }

    #[test]
    fn a_query_goes_before_a_fragment_rather_than_inside_it() {
        let call = Loopback::new().query("k", "v");
        assert_eq!(
            call.with_query("http://127.0.0.1:9/x#frag"),
            "http://127.0.0.1:9/x?k=v#frag"
        );
    }

    #[test]
    fn a_query_is_form_encoded_onto_the_url() {
        let call = Loopback::new()
            .query("q", "the matrix")
            .query("cat", "2000&2010");

        assert_eq!(
            call.with_query("http://127.0.0.1:9/search"),
            "http://127.0.0.1:9/search?q=the+matrix&cat=2000%262010"
        );
    }

    #[test]
    fn a_url_that_already_carries_a_query_gains_the_pairs_rather_than_a_second_question_mark() {
        let call = Loopback::new().query("key", "a b");
        assert_eq!(
            call.with_query("http://127.0.0.1:9/setting?scope=x"),
            "http://127.0.0.1:9/setting?scope=x&key=a+b"
        );
        assert_eq!(
            Loopback::new().with_query("http://127.0.0.1:9/setting"),
            "http://127.0.0.1:9/setting"
        );
    }

    #[test]
    fn the_builder_accumulates_headers_and_a_budget() {
        let call = Loopback::new()
            .header("authorization", "Bearer tok")
            .header("x-extra", "1")
            .max_time(5);
        assert_eq!(call.headers.len(), 2);
        assert_eq!(call.max_time_secs, 5);
        assert_eq!(Loopback::new().max_time_secs, DEFAULT_MAX_TIME_SECS);
    }
}

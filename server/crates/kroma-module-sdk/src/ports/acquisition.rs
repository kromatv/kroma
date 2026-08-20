//! The acquisition module's interactive-search + manual-grab contract, consumed
//! by the core's `/api/requests/:id/search` + `/grab` endpoints.

/// The acquisition module's interactive-search + manual-grab surface, consumed by
/// the core's `/api/requests/:id/search` + `/grab` endpoints so those keep a
/// stable URL while the logic runs in the acquisition sidecar. The scored-releases
/// view crosses the wire as opaque JSON (the core just forwards it); `grab` returns
/// the enqueued download id and backgrounds the slow engine add provider-side.
pub trait AcquisitionSearchPort: Send + Sync {
    // Live interactive search for one request over `scope` (opaque JSON, shaped
    // by the acquisition module's SearchScope); the scored-releases view as JSON.
    fn interactive_search(
        &self,
        host: &dyn HostCtx,
        request_id: &str,
        scope: &serde_json::Value,
    ) -> anyhow::Result<serde_json::Value>;
    // Grab one release from the last interactive search of that same scope;
    // returns the download id.
    fn grab(
        &self,
        host: &dyn HostCtx,
        request_id: &str,
        scope: &serde_json::Value,
        guid: &str,
        indexer_id: &str,
    ) -> anyhow::Result<String>;
}

use kroma_module_host::{call, HostCtx, Resolver};
use serde_json::json;


pub struct AcquisitionSearchClient {
    resolve: Resolver,
}

impl AcquisitionSearchClient {
    pub fn new(resolve: Resolver) -> Self {
        Self { resolve }
    }
}

impl AcquisitionSearchPort for AcquisitionSearchClient {
    fn interactive_search(
        &self,
        _host: &dyn HostCtx,
        request_id: &str,
        scope: &serde_json::Value,
    ) -> anyhow::Result<serde_json::Value> {
        call(
            &self.resolve,
            "acqsearch/search",
            &json!({ "request_id": request_id, "scope": scope }),
        )
    }

    fn grab(
        &self,
        _host: &dyn HostCtx,
        request_id: &str,
        scope: &serde_json::Value,
        guid: &str,
        indexer_id: &str,
    ) -> anyhow::Result<String> {
        call(
            &self.resolve,
            "acqsearch/grab",
            &json!({
                "request_id": request_id,
                "scope": scope,
                "guid": guid,
                "indexer_id": indexer_id,
            }),
        )
    }
}

/// The contract name for [`AcquisitionSearchPort`]. A consumer asks the host for THIS, and
/// whichever module declares it in its manifest `ports` answers.
pub const ACQUISITION_SEARCH: &str = "acquisition-search";

/// The [`AcquisitionSearchPort`] served by whichever module currently provides it, or `None`
/// when none is installed, enabled and running.
pub fn acquisition_search(host: &dyn HostCtx) -> Option<std::sync::Arc<dyn AcquisitionSearchPort>> {
    let endpoint = host.port_endpoint(ACQUISITION_SEARCH)?;
    let resolve: kroma_module_host::Resolver =
        std::sync::Arc::new(move || Some(endpoint.clone()));
    Some(std::sync::Arc::new(AcquisitionSearchClient::new(resolve)))
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;

    use kroma_module_host::testing::StubHost;

    fn all() -> serde_json::Value {
        json!({ "kind": "all" })
    }

    #[test]
    fn client_offline_errors() {
        let c = AcquisitionSearchClient::new(Arc::new(|| None));
        assert!(c.interactive_search(&StubHost::new(), "req-1", &all()).is_err());
        assert!(c.grab(&StubHost::new(), "req-1", &all(), "guid-1", "idx-1").is_err());
    }
    // The provider half lives in the acquisition crate (its grab handler needs
    // an owned host), so this stands a router in for it. That makes the test
    // about the CONTRACT: the exact paths and body keys the two halves have to
    // agree on, which nothing else checks.

    use axum::{routing::post, Json, Router};
    use std::sync::Mutex;

    async fn serve(
        seen: Arc<Mutex<Vec<(String, serde_json::Value)>>>,
        answer: Result<serde_json::Value, String>,
    ) -> Resolver {
        let for_search = seen.clone();
        let search_answer = answer.clone();
        let for_grab = seen.clone();
        let grab_answer = answer;

        let app = Router::new()
            .route(
                "/_port/acqsearch/search",
                post(move |Json(body): Json<serde_json::Value>| {
                    let seen = for_search.clone();
                    let answer = search_answer.clone();
                    async move {
                        seen.lock().unwrap().push(("search".into(), body));
                        Json(answer)
                    }
                }),
            )
            .route(
                "/_port/acqsearch/grab",
                post(move |Json(body): Json<serde_json::Value>| {
                    let seen = for_grab.clone();
                    let answer = grab_answer.clone();
                    async move {
                        seen.lock().unwrap().push(("grab".into(), body));
                        Json(answer.map(|v| {
                            v.get("id").and_then(serde_json::Value::as_str).unwrap_or("dl-1").to_string()
                        }))
                    }
                }),
            );

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });
        let base = format!("http://{addr}");
        Arc::new(move || Some((base.clone(), "test-token".to_string())))
    }

    async fn blocking<T: Send + 'static>(job: impl FnOnce() -> T + Send + 'static) -> T {
        tokio::task::spawn_blocking(job).await.unwrap()
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn an_interactive_search_sends_the_request_id_and_returns_the_result() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let resolve = serve(seen.clone(), Ok(json!({ "releases": [{ "guid": "g1" }] }))).await;

        let c = AcquisitionSearchClient::new(resolve);
        let out = blocking(move || {
            c.interactive_search(&StubHost::new(), "req-1", &json!({ "kind": "episode", "season": 3, "episode": 7 }))
        })
        .await
        .unwrap();
        assert_eq!(out["releases"][0]["guid"], "g1");

        let calls = seen.lock().unwrap();
        assert_eq!(calls[0].0, "search");
        // The body keys are half of the contract with the acquisition crate's own
        // handler; renaming one on either side breaks interactive search with no
        // compile error anywhere.
        assert_eq!(calls[0].1["request_id"], "req-1");
        // The scope crosses whole: a search narrowed to one episode that arrives
        // as a whole-request sweep would grab the wrong thing.
        assert_eq!(calls[0].1["scope"]["kind"], "episode");
        assert_eq!(calls[0].1["scope"]["season"], 3);
        assert_eq!(calls[0].1["scope"]["episode"], 7);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_grab_names_the_release_and_the_indexer_it_came_from() {
        // A guid is only meaningful together with the indexer that issued it, so
        // both have to cross - otherwise the far side grabs from the wrong one.
        let seen = Arc::new(Mutex::new(Vec::new()));
        let resolve = serve(seen.clone(), Ok(json!({ "id": "dl-42" }))).await;

        let c = AcquisitionSearchClient::new(resolve);
        let id = blocking(move || {
            c.grab(&StubHost::new(), "req-1", &json!({ "kind": "season", "season": 2 }), "guid-9", "idx-7")
        })
        .await
        .unwrap();
        assert_eq!(id, "dl-42");

        let calls = seen.lock().unwrap();
        assert_eq!(calls[0].0, "grab");
        assert_eq!(calls[0].1["request_id"], "req-1");
        assert_eq!(calls[0].1["guid"], "guid-9");
        assert_eq!(calls[0].1["indexer_id"], "idx-7");
        // The scope has to match the search that listed this guid, or the far
        // side misses its cache and re-sweeps under the wrong shape.
        assert_eq!(calls[0].1["scope"]["kind"], "season");
        assert_eq!(calls[0].1["scope"]["season"], 2);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_provider_error_crosses_as_an_error() {
        // The user is watching an interactive search; "no results" instead of
        // "your indexer rejected the credentials" is the wrong thing to show.
        let seen = Arc::new(Mutex::new(Vec::new()));
        let resolve = serve(seen, Err("indexer rejected the credentials".to_string())).await;

        let c = AcquisitionSearchClient::new(resolve);
        let err = blocking(move || c.interactive_search(&StubHost::new(), "req-1", &all()))
            .await
            .unwrap_err()
            .to_string();
        assert!(err.contains("rejected the credentials"), "{err}");
    }
}

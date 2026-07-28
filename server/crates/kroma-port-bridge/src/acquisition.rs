//! Consumer-side client for the acquisition module's `AcquisitionSearchPort`,
//! consumed by the CORE (the `/api/requests/:id/search` + `/grab` endpoints).
//!
//! Unlike the other bridges, the PROVIDER routes live in the acquisition crate
//! (`serve.rs`): the `grab` handler needs the owned host to background the slow
//! engine add, which the generic bridge can't express. This half is just the
//! client the core resolves as `Arc<dyn AcquisitionSearchPort>`.

use kroma_module_host::HostCtx;
use kroma_module_sdk::ports::AcquisitionSearchPort;
use serde_json::json;

use crate::{call, Resolver};

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
    ) -> anyhow::Result<serde_json::Value> {
        call(&self.resolve, "acqsearch/search", &json!({ "request_id": request_id }))
    }

    fn grab(
        &self,
        _host: &dyn HostCtx,
        request_id: &str,
        guid: &str,
        indexer_id: &str,
    ) -> anyhow::Result<String> {
        call(
            &self.resolve,
            "acqsearch/grab",
            &json!({ "request_id": request_id, "guid": guid, "indexer_id": indexer_id }),
        )
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;

    #[derive(Clone)]
    struct MockHost;
    impl HostCtx for MockHost {
        fn db(&self) -> &kroma_module_sdk::db::Pool {
            unimplemented!()
        }
        fn data_dir(&self) -> &std::path::Path {
            std::path::Path::new("/tmp")
        }
        fn require(
            &self,
            _user: &kroma_module_sdk::domain::User,
            _perm: kroma_module_sdk::domain::Permission,
        ) -> Result<(), axum::response::Response> {
            Ok(())
        }
        fn require_any_admin(
            &self,
            _user: &kroma_module_sdk::domain::User,
        ) -> Result<(), axum::response::Response> {
            Ok(())
        }
        fn lerr(
            &self,
            _user: &kroma_module_sdk::domain::User,
            _status: axum::http::StatusCode,
            _key: &str,
        ) -> axum::response::Response {
            unimplemented!()
        }
        fn setting_str(&self, _key: &str, default: &str) -> String {
            default.to_string()
        }
        fn setting_bool(&self, _key: &str, default: bool) -> bool {
            default
        }
        fn setting_i64(&self, _key: &str, default: i64) -> i64 {
            default
        }
        fn set_settings(&self, _patch: std::collections::BTreeMap<String, serde_json::Value>) {}
        fn publish(&self, _event: kroma_module_host::Event) {}
        fn trigger_job(&self, _key: &'static str, _reason: &'static str) {}
        fn module_enabled(&self, _id: &str) -> bool {
            true
        }
        fn library_folders(&self) -> Vec<kroma_module_host::LibraryFolders> {
            Vec::new()
        }
        fn tmdb_api_key(&self) -> Option<String> {
            None
        }
        fn metadata_language(&self) -> String {
            "en".into()
        }
        fn get_service(
            &self,
            _type_id: std::any::TypeId,
        ) -> Option<Arc<dyn std::any::Any + Send + Sync>> {
            None
        }
    }

    #[test]
    fn client_offline_errors() {
        let c = AcquisitionSearchClient::new(Arc::new(|| None));
        assert!(c.interactive_search(&MockHost, "req-1").is_err());
        assert!(c.grab(&MockHost, "req-1", "guid-1", "idx-1").is_err());
    }
    // --- A live round trip -------------------------------------------------------
    //
    // The provider half lives in the acquisition crate (its grab handler needs an
    // owned host), so this stands a router in for it. That makes the test about
    // the CONTRACT: the exact paths and body keys the two halves have to agree
    // on, which nothing else checks.

    use axum::{routing::post, Json, Router};
    use std::sync::Mutex;

    /// Serve the two acquisition port paths, recording each body, and answer with
    /// the `Result<T, String>` envelope the client expects.
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
        let out = blocking(move || c.interactive_search(&MockHost, "req-1")).await.unwrap();
        assert_eq!(out["releases"][0]["guid"], "g1");

        let calls = seen.lock().unwrap();
        assert_eq!(calls[0].0, "search");
        // The body key is half of the contract with the acquisition crate's own
        // handler; renaming it on either side breaks interactive search with no
        // compile error anywhere.
        assert_eq!(calls[0].1["request_id"], "req-1");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_grab_names_the_release_and_the_indexer_it_came_from() {
        // A guid is only meaningful together with the indexer that issued it, so
        // both have to cross - otherwise the far side grabs from the wrong one.
        let seen = Arc::new(Mutex::new(Vec::new()));
        let resolve = serve(seen.clone(), Ok(json!({ "id": "dl-42" }))).await;

        let c = AcquisitionSearchClient::new(resolve);
        let id = blocking(move || c.grab(&MockHost, "req-1", "guid-9", "idx-7")).await.unwrap();
        assert_eq!(id, "dl-42");

        let calls = seen.lock().unwrap();
        assert_eq!(calls[0].0, "grab");
        assert_eq!(calls[0].1["request_id"], "req-1");
        assert_eq!(calls[0].1["guid"], "guid-9");
        assert_eq!(calls[0].1["indexer_id"], "idx-7");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_provider_error_crosses_as_an_error() {
        // The user is watching an interactive search; "no results" instead of
        // "your indexer rejected the credentials" is the wrong thing to show.
        let seen = Arc::new(Mutex::new(Vec::new()));
        let resolve = serve(seen, Err("indexer rejected the credentials".to_string())).await;

        let c = AcquisitionSearchClient::new(resolve);
        let err = blocking(move || c.interactive_search(&MockHost, "req-1"))
            .await
            .unwrap_err()
            .to_string();
        assert!(err.contains("rejected the credentials"), "{err}");
    }
}

//! Cross-module point plumbing: resolving whichever modules currently answer a
//! point, calling one over the wire, and the service registry a host reaches its
//! own singletons through.

use std::any::{Any, TypeId};
use std::sync::Arc;

use axum::Json;

use super::HostCtx;

/// One live answer to a point: which module contributes it, under which instance
/// name (`None` when the point takes a single contribution), and where to reach
/// that module's process.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Contribution {
    pub module_id: String,
    #[serde(default)]
    pub instance: Option<String>,
    pub base_url: String,
    pub token: String,
}

/// Resolves the module currently answering a point: its `(base_url, auth_token)`,
/// or `None` when nothing installed and running answers it. Called on EVERY
/// cross-module request, so a provider that restarted on a new port is picked
/// up without anyone re-wiring.
pub type Resolver = Arc<dyn Fn() -> Option<(String, String)> + Send + Sync>;

/// A [`Resolver`] for whichever module contributes `point`
/// (`"tv.kroma.indexer/engine"`), narrowed to one `instance` when the point takes
/// several. Which module answers is the supervisor's business and changes as
/// modules are installed, so this re-resolves on every call rather than pinning
/// an endpoint.
pub fn point_resolver(host: Arc<dyn HostCtx>, point: &str, instance: Option<&str>) -> Resolver {
    let point = point.to_string();
    let want = instance.map(str::to_string);
    Arc::new(move || {
        let found = host
            .contributions(&point)
            .into_iter()
            .find(|c| match &want {
                Some(id) => c.instance.as_deref() == Some(id.as_str()),
                None => true,
            })?;
        Some((found.base_url, found.token))
    })
}

/// A [`Resolver`] pinned to `point`'s contribution as it is right now, for a
/// caller holding a bare `&dyn HostCtx` and making one call. It does not
/// re-resolve, so anything outliving the call should hold a [`point_resolver`].
pub fn pinned_resolver(
    host: &dyn HostCtx,
    point: &str,
    instance: Option<&str>,
) -> Option<Resolver> {
    let found = host
        .contributions(point)
        .into_iter()
        .find(|c| match instance {
            Some(id) => c.instance.as_deref() == Some(id),
            None => true,
        })?;
    let endpoint = (found.base_url, found.token);
    Some(Arc::new(move || Some(endpoint.clone())))
}

/// Serialize `body`, POST it to the provider's `/_port/<path>` with the bearer
/// token, and unwrap the `Result<T, String>` envelope it returns.
pub fn call<B: serde::Serialize, T: serde::de::DeserializeOwned>(
    resolve: &Resolver,
    path: &str,
    body: &B,
) -> anyhow::Result<T> {
    let out: Result<T, String> = call_raw(resolve, path, body)?;
    out.map_err(|e| anyhow::anyhow!(e))
}

/// [`call`] with the path derived from the point name, as `<point>/<method>`, so
/// a caller holds one string rather than a point name and an unrelated URL prefix.
pub fn call_point<B: serde::Serialize, T: serde::de::DeserializeOwned>(
    resolve: &Resolver,
    point: &str,
    method: &str,
    body: &B,
) -> anyhow::Result<T> {
    call(resolve, &format!("{point}/{method}"), body)
}

/// Like [`call`] but the provider returns `T` directly (no `Result` envelope),
/// for point methods returning `Option<_>` / infallible values.
pub fn call_raw<B: serde::Serialize, T: serde::de::DeserializeOwned>(
    resolve: &Resolver,
    path: &str,
    body: &B,
) -> anyhow::Result<T> {
    let (base, token) =
        resolve().ok_or_else(|| anyhow::anyhow!("no module contributes this point"))?;
    let resp = kroma_http::Fetch::new()
        .header("authorization", format!("Bearer {token}"))
        .post_json(
            &format!("{base}/_port/{path}"),
            &serde_json::to_value(body)?,
        )?
        .ensure_ok()?;
    resp.json()
}

/// Wrap a provider-side point handler: run the blocking work off the runtime and
/// answer with the `Result<T, String>` envelope [`call`] expects.
pub async fn port_reply<T>(
    job: impl FnOnce() -> anyhow::Result<T> + Send + 'static,
) -> Json<Result<T, String>>
where
    T: Send + 'static,
{
    let out = tokio::task::spawn_blocking(job)
        .await
        .map_err(|e| e.to_string())
        .and_then(|r| r.map_err(|e| format!("{e:#}")));
    Json(out)
}

pub fn service<T: Any + Send + Sync>(host: &dyn HostCtx) -> Option<Arc<T>> {
    host.get_service(TypeId::of::<T>())?.downcast::<T>().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::testing;

    fn offline() -> Resolver {
        Arc::new(|| None)
    }

    #[test]
    fn call_errors_when_nothing_contributes_the_point() {
        let err = call::<_, serde_json::Value>(&offline(), "any/path", &serde_json::json!({}))
            .unwrap_err();
        assert!(err.to_string().contains("no module contributes this point"));
    }

    #[test]
    fn call_raw_errors_when_nothing_contributes_the_point() {
        let err = call_raw::<_, serde_json::Value>(&offline(), "any/path", &serde_json::json!({}))
            .unwrap_err();
        assert!(err.to_string().contains("no module contributes this point"));
    }

    #[test]
    fn service_resolves_a_concrete_type() {
        struct Manager(u32);
        let host = testing::StubHost::new().with_service(Arc::new(Manager(42)));
        let got = service::<Manager>(&host).expect("service resolves");
        assert_eq!(got.0, 42);

        struct Other;
        assert!(service::<Other>(&host).is_none());
    }
}

//! Cross-module port plumbing: resolving whichever module currently serves a
//! contract, calling it over the wire, and the service-registry side of a port.

use std::any::{Any, TypeId};
use std::sync::Arc;

use axum::Json;

use super::HostCtx;

/// Resolves the module currently serving a port: its `(base_url, auth_token)`,
/// or `None` when nothing installed and running serves it. Called on EVERY
/// cross-module request, so a provider that restarted on a new port is picked
/// up without anyone re-wiring.
pub type Resolver = Arc<dyn Fn() -> Option<(String, String)> + Send + Sync>;

/// A [`Resolver`] for whichever module serves `port`. The port is a contract
/// name (`"torznab"`, `"indexer-db"`), never a module id: which module answers
/// is the supervisor's business, and changes as modules are installed.
pub fn port_resolver(host: Arc<dyn HostCtx>, port: &str) -> Resolver {
    let port = port.to_string();
    Arc::new(move || host.port_endpoint(&port))
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

/// Like [`call`] but the provider returns `T` directly (no `Result` envelope),
/// for port methods returning `Option<_>` / infallible values.
pub fn call_raw<B: serde::Serialize, T: serde::de::DeserializeOwned>(
    resolve: &Resolver,
    path: &str,
    body: &B,
) -> anyhow::Result<T> {
    let (base, token) =
        resolve().ok_or_else(|| anyhow::anyhow!("no module serves this port"))?;
    let resp = kroma_http::Fetch::new()
        .header("authorization", format!("Bearer {token}"))
        .post_json(&format!("{base}/_port/{path}"), &serde_json::to_value(body)?)?
        .ensure_ok()?;
    resp.json()
}

/// Wrap a provider-side port handler: run the blocking work off the runtime and
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

/// Register a peer port (a trait object) for the service registry: returns the
/// `(TypeId, value)` to insert. The registry stores concrete `Any` values, so the
/// port `Arc<dyn P>` is wrapped in an outer `Arc` keyed by `Arc<dyn P>`'s TypeId.
pub fn port_service<P: ?Sized + Any + Send + Sync>(
    port: Arc<P>,
) -> (TypeId, Arc<dyn Any + Send + Sync>) {
    (TypeId::of::<Arc<P>>(), Arc::new(port))
}

/// Resolve a peer port registered via [`port_service`]. `None` when no provider
/// registered it (e.g. the providing module is absent / disabled).
pub fn resolve_port<P: ?Sized + Any + Send + Sync>(host: &dyn HostCtx) -> Option<Arc<P>> {
    let any = host.get_service(TypeId::of::<Arc<P>>())?;
    any.downcast::<Arc<P>>().ok().map(|boxed| (*boxed).clone())
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
    fn call_errors_when_nothing_serves_the_port() {
        let err = call::<_, serde_json::Value>(&offline(), "any/path", &serde_json::json!({}))
            .unwrap_err();
        assert!(err.to_string().contains("no module serves this port"));
    }

    #[test]
    fn call_raw_errors_when_nothing_serves_the_port() {
        let err = call_raw::<_, serde_json::Value>(&offline(), "any/path", &serde_json::json!({}))
            .unwrap_err();
        assert!(err.to_string().contains("no module serves this port"));
    }

    #[test]
    fn peer_port_round_trips_through_the_service_registry() {
        trait Greeter: Send + Sync {
            fn hi(&self) -> &'static str;
        }
        struct G;
        impl Greeter for G {
            fn hi(&self) -> &'static str {
                "hi"
            }
        }
        let port: Arc<dyn Greeter> = Arc::new(G);
        let (tid, stored) = port_service(port);
        assert_eq!(tid, TypeId::of::<Arc<dyn Greeter>>());
        let back = stored.downcast::<Arc<dyn Greeter>>().expect("stored value downcasts back");
        assert_eq!((*back).hi(), "hi");
    }

    #[test]
    fn resolve_port_finds_a_registered_port_and_misses_otherwise() {
        trait Greeter: Send + Sync {
            fn hi(&self) -> &'static str;
        }
        struct G;
        impl Greeter for G {
            fn hi(&self) -> &'static str {
                "hi"
            }
        }
        let port: Arc<dyn Greeter> = Arc::new(G);
        let host = testing::StubHost::new().with_service_raw(port_service(port));
        let resolved = resolve_port::<dyn Greeter>(&host).expect("port resolves");
        assert_eq!(resolved.hi(), "hi");

        let empty = testing::StubHost::new();
        assert!(resolve_port::<dyn Greeter>(&empty).is_none());
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

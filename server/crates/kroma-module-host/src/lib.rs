//! The host seam between the running app and a module's backend: a module crate
//! names only the [`HostCtx`] trait here, never `kroma-engine`, so the two do not
//! form a dependency cycle.

// The axum `Response` is deliberately the Err type of request guards so handlers
// short-circuit with `?`.
#![allow(clippy::result_large_err)]

pub mod host_token;

#[cfg(any(test, feature = "testing"))]
pub mod testing;

use std::any::{Any, TypeId};
use std::path::Path;
use std::sync::Arc;

pub use async_trait::async_trait;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;

use kroma_db::Pool;
use kroma_domain::{Permission, User};
pub use kroma_domain::{
    ActionKind, ActionSpec, ActionStyle, Audience, NotificationCategory, NotificationEvent,
    NotificationSpec, PushCategory,
};

/// Build a JSON error response `{ "error": "<message>" }` with the given status.
pub fn json_error(status: StatusCode, message: &str) -> Response {
    (status, Json(serde_json::json!({ "error": message }))).into_response()
}

/// Run a blocking DB closure off the async runtime, mapping any failure to a
/// uniform 500.
pub async fn blocking<T, F>(f: F) -> Result<T, Response>
where
    F: FnOnce() -> anyhow::Result<T> + Send + 'static,
    T: Send + 'static,
{
    match tokio::task::spawn_blocking(f).await {
        Ok(Ok(v)) => Ok(v),
        Ok(Err(e)) => {
            tracing::error!(error = %e, "database error");
            Err(json_error(StatusCode::INTERNAL_SERVER_ERROR, "internal error"))
        }
        Err(e) => {
            tracing::error!(error = %e, "task join error");
            Err(json_error(StatusCode::INTERNAL_SERVER_ERROR, "internal error"))
        }
    }
}

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
    Ok(resp.json()?)
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

/// [`blocking`], with the closure handed its own clone of the [`Pool`].
pub async fn query<T, F>(pool: &Pool, f: F) -> Result<T, Response>
where
    F: FnOnce(Pool) -> anyhow::Result<T> + Send + 'static,
    T: Send + 'static,
{
    let pool = pool.clone();
    blocking(move || f(pool)).await
}

/// A real-time event a module publishes onto the host's bus, fanned out to
/// WebSocket clients as `{ "type": <topic>, ...payload }`.
pub struct Event {
    pub topic: String,
    pub payload: serde_json::Value,
}

impl Event {
    pub fn new(topic: impl Into<String>, payload: serde_json::Value) -> Self {
        Self { topic: topic.into(), payload }
    }
}

/// One configured library, in the leaf shape a module needs to place files.
/// `kind` is `movies` or `shows`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LibraryFolders {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub folders: Vec<String>,
}

/// The slice of the running app a module's backend can reach. The binary's
/// `AppState` (as `Arc<AppState>` = `SharedState`) implements it; a module crate
/// names only this trait, never the app, so it stays a leaf and breaks the cycle.
pub trait HostCtx: Send + Sync + 'static {
    fn db(&self) -> &Pool;

    fn data_dir(&self) -> &Path;

    // A failure is a localized `403` response.
    fn require(&self, user: &User, perm: Permission) -> Result<(), Response>;

    // Gate on holding ANY management capability (unlocks the console shell).
    fn require_any_admin(&self, user: &User) -> Result<(), Response>;

    // A localized JSON error for `user`'s account locale, from a message `key`.
    fn lerr(&self, user: &User, status: StatusCode, key: &str) -> Response;

    fn setting_str(&self, key: &str, default: &str) -> String;
    fn setting_bool(&self, key: &str, default: bool) -> bool;
    fn setting_i64(&self, key: &str, default: i64) -> i64;
    // Persist a batch of settings atomically (one write).
    fn set_settings(&self, patch: std::collections::BTreeMap<String, serde_json::Value>);

    fn publish(&self, event: Event);
    // Publish an event addressed to ONE user. Required rather than defaulted: a
    // host that forgot it would silently swallow every addressed event.
    fn publish_to(&self, user_id: &str, event: Event);

    // Raise a durable notification: it lands in the recipients' notification
    // centre and, once they've subscribed a device, is pushed to them. Returns
    // how many accounts were notified. A module supplies its own words through
    // `NotificationSpec::custom`; the core resolves the audience and honours
    // each recipient's per-category preferences.
    fn notify(&self, audience: &Audience, spec: &NotificationSpec) -> usize;
    // Trigger a background job by its key (e.g. `"acquisition.import"`). No-op if
    // the key is unknown or already running.
    fn trigger_job(&self, key: &'static str, reason: &'static str);

    fn module_enabled(&self, id: &str) -> bool;

    // Resolved core-side from the persisted `libraries` setting, falling back to
    // the env-configured media dirs on first run. Empty when none configured.
    fn library_folders(&self) -> Vec<LibraryFolders>;

    // The TMDB v3 API key, from the app's env config rather than settings.
    // `None` when TMDB is not set up.
    fn tmdb_api_key(&self) -> Option<String>;

    // The metadata language tag (e.g. `"fr-FR"`) for TMDB lookups.
    fn metadata_language(&self) -> String;

    // Prefer the typed [`service`] helper.
    fn get_service(&self, type_id: TypeId) -> Option<Arc<dyn Any + Send + Sync>>;

    /// `(base_url, auth_token)` of the installed, enabled, running module that
    /// serves `port`, a contract name and never a module id. This is the ONE hook
    /// the core offers for cross-module calls, which is what keeps it from
    /// naming any module.
    fn port_endpoint(&self, port: &str) -> Option<(String, String)>;
}

pub fn service<T: Any + Send + Sync>(host: &dyn HostCtx) -> Option<Arc<T>> {
    host.get_service(TypeId::of::<T>())?.downcast::<T>().ok()
}

/// One scheduled job a module contributes to the core JobManager. Its `run` pass
/// executes in-process on the sidecar, which serves the `/_job/run/{key}`
/// endpoint the core scheduler calls.
pub struct ModuleJob<S> {
    // `key` is dotted (`"acquisition.import"`) and doubles as DB key, URL segment
    // and i18n base. `category` is one of `maintenance`, `library`,
    // `recommendations`, `pipeline`, `acquisition`. `schedule` is cron,
    // admin-overridable, `None` for manual-only.
    pub key: &'static str,
    pub category: &'static str,
    pub schedule: Option<&'static str>,
    pub run: fn(&S) -> anyhow::Result<()>,
}

/// The backend contract a module crate implements to own its server-side
/// vertical. Generic over the host state `S` so the crate depends only on this
/// seam, never on the app; the binary instantiates it at `S = SharedState`.
#[async_trait]
pub trait ServerModule<S>: Send + Sync
where
    S: HostCtx + Clone + Send + Sync + 'static,
{
    // Matches its `module.json` and frontend package.
    fn id(&self) -> &'static str;

    // SQL run at DB init, after the core schema. `IF NOT EXISTS` DDL only; runs
    // on every boot.
    fn migrations(&self) -> &'static str {
        ""
    }

    // Routes served under `/api/admin`. Mounted behind the module's enabled-gate
    // by the host, so they 404 while it is disabled.
    fn admin_routes(&self, _host: &S) -> Option<axum::Router<S>> {
        None
    }

    fn jobs(&self) -> Vec<ModuleJob<S>> {
        Vec::new()
    }

    // Called when the module is enabled at runtime AND at boot for an
    // already-enabled module. Awaited, not detached, so a slow start completes
    // before a following disable can race it.
    async fn on_enable(&self, _host: Arc<dyn HostCtx>) {}

    // Called when the module is disabled at runtime AND at boot for a disabled
    // module, so nothing is left running. Awaited.
    async fn on_disable(&self, _host: Arc<dyn HostCtx>) {}
}

// The router state is `Arc<AppState>`, but the orphan rule forbids
// `impl HostCtx for Arc<AppState>` in the app crate. This blanket impl - legal
// here because the trait is local - lifts any `T: HostCtx` to `Arc<T>`.
impl<T: HostCtx + ?Sized> HostCtx for std::sync::Arc<T> {
    fn db(&self) -> &Pool {
        (**self).db()
    }
    fn data_dir(&self) -> &Path {
        (**self).data_dir()
    }
    fn require(&self, user: &User, perm: Permission) -> Result<(), Response> {
        (**self).require(user, perm)
    }
    fn require_any_admin(&self, user: &User) -> Result<(), Response> {
        (**self).require_any_admin(user)
    }
    fn lerr(&self, user: &User, status: StatusCode, key: &str) -> Response {
        (**self).lerr(user, status, key)
    }
    fn setting_str(&self, key: &str, default: &str) -> String {
        (**self).setting_str(key, default)
    }
    fn setting_bool(&self, key: &str, default: bool) -> bool {
        (**self).setting_bool(key, default)
    }
    fn setting_i64(&self, key: &str, default: i64) -> i64 {
        (**self).setting_i64(key, default)
    }
    fn set_settings(&self, patch: std::collections::BTreeMap<String, serde_json::Value>) {
        (**self).set_settings(patch)
    }
    fn publish(&self, event: Event) {
        (**self).publish(event)
    }
    fn publish_to(&self, user_id: &str, event: Event) {
        (**self).publish_to(user_id, event)
    }
    fn notify(&self, audience: &Audience, spec: &NotificationSpec) -> usize {
        (**self).notify(audience, spec)
    }
    fn trigger_job(&self, key: &'static str, reason: &'static str) {
        (**self).trigger_job(key, reason)
    }
    fn module_enabled(&self, id: &str) -> bool {
        (**self).module_enabled(id)
    }
    fn library_folders(&self) -> Vec<LibraryFolders> {
        (**self).library_folders()
    }
    fn tmdb_api_key(&self) -> Option<String> {
        (**self).tmdb_api_key()
    }
    fn metadata_language(&self) -> String {
        (**self).metadata_language()
    }
    fn get_service(&self, type_id: TypeId) -> Option<Arc<dyn Any + Send + Sync>> {
        (**self).get_service(type_id)
    }
    fn port_endpoint(&self, port: &str) -> Option<(String, String)> {
        (**self).port_endpoint(port)
    }
}

/// An authenticated user, resolved from an `Authorization: Bearer <token>`
/// header against the `sessions` table. A missing, expired or unknown token
/// yields `401`.
pub struct AuthUser(pub User);

impl<S: HostCtx> FromRequestParts<S> for AuthUser {
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let token = bearer_from_headers(&parts.headers)
            .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "missing bearer token"))?;
        let pool = state.db().clone();
        let user = tokio::task::spawn_blocking(move || kroma_db::session_user(&pool, &token))
            .await
            .map_err(|_| json_error(StatusCode::INTERNAL_SERVER_ERROR, "internal error"))?
            .map_err(|_| json_error(StatusCode::INTERNAL_SERVER_ERROR, "internal error"))?
            .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "invalid or expired session"))?;
        Ok(AuthUser(user))
    }
}

/// `Some(user)` for a valid Bearer token, `None` otherwise. Never rejects, for
/// endpoints that are public but personalise when signed in.
pub struct OptionalAuthUser(pub Option<User>);

impl<S: HostCtx> FromRequestParts<S> for OptionalAuthUser {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let Some(token) = bearer_from_headers(&parts.headers) else {
            return Ok(OptionalAuthUser(None));
        };
        let pool = state.db().clone();
        let user = tokio::task::spawn_blocking(move || kroma_db::session_user(&pool, &token))
            .await
            .ok()
            .and_then(|r| r.ok())
            .flatten();
        Ok(OptionalAuthUser(user))
    }
}

pub fn bearer_from_headers(headers: &axum::http::HeaderMap) -> Option<String> {
    let h = headers.get(axum::http::header::AUTHORIZATION)?;
    let s = h.to_str().ok()?;
    s.strip_prefix("Bearer ")
        .or_else(|| s.strip_prefix("bearer "))
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
}

#[cfg(test)]
mod port_call_tests {
    use super::*;

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
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn the_arc_blanket_impl_forwards_the_addressed_methods() {
        let host = Arc::new(testing::StubHost::new());
        let via_arc: &dyn HostCtx = &host;

        via_arc.publish_to("ana", Event::new("notification.created", serde_json::json!({})));
        let spec = NotificationSpec::new(
            NotificationEvent::RequestApproved,
            "notifications.request.approved.title",
            "notifications.request.approved.body",
        );
        assert_eq!(via_arc.notify(&Audience::user("ana"), &spec), 1);

        assert_eq!(host.published(), [(Some("ana".to_string()), "notification.created".to_string())]);
        assert_eq!(
            host.notifications().iter().map(|(_, s)| s.event.as_str()).collect::<Vec<_>>(),
            ["request.approved"]
        );
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

    #[test]
    fn json_error_carries_the_status() {
        let resp = json_error(StatusCode::NOT_FOUND, "gone");
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
        let resp = json_error(StatusCode::FORBIDDEN, "no");
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }

    #[test]
    fn event_new_keeps_topic_and_payload() {
        let ev = Event::new("download.progress", serde_json::json!({ "pct": 42 }));
        assert_eq!(ev.topic, "download.progress");
        assert_eq!(ev.payload["pct"], 42);
    }

    #[test]
    fn bearer_from_headers_extracts_case_insensitively_and_trims() {
        use axum::http::{header::AUTHORIZATION, HeaderMap, HeaderValue};

        let mut h = HeaderMap::new();
        h.insert(AUTHORIZATION, HeaderValue::from_static("Bearer abc123"));
        assert_eq!(bearer_from_headers(&h).as_deref(), Some("abc123"));

        let mut h = HeaderMap::new();
        h.insert(AUTHORIZATION, HeaderValue::from_static("bearer   tok  "));
        assert_eq!(bearer_from_headers(&h).as_deref(), Some("tok"));

        assert!(bearer_from_headers(&HeaderMap::new()).is_none());

        let mut h = HeaderMap::new();
        h.insert(AUTHORIZATION, HeaderValue::from_static("Basic Zm9v"));
        assert!(bearer_from_headers(&h).is_none());

        let mut h = HeaderMap::new();
        h.insert(AUTHORIZATION, HeaderValue::from_static("Bearer    "));
        assert!(bearer_from_headers(&h).is_none());
    }

    #[tokio::test]
    async fn blocking_returns_value_and_maps_failure_to_500() {
        let ok: Result<i32, Response> = blocking(|| Ok(21 * 2)).await;
        assert_eq!(ok.unwrap(), 42);

        let err = blocking::<i32, _>(|| Err(anyhow::anyhow!("db down"))).await;
        assert_eq!(err.unwrap_err().status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[tokio::test]
    async fn a_panicking_blocking_task_becomes_a_500_rather_than_taking_the_server_down() {
        let panicked = blocking::<i32, _>(|| panic!("a module's closure panicked")).await;
        assert_eq!(panicked.unwrap_err().status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[tokio::test]
    async fn optional_auth_is_none_when_the_request_carries_no_bearer() {
        let (mut parts, ()) = axum::http::Request::builder().body(()).unwrap().into_parts();
        let host = testing::StubHost::new();
        let OptionalAuthUser(user) =
            OptionalAuthUser::from_request_parts(&mut parts, &host).await.unwrap();
        assert!(user.is_none(), "a public endpoint must not reject an anonymous caller");
    }

    #[tokio::test]
    async fn query_hands_the_closure_its_own_pool() {
        let pool = kroma_db::testing::temp_pool("host-query");
        let n: Result<i64, Response> = query(&pool, |p| {
            let conn = p.get()?;
            let v: i64 = conn.query_row("SELECT 1 + 1", [], |r| r.get(0))?;
            Ok(v)
        })
        .await;
        assert_eq!(n.unwrap(), 2);
    }
    use serde_json::json;

    #[test]
    fn a_module_that_declares_nothing_gets_empty_defaults() {
        struct Bare;
        #[async_trait]
        impl ServerModule<Arc<testing::StubHost>> for Bare {
            fn id(&self) -> &'static str {
                "tv.kroma.bare"
            }
        }
        assert_eq!(Bare.id(), "tv.kroma.bare");
        assert_eq!(Bare.migrations(), "");
        assert!(Bare.admin_routes(&Arc::new(testing::StubHost::new())).is_none());
        assert!(Bare.jobs().is_empty());

        let rt = tokio::runtime::Builder::new_current_thread().build().unwrap();
        rt.block_on(async {
            let host: Arc<dyn HostCtx> = Arc::new(testing::StubHost::new());
            Bare.on_enable(host.clone()).await;
            Bare.on_disable(host).await;
        });
    }

    #[derive(Default)]
    struct Recorder {
        calls: std::sync::Mutex<Vec<String>>,
    }

    impl Recorder {
        fn note(&self, what: &str) {
            self.calls.lock().unwrap().push(what.to_string());
        }
        fn calls(&self) -> Vec<String> {
            self.calls.lock().unwrap().clone()
        }
    }

    impl HostCtx for Recorder {
        fn db(&self) -> &Pool {
            unimplemented!("not exercised")
        }
        fn data_dir(&self) -> &Path {
            Path::new("/recorder")
        }
        fn require(&self, _user: &User, _perm: Permission) -> Result<(), Response> {
            self.note("require");
            Ok(())
        }
        fn require_any_admin(&self, _user: &User) -> Result<(), Response> {
            self.note("require_any_admin");
            Ok(())
        }
        fn lerr(&self, _user: &User, _status: StatusCode, _key: &str) -> Response {
            unimplemented!("not exercised")
        }
        fn setting_str(&self, key: &str, _default: &str) -> String {
            self.note("setting_str");
            format!("str:{key}")
        }
        fn setting_bool(&self, _key: &str, _default: bool) -> bool {
            self.note("setting_bool");
            true
        }
        fn setting_i64(&self, _key: &str, _default: i64) -> i64 {
            self.note("setting_i64");
            42
        }
        fn set_settings(&self, _patch: std::collections::BTreeMap<String, serde_json::Value>) {
            self.note("set_settings");
        }
        fn publish(&self, _event: Event) {
            self.note("publish");
        }
        fn publish_to(&self, user_id: &str, _event: Event) {
            self.note(&format!("publish_to:{user_id}"));
        }
        fn notify(&self, _audience: &Audience, _spec: &NotificationSpec) -> usize {
            self.note("notify");
            7
        }
        fn trigger_job(&self, key: &'static str, _reason: &'static str) {
            self.note(&format!("trigger_job:{key}"));
        }
        fn module_enabled(&self, _id: &str) -> bool {
            self.note("module_enabled");
            false
        }
        fn library_folders(&self) -> Vec<LibraryFolders> {
            self.note("library_folders");
            Vec::new()
        }
        fn tmdb_api_key(&self) -> Option<String> {
            self.note("tmdb_api_key");
            Some("key".into())
        }
        fn metadata_language(&self) -> String {
            self.note("metadata_language");
            "fr-FR".into()
        }
        fn port_endpoint(&self, _port: &str) -> Option<(String, String)> {
            None
        }
        fn get_service(&self, _t: TypeId) -> Option<Arc<dyn Any + Send + Sync>> {
            self.note("get_service");
            None
        }
    }

    #[test]
    fn every_call_through_an_arc_reaches_the_host_inside_it() {
        let inner = Arc::new(Recorder::default());
        let host: Arc<Recorder> = inner.clone();

        let user = User {
            id: "u1".into(),
            email: "u1@t.dev".into(),
            username: "u1".into(),
            avatar_url: None,
            language: None,
            audio_language: None,
            subtitle_language: None,
            permissions: Vec::new(),
            created_at: "now".into(),
            has_pin: false,
        };

        assert_eq!(host.data_dir(), Path::new("/recorder"));
        host.require(&user, Permission::Playback).unwrap();
        host.require_any_admin(&user).unwrap();
        assert_eq!(host.setting_str("k", "d"), "str:k");
        assert!(host.setting_bool("k", false));
        assert_eq!(host.setting_i64("k", 0), 42);
        host.set_settings(std::collections::BTreeMap::new());
        host.publish(Event::new("t", json!({})));
        host.publish_to("u1", Event::new("t", json!({})));
        let spec = NotificationSpec::new(
            NotificationEvent::RequestApproved,
            "notifications.request.approved.title",
            "notifications.request.approved.body",
        );
        assert_eq!(host.notify(&Audience::user("u1"), &spec), 7);
        host.trigger_job("acquisition.search", "test");
        assert!(!host.module_enabled("tv.kroma.indexer"));
        assert!(host.library_folders().is_empty());
        assert_eq!(host.tmdb_api_key().as_deref(), Some("key"));
        assert_eq!(host.metadata_language(), "fr-FR");
        assert!(host.get_service(TypeId::of::<u8>()).is_none());

        assert_eq!(
            inner.calls(),
            [
                "require",
                "require_any_admin",
                "setting_str",
                "setting_bool",
                "setting_i64",
                "set_settings",
                "publish",
                "publish_to:u1",
                "notify",
                "trigger_job:acquisition.search",
                "module_enabled",
                "library_folders",
                "tmdb_api_key",
                "metadata_language",
                "get_service",
            ]
        );
    }

    #[test]
    fn a_bearer_token_is_read_case_insensitively_and_trimmed() {
        let header = |v: &str| {
            let mut h = axum::http::HeaderMap::new();
            h.insert(axum::http::header::AUTHORIZATION, v.parse().unwrap());
            h
        };
        assert_eq!(bearer_from_headers(&header("Bearer abc123")).as_deref(), Some("abc123"));
        assert_eq!(bearer_from_headers(&header("bearer abc123")).as_deref(), Some("abc123"));
        assert_eq!(bearer_from_headers(&header("Bearer   abc123  ")).as_deref(), Some("abc123"));
    }

    #[test]
    fn anything_that_is_not_a_bearer_token_is_no_token() {
        // An empty token must not read as valid, or `Authorization: Bearer `
        // would look authenticated to the session lookup.
        let header = |v: &str| {
            let mut h = axum::http::HeaderMap::new();
            h.insert(axum::http::header::AUTHORIZATION, v.parse().unwrap());
            h
        };
        assert!(bearer_from_headers(&header("Bearer ")).is_none());
        assert!(bearer_from_headers(&header("Bearer    ")).is_none());
        assert!(bearer_from_headers(&header("Basic dXNlcjpwYXNz")).is_none());
        assert!(bearer_from_headers(&header("abc123")).is_none(), "a bare token is not a bearer");
        assert!(bearer_from_headers(&axum::http::HeaderMap::new()).is_none());
    }
}

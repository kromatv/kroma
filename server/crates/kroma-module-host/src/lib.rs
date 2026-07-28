//! The host seam between the running app and a module's backend.
//!
//! A module crate's server half (routes + services) needs a few things from the
//! app: the DB pool, capability gating, settings, the event bus, and so on. If it
//! took `&SharedState` it would depend on `kroma-engine` (the whole app) and the
//! two would form a dependency cycle (kroma-engine already depends on the module
//! crates). Instead it names ONLY the [`HostCtx`] trait defined here, plus the
//! shared HTTP extractors/helpers. The binary's `AppState` implements `HostCtx`,
//! so `Router<SharedState>` handlers and generic `Router<S: HostCtx>` module
//! handlers both work, and a module crate depends only on this leaf.

// The axum `Response` is intentionally the Err type of request guards so handlers
// short-circuit with `?`; boxing every guard for `result_large_err` would churn
// dozens of signatures for no real gain on these error paths.
#![allow(clippy::result_large_err)]

/// The shared-host-token guard used by every hop of the module IPC.
pub mod host_token;

/// Shared `HostCtx` test doubles, so a seam with ~25 methods is stubbed once
/// rather than once per crate that tests against it. Behind the `testing`
/// feature: dependents enable it as a dev-dependency, and no release build
/// compiles it.
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
// Re-exported so a module crate builds notifications from `kroma_module_host`
// (or the SDK's prelude) without naming `kroma-domain` directly.
pub use kroma_domain::{
    ActionKind, ActionSpec, ActionStyle, Audience, NotificationCategory, NotificationEvent,
    NotificationSpec, PushCategory,
};

/// Build a JSON error response `{ "error": "<message>" }` with the given status.
/// The one definition; `kroma-engine` and the binary re-export it so existing
/// call sites are unchanged.
pub fn json_error(status: StatusCode, message: &str) -> Response {
    (status, Json(serde_json::json!({ "error": message }))).into_response()
}

/// Run a blocking DB closure off the async runtime, mapping any failure to a
/// uniform 500. The shared combinator admin handlers (app + module crates) use.
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

/// Register a peer PORT (a trait object) for the service registry: returns the
/// `(TypeId, value)` to insert. The registry stores concrete `Any` values, so the
/// port `Arc<dyn P>` is wrapped in an outer `Arc` keyed by `Arc<dyn P>`'s TypeId.
/// The port traits themselves live in `the SDK ports module (kroma_module_sdk::ports)`; this is only the generic
/// plumbing, so the seam names no port trait (and no module).
pub fn port_service<P: ?Sized + Any + Send + Sync>(
    port: Arc<P>,
) -> (TypeId, Arc<dyn Any + Send + Sync>) {
    (TypeId::of::<Arc<P>>(), Arc::new(port))
}

/// Resolve a peer PORT registered via [`port_service`]. `None` when no provider
/// registered it (e.g. the providing module is absent / disabled).
pub fn resolve_port<P: ?Sized + Any + Send + Sync>(host: &dyn HostCtx) -> Option<Arc<P>> {
    let any = host.get_service(TypeId::of::<Arc<P>>())?;
    any.downcast::<Arc<P>>().ok().map(|boxed| (*boxed).clone())
}

/// Clone the pool and run a blocking DB closure off the async runtime; a thin
/// combinator over [`blocking`] that hands the closure its own [`Pool`].
pub async fn query<T, F>(pool: &Pool, f: F) -> Result<T, Response>
where
    F: FnOnce(Pool) -> anyhow::Result<T> + Send + 'static,
    T: Send + 'static,
{
    let pool = pool.clone();
    blocking(move || f(pool)).await
}

/// A real-time event a module publishes onto the host's bus (fanned out to
/// WebSocket clients as `{ "type": <topic>, ...payload }`). The module owns its
/// topic string and payload shape; the seam names no module event type, so the
/// core stays generic. The host merges `topic` under the wire `type` key.
pub struct Event {
    /// The wire event type, e.g. `"download.progress"`.
    pub topic: String,
    /// The event fields as a JSON object (merged next to `type` on the wire).
    pub payload: serde_json::Value,
}

impl Event {
    pub fn new(topic: impl Into<String>, payload: serde_json::Value) -> Self {
        Self { topic: topic.into(), payload }
    }
}

/// One configured library, in the leaf shape a module needs to place files:
/// its id (for logical-id hashing), `kind` (`movies` / `shows`, to pick the right
/// library for a movie vs a show), display `name` (to honor a "preferred library"
/// setting), and folder roots. The engine's richer `LibraryDef` maps onto this at
/// the seam so a module never names the engine type.
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
///
/// The trait is grown as subsystems are relocated (settings accessors, event
/// publish, job triggers, the VPN proxy URL, ...); it starts with the DB pool and
/// capability gating, which the shared extractors + every admin route need.
pub trait HostCtx: Send + Sync + 'static {
    /// The SQLite connection pool.
    fn db(&self) -> &Pool;

    /// The server data directory (per-module scratch lives under it).
    fn data_dir(&self) -> &Path;

    /// Gate a handler on a capability. Returns a localized `403` response on
    /// failure (the app resolves the caller's locale).
    fn require(&self, user: &User, perm: Permission) -> Result<(), Response>;

    /// Gate on holding ANY management capability (unlocks the console shell).
    fn require_any_admin(&self, user: &User) -> Result<(), Response>;

    /// A localized JSON error for `user`'s account locale (the app resolves the
    /// message `key` against the shared catalogs).
    fn lerr(&self, user: &User, status: StatusCode, key: &str) -> Response;

    /// A persisted string setting (or `default` when unset).
    fn setting_str(&self, key: &str, default: &str) -> String;
    /// A persisted boolean setting (or `default` when unset).
    fn setting_bool(&self, key: &str, default: bool) -> bool;
    /// A persisted integer setting (or `default` when unset).
    fn setting_i64(&self, key: &str, default: i64) -> i64;
    /// Persist a batch of settings atomically (one write).
    fn set_settings(&self, patch: std::collections::BTreeMap<String, serde_json::Value>);

    /// Publish a module event onto the app's real-time bus (fanned out to
    /// WebSocket clients). The event's topic + payload are generic; the host
    /// forwards them without knowing the module's event types.
    fn publish(&self, event: Event);
    /// Publish an event addressed to ONE user, for content that is personal
    /// (notifications: "your request was denied" names its recipient).
    ///
    /// The default DROPS the event rather than falling back to [`Self::publish`]:
    /// a host that cannot address its bus must not quietly broadcast personal
    /// content to every connected client. The real app state overrides it.
    fn publish_to(&self, user_id: &str, event: Event) {
        let _ = (user_id, event);
    }

    /// Raise a durable notification: it lands in the recipients' notification
    /// centre and (once they've subscribed a device) is pushed to them.
    ///
    /// This is the module-facing half of the notifications domain. A module says
    /// WHAT happened and WHO cares the core resolves the audience, honours each
    /// recipient's per-category preferences, and renders the i18n keys in their
    /// language. A module never enumerates accounts or formats text itself.
    ///
    /// Returns how many accounts were notified. The default is a no-op for hosts
    /// without a notification store (mocks, bare test harnesses).
    ///
    /// ```ignore
    /// ctx.notify(
    ///     &Audience::permission(Permission::SettingsManage),
    ///     &NotificationSpec::new(
    ///         NotificationEvent::SystemVpnDown,
    ///         "notifications.system.vpn.down.title",
    ///         "notifications.system.vpn.down.body",
    ///     ),
    /// );
    /// ```
    fn notify(&self, audience: &Audience, spec: &NotificationSpec) -> usize {
        let _ = (audience, spec);
        0
    }
    /// Trigger a background job by its key (e.g. `"acquisition.import"`), running
    /// against the app state. No-op if the key is unknown or already running.
    fn trigger_job(&self, key: &'static str, reason: &'static str);

    /// Whether the module with id `id` is currently enabled (a relocated module's
    /// resident loop idles when its own module is toggled off).
    fn module_enabled(&self, id: &str) -> bool;

    /// The configured libraries as `(library_id, kind, name, folder_paths)`
    /// tuples. Resolved core-side from the persisted `libraries` setting (falling
    /// back to the env-configured media dirs on first run), so an out-of-process
    /// module (import / organize) can place files under the right root without
    /// naming the engine's `Settings`/`Config` types. Empty when none configured.
    fn library_folders(&self) -> Vec<LibraryFolders>;

    /// The TMDB v3 API key the app is configured with (`None` when TMDB is not
    /// set up). Needed by any module doing metadata lookups (acquisition's wanted
    /// materialization). It lives in the app's env config, not settings, so it is
    /// its own accessor rather than a `setting_str`.
    fn tmdb_api_key(&self) -> Option<String>;

    /// The metadata language tag (e.g. `"fr-FR"`) the app resolves from settings +
    /// config, for TMDB lookups that should match the user's catalog language.
    fn metadata_language(&self) -> String;

    /// Resolve a host-registered service by its type, so a relocated module can
    /// reach its own engine / bridge without the seam ever naming a module type
    /// (dependency injection). Prefer the typed [`service`] helper. `None` when no
    /// service of that type is registered.
    fn get_service(&self, type_id: TypeId) -> Option<Arc<dyn Any + Send + Sync>>;
}

/// Resolve a typed host service (dependency injection). The host registers its
/// concrete services (the download manager, the VPN bridge, ...) under their
/// `TypeId`; a module crate looks its own up by type. `None` when unregistered.
/// Takes `&dyn HostCtx` so a route (with `&S`) and a lifecycle hook (with
/// `Arc<dyn HostCtx>`) both call it uniformly.
pub fn service<T: Any + Send + Sync>(host: &dyn HostCtx) -> Option<Arc<T>> {
    host.get_service(TypeId::of::<T>())?.downcast::<T>().ok()
}

/// One scheduled job an out-of-process module contributes to the CORE
/// JobManager, so it appears in the admin Tâches page with cron scheduling, a
/// run-now button and run history exactly like an in-core job. The module
/// declares the job's identity + default cadence; its `run` pass executes
/// in-process on the sidecar when the core scheduler fires the job (the runtime
/// serves a `/_job/run/{key}` endpoint the core calls). `S` is the module's host
/// state (`RemoteHost` in the sidecar).
pub struct ModuleJob<S> {
    /// Stable dotted key (`"acquisition.import"`) the job's identity everywhere
    /// (DB key, URL segment, i18n base).
    pub key: &'static str,
    /// UI grouping bucket, as the lowercase wire string the core parses into its
    /// `Category` (`"maintenance" | "library" | "recommendations" | "pipeline" |
    /// "acquisition"`).
    pub category: &'static str,
    /// Default cron schedule (admin-overridable), or `None` for manual-only.
    pub schedule: Option<&'static str>,
    /// The pass to run, in-process on the sidecar, when the job fires.
    pub run: fn(&S) -> anyhow::Result<()>,
}

/// The backend contract a module crate implements to own its full server-side
/// vertical: the admin routes it serves (behind the host's enabled-gate) and its
/// enable/disable lifecycle. Generic over the host state `S` so the crate depends
/// only on this seam, never on the app; the binary instantiates it at
/// `S = SharedState`. Anything the module needs from the app (its engine, bridge,
/// DB, settings) comes through `host`, so the binary wires nothing per module.
#[async_trait]
pub trait ServerModule<S>: Send + Sync
where
    S: HostCtx + Clone + Send + Sync + 'static,
{
    /// The module id (matches its `module.json` and frontend package).
    fn id(&self) -> &'static str;

    /// SQL run once at DB init (after the core schema) so a module owns its own
    /// tables. `IF NOT EXISTS` DDL only; runs on every boot. Default: no schema.
    fn migrations(&self) -> &'static str {
        ""
    }

    /// Routes served under `/api/admin`, or `None` for a lifecycle-only module
    /// (e.g. a download engine). Mounted behind the module's enabled-gate by the
    /// host, so they 404 while it is disabled.
    fn admin_routes(&self, _host: &S) -> Option<axum::Router<S>> {
        None
    }

    /// The scheduled jobs this module contributes to the core JobManager, so they
    /// appear in admin Tâches with cron scheduling + run history like an in-core
    /// job. The runtime registers each with the core over the `/_host/register-job`
    /// callback and serves a `/_job/run/{key}` endpoint the core scheduler calls to
    /// run it. Default: none (the module keeps whatever private loops it had).
    fn jobs(&self) -> Vec<ModuleJob<S>> {
        Vec::new()
    }

    /// Bring the module's live services up: called when it is enabled at runtime
    /// AND at boot for an already-enabled module. Awaited (not detached), so a slow
    /// start completes before a following disable can race it. Takes an owned
    /// `Arc<dyn HostCtx>` so the module can hand a long-lived handle to a spawned
    /// watchdog / supervisor. Default: nothing.
    async fn on_enable(&self, _host: Arc<dyn HostCtx>) {}

    /// Tear the module's live services down: called when it is disabled at runtime
    /// AND at boot for a disabled module, so nothing is left running. Awaited.
    /// Default: nothing.
    async fn on_disable(&self, _host: Arc<dyn HostCtx>) {}
}

/// The router state is `Arc<AppState>` (= `SharedState`), but the orphan rule
/// forbids `impl HostCtx for Arc<AppState>` in the app crate (foreign `Arc`,
/// covered local type). This blanket impl - legal here because the trait is
/// local - lifts any `T: HostCtx` to `Arc<T>`, so `AppState: HostCtx` (in the
/// app) gives `Arc<AppState>: HostCtx` for free, which the extractors + generic
/// `Router<S>` module handlers require.
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
    // MUST be forwarded like everything else: both have a deliberately inert
    // default (drop / no-op), so omitting them here would not fail to compile,
    // it would silently swallow every addressed event and every notification the
    // moment a call goes through `Arc<AppState>` (which is how the app calls it).
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
}

/// An authenticated user, resolved from an `Authorization: Bearer <token>`
/// header against the `sessions` table. Generic over any [`HostCtx`], so it works
/// with the app's concrete `SharedState` AND a module crate's generic
/// `Router<S: HostCtx>`. A missing/expired/unknown token yields `401`.
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

/// Optionally-authenticated user: `Some(user)` for a valid Bearer token, `None`
/// otherwise. Never rejects for endpoints that are public but personalise when
/// signed in.
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

/// Extract the bearer token from a header map's `Authorization` header, if any.
pub fn bearer_from_headers(headers: &axum::http::HeaderMap) -> Option<String> {
    let h = headers.get(axum::http::header::AUTHORIZATION)?;
    let s = h.to_str().ok()?;
    s.strip_prefix("Bearer ")
        .or_else(|| s.strip_prefix("bearer "))
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn peer_port_round_trips_through_the_service_registry() {
        // The double-Arc TypeId trick port_service/resolve_port rely on: a port
        // registered as Arc<dyn P> must come back as the same trait object (a
        // silent mismatch would resolve to None and break cross-module calls).
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

    // The HostCtx doubles live in `crate::testing`, shared with every other
    // crate that tests against this seam.

    /// Regression guard. `publish_to` and `notify` have inert defaults (drop /
    /// no-op), so leaving them out of the `Arc` blanket impl COMPILES FINE and
    /// then silently swallows every notification the app raises — the app calls
    /// through `Arc<AppState>`, never `AppState` directly. This asserts the
    /// forwarding is real; any future defaulted method needs the same treatment.
    #[test]
    fn the_arc_blanket_impl_forwards_the_defaulted_methods() {
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

        // Nothing registered -> None.
        let empty = testing::StubHost::new();
        assert!(resolve_port::<dyn Greeter>(&empty).is_none());
    }

    #[test]
    fn service_resolves_a_concrete_type() {
        struct Manager(u32);
        let host = testing::StubHost::new().with_service(Arc::new(Manager(42)));
        let got = service::<Manager>(&host).expect("service resolves");
        assert_eq!(got.0, 42);

        // A different type is not registered.
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

        // Lowercase scheme + surrounding whitespace on the token.
        let mut h = HeaderMap::new();
        h.insert(AUTHORIZATION, HeaderValue::from_static("bearer   tok  "));
        assert_eq!(bearer_from_headers(&h).as_deref(), Some("tok"));

        // No header at all.
        assert!(bearer_from_headers(&HeaderMap::new()).is_none());

        // Wrong scheme.
        let mut h = HeaderMap::new();
        h.insert(AUTHORIZATION, HeaderValue::from_static("Basic Zm9v"));
        assert!(bearer_from_headers(&h).is_none());

        // Empty token after the scheme.
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
    async fn query_hands_the_closure_its_own_pool() {
        let path = std::env::temp_dir().join(format!("kroma-host-query-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let pool = kroma_db::init(&path).expect("init db");
        let n: Result<i64, Response> = query(&pool, |p| {
            let conn = p.get()?;
            let v: i64 = conn.query_row("SELECT 1 + 1", [], |r| r.get(0))?;
            Ok(v)
        })
        .await;
        assert_eq!(n.unwrap(), 2);
        let _ = std::fs::remove_file(&path);
    }
    use serde_json::json;

    // ----- the trait defaults, which are the whole point of a seam ----------------


    #[test]
    fn an_addressed_event_is_dropped_rather_than_broadcast() {
        // The security-relevant default: `publish_to` carries personal content
        // ("your request was denied" names its recipient). A host that cannot
        // address its bus must DROP it, never fall back to publish.
        let host = testing::DefaultsProbe::new();
        host.publish_to("user-1", Event::new("notification.created", json!({ "id": "n1" })));
        assert!(
            host.broadcasts().is_empty(),
            "a host that cannot address its bus must NOT fall back to broadcast"
        );
    }

    #[test]
    fn a_host_with_no_notification_store_notifies_nobody() {
        // Returning a non-zero count would tell a module its notification landed
        // when nothing was written.
        let spec = NotificationSpec::new(
            NotificationEvent::RequestApproved,
            "notifications.request.approved.title",
            "notifications.request.approved.body",
        );
        assert_eq!(testing::DefaultsProbe::new().notify(&Audience::user("u1"), &spec), 0);
        assert_eq!(testing::DefaultsProbe::new().notify(&Audience::Everyone, &spec), 0);
    }

    #[test]
    fn a_module_that_declares_nothing_gets_empty_defaults() {
        // A lifecycle-only module (a download engine) declares no schema, no
        // admin routes and no jobs. Any of these defaulting to something
        // non-empty would run SQL or mount routes nobody asked for.
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

        // ...and its lifecycle hooks are no-ops that complete rather than panic.
        let rt = tokio::runtime::Builder::new_current_thread().build().unwrap();
        rt.block_on(async {
            let host: Arc<dyn HostCtx> = Arc::new(testing::StubHost::new());
            Bare.on_enable(host.clone()).await;
            Bare.on_disable(host).await;
        });
    }

    // ----- the Arc blanket impl ---------------------------------------------------

    /// Records which methods were reached through it.
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
        fn get_service(&self, _t: TypeId) -> Option<Arc<dyn Any + Send + Sync>> {
            self.note("get_service");
            None
        }
    }

    #[test]
    fn every_call_through_an_arc_reaches_the_host_inside_it() {
        // The router state is `Arc<AppState>`, so EVERY call the app makes goes
        // through this blanket impl. A method that forwarded to the trait
        // DEFAULT instead of the inner host would silently lose behaviour - and
        // for `publish_to` and `notify` that means dropped notifications, which
        // nothing else would catch.
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

    // ----- bearer extraction ------------------------------------------------------

    #[test]
    fn a_bearer_token_is_read_case_insensitively_and_trimmed() {
        let header = |v: &str| {
            let mut h = axum::http::HeaderMap::new();
            h.insert(axum::http::header::AUTHORIZATION, v.parse().unwrap());
            h
        };
        assert_eq!(bearer_from_headers(&header("Bearer abc123")).as_deref(), Some("abc123"));
        // Some clients lowercase the scheme.
        assert_eq!(bearer_from_headers(&header("bearer abc123")).as_deref(), Some("abc123"));
        assert_eq!(bearer_from_headers(&header("Bearer   abc123  ")).as_deref(), Some("abc123"));
    }

    #[test]
    fn anything_that_is_not_a_bearer_token_is_no_token() {
        // An empty token must not read as a valid one, or a request with
        // `Authorization: Bearer ` would look authenticated to the lookup.
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

//! Shared [`HostCtx`] test doubles.
//!
//! `HostCtx` has ~25 methods, and any test that drives a module route or a
//! service needs all of them implemented. Four crates had grown their own
//! near-identical double (`MockHost`, `TestHost`, `DbHost`, `RecordingHost`),
//! which meant every method added to the seam had to be stubbed five times, and
//! each copy quietly disagreed with the others about what an unset setting or a
//! disabled module should look like.
//!
//! Two shapes cover every existing use:
//!
//! * [`StubHost`] a host that is not backed by an app at all. Its answers are
//!   the neutral ones (settings return the caller's default, gates allow, the
//!   bus records rather than delivers) and each is overridable.
//! * [`Recording`] a decorator over a REAL host, forwarding everything but
//!   capturing the bus traffic. For tests that need the app's true behaviour and
//!   only want to see what it published.
//!
//! Gated on the `testing` feature so it never reaches a release build; the
//! crates that use it enable it as a dev-dependency.

use std::any::{Any, TypeId};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use axum::http::StatusCode;
use axum::response::Response;
use kroma_db::Pool;
use kroma_domain::{Audience, NotificationSpec, Permission, User};

use crate::{Event, HostCtx, LibraryFolders};

/// One thing that went onto the event bus: the addressee (`None` for a
/// broadcast) and the event's topic.
pub type Published = (Option<String>, String);

/// A host service, as the registry stores it: keyed by the `TypeId` the caller
/// will look it up with.
type Service = (TypeId, Arc<dyn Any + Send + Sync>);

/// A stand-in for the app's real settings store: `(key, caller's default) ->
/// value`, the exact shape of [`HostCtx::setting_str`].
type StringSettings = Arc<dyn Fn(&str, &str) -> String + Send + Sync>;

/// What a [`StubHost`] or [`Recording`] saw. Shared behind an `Arc` so a clone
/// of the host - axum takes its state by value - observes the same traffic.
#[derive(Default)]
struct Log {
    published: Mutex<Vec<Published>>,
    notified: Mutex<Vec<(Audience, NotificationSpec)>>,
    jobs: Mutex<Vec<(&'static str, &'static str)>>,
    settings_written: Mutex<Vec<BTreeMap<String, serde_json::Value>>>,
}

impl Log {
    fn published(&self) -> Vec<Published> {
        self.published.lock().unwrap().clone()
    }
    fn topics(&self) -> Vec<String> {
        self.published.lock().unwrap().iter().map(|(_, t)| t.clone()).collect()
    }
    fn notifications(&self) -> Vec<(Audience, NotificationSpec)> {
        self.notified.lock().unwrap().clone()
    }
    fn jobs(&self) -> Vec<(&'static str, &'static str)> {
        self.jobs.lock().unwrap().clone()
    }
    fn settings_written(&self) -> Vec<BTreeMap<String, serde_json::Value>> {
        self.settings_written.lock().unwrap().clone()
    }
}

/// A unique temp path, so two tests running in parallel threads of one process
/// never share a database. The pid alone is not enough for that.
fn temp_db_path(tag: &str) -> PathBuf {
    static SEQ: AtomicU32 = AtomicU32::new(0);
    let n = SEQ.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!("kroma-{tag}-{}-{n}.db", std::process::id()))
}

/// A [`HostCtx`] with no app behind it.
///
/// Every answer is the neutral one until configured: settings hand back the
/// caller's own default, both gates allow, the module is enabled, there are no
/// libraries and no TMDB key. The bus methods record instead of delivering, so
/// a test asserts on [`published`](Self::published) /
/// [`notifications`](Self::notifications) / [`jobs`](Self::jobs).
///
/// `db()` panics unless the host was built with [`with_db`](Self::with_db) -
/// louder than handing out a pool to a test that did not ask for one.
#[derive(Clone)]
pub struct StubHost {
    db: Option<Pool>,
    data_dir: PathBuf,
    tmdb_key: Option<String>,
    metadata_language: String,
    module_enabled: bool,
    libraries: Vec<LibraryFolders>,
    settings: Arc<Mutex<BTreeMap<String, serde_json::Value>>>,
    string_settings: Option<StringSettings>,
    services: Arc<Mutex<Vec<Service>>>,
    log: Arc<Log>,
}

impl Default for StubHost {
    fn default() -> Self {
        Self::new()
    }
}

impl StubHost {
    /// A host with no database. `db()` panics if reached.
    pub fn new() -> Self {
        Self {
            db: None,
            data_dir: std::env::temp_dir(),
            tmdb_key: None,
            metadata_language: "en".into(),
            module_enabled: true,
            libraries: Vec::new(),
            settings: Arc::new(Mutex::new(BTreeMap::new())),
            string_settings: None,
            services: Arc::new(Mutex::new(Vec::new())),
            log: Arc::new(Log::default()),
        }
    }

    /// A host over a real, empty, migrated SQLite database in a temp file unique
    /// to this call. `tag` only shapes the filename, to make a stray one
    /// identifiable.
    pub fn with_db(tag: &str) -> Self {
        let path = temp_db_path(tag);
        let _ = std::fs::remove_file(&path);
        Self { db: Some(kroma_db::init(&path).expect("init test db")), ..Self::new() }
    }

    /// A host over a pool the caller already built. For a module whose tests
    /// need their OWN migrations applied on top of the core schema, which
    /// [`with_db`](Self::with_db) does not know about.
    pub fn with_pool(pool: Pool) -> Self {
        Self { db: Some(pool), ..Self::new() }
    }

    /// Answer `tmdb_api_key()` with `key`.
    pub fn with_tmdb_key(mut self, key: &str) -> Self {
        self.tmdb_key = Some(key.into());
        self
    }

    /// Answer `metadata_language()` with `tag` (default `"en"`).
    pub fn with_metadata_language(mut self, tag: &str) -> Self {
        self.metadata_language = tag.into();
        self
    }

    /// Answer `module_enabled()` with `on` for every id (default `true`).
    pub fn with_module_enabled(mut self, on: bool) -> Self {
        self.module_enabled = on;
        self
    }

    /// Answer `library_folders()` with `libraries` (default empty).
    pub fn with_libraries(mut self, libraries: Vec<LibraryFolders>) -> Self {
        self.libraries = libraries;
        self
    }

    /// Answer every `setting_str` through `f` instead of the seeded map.
    ///
    /// For the one shape the map cannot imitate: a test whose SUBJECT is a real
    /// settings store read through the seam, where the store's own registered
    /// defaults - not the caller's - are what the assertion is about. `f` gets
    /// the key and the caller's default, exactly as `setting_str` does.
    pub fn with_string_settings(
        mut self,
        f: impl Fn(&str, &str) -> String + Send + Sync + 'static,
    ) -> Self {
        self.string_settings = Some(Arc::new(f));
        self
    }

    /// Seed a persisted setting. Unseeded keys still return the caller's default,
    /// which is what makes the un-configured host neutral.
    pub fn with_setting(self, key: &str, value: serde_json::Value) -> Self {
        self.settings.lock().unwrap().insert(key.into(), value);
        self
    }

    /// Register a service for `service::<T>()` to resolve.
    pub fn with_service<T: Any + Send + Sync>(self, value: Arc<T>) -> Self {
        self.services.lock().unwrap().push((TypeId::of::<T>(), value));
        self
    }

    /// Register an already-built `(TypeId, value)` pair, as
    /// [`port_service`](crate::port_service) produces for a `dyn` port - its key
    /// is `TypeId::of::<Arc<dyn P>>()`, which the generic method above cannot
    /// name.
    pub fn with_service_raw(self, entry: Service) -> Self {
        self.services.lock().unwrap().push(entry);
        self
    }

    /// Everything published, as `(addressee, topic)`; the addressee is `None`
    /// for a broadcast and `Some(user_id)` for a `publish_to`.
    pub fn published(&self) -> Vec<Published> {
        self.log.published()
    }

    /// Published topics, in order, ignoring who they were addressed to.
    pub fn topics(&self) -> Vec<String> {
        self.log.topics()
    }

    /// Every `notify()` call, with its audience.
    pub fn notifications(&self) -> Vec<(Audience, NotificationSpec)> {
        self.log.notifications()
    }

    /// Every `trigger_job()` call, as `(key, reason)`.
    pub fn jobs(&self) -> Vec<(&'static str, &'static str)> {
        self.log.jobs()
    }

    /// Every `set_settings()` patch, in order.
    pub fn settings_written(&self) -> Vec<BTreeMap<String, serde_json::Value>> {
        self.log.settings_written()
    }
}

impl HostCtx for StubHost {
    fn db(&self) -> &Pool {
        self.db.as_ref().expect("this StubHost has no database - build it with StubHost::with_db")
    }
    fn data_dir(&self) -> &Path {
        &self.data_dir
    }
    fn require(&self, _user: &User, _perm: Permission) -> Result<(), Response> {
        Ok(())
    }
    fn require_any_admin(&self, _user: &User) -> Result<(), Response> {
        Ok(())
    }
    fn lerr(&self, _user: &User, status: StatusCode, key: &str) -> Response {
        crate::json_error(status, key)
    }
    fn setting_str(&self, key: &str, default: &str) -> String {
        if let Some(f) = &self.string_settings {
            return f(key, default);
        }
        match self.settings.lock().unwrap().get(key) {
            Some(serde_json::Value::String(s)) => s.clone(),
            Some(v) => v.to_string(),
            None => default.to_string(),
        }
    }
    fn setting_bool(&self, key: &str, default: bool) -> bool {
        self.settings.lock().unwrap().get(key).and_then(|v| v.as_bool()).unwrap_or(default)
    }
    fn setting_i64(&self, key: &str, default: i64) -> i64 {
        self.settings.lock().unwrap().get(key).and_then(|v| v.as_i64()).unwrap_or(default)
    }
    fn set_settings(&self, patch: BTreeMap<String, serde_json::Value>) {
        self.settings.lock().unwrap().extend(patch.clone());
        self.log.settings_written.lock().unwrap().push(patch);
    }
    fn publish(&self, event: Event) {
        self.log.published.lock().unwrap().push((None, event.topic));
    }
    fn publish_to(&self, user_id: &str, event: Event) {
        self.log.published.lock().unwrap().push((Some(user_id.to_string()), event.topic));
    }
    fn notify(&self, audience: &Audience, spec: &NotificationSpec) -> usize {
        self.log.notified.lock().unwrap().push((audience.clone(), spec.clone()));
        1
    }
    fn trigger_job(&self, key: &'static str, reason: &'static str) {
        self.log.jobs.lock().unwrap().push((key, reason));
    }
    fn module_enabled(&self, _id: &str) -> bool {
        self.module_enabled
    }
    fn library_folders(&self) -> Vec<LibraryFolders> {
        self.libraries.clone()
    }
    fn tmdb_api_key(&self) -> Option<String> {
        self.tmdb_key.clone()
    }
    fn metadata_language(&self) -> String {
        self.metadata_language.clone()
    }
    fn get_service(&self, type_id: TypeId) -> Option<Arc<dyn Any + Send + Sync>> {
        self.services
            .lock()
            .unwrap()
            .iter()
            .find(|(t, _)| *t == type_id)
            .map(|(_, v)| Arc::clone(v))
    }
}

/// A REAL host with its bus tapped: every method forwards to `inner`, except
/// `publish` / `publish_to` / `notify`, which are recorded and go no further.
///
/// For tests that need the app's genuine settings, gating and database, and
/// whose actual subject is what the code under test announced. Holding the event
/// back is deliberate - delivering it would fan out to whatever the real bus is
/// wired to, which is not what the test is about.
pub struct Recording<H: HostCtx> {
    inner: H,
    log: Arc<Log>,
}

impl<H: HostCtx> Recording<H> {
    pub fn new(inner: H) -> Self {
        Self { inner, log: Arc::new(Log::default()) }
    }

    /// The host underneath, for a test that also needs to drive it directly.
    pub fn inner(&self) -> &H {
        &self.inner
    }

    /// Everything published, as `(addressee, topic)`.
    pub fn published(&self) -> Vec<Published> {
        self.log.published()
    }

    /// Published topics, in order, ignoring who they were addressed to.
    pub fn topics(&self) -> Vec<String> {
        self.log.topics()
    }

    /// Every `notify()` call, with its audience.
    pub fn notifications(&self) -> Vec<(Audience, NotificationSpec)> {
        self.log.notifications()
    }
}

impl<H: HostCtx> HostCtx for Recording<H> {
    fn db(&self) -> &Pool {
        self.inner.db()
    }
    fn data_dir(&self) -> &Path {
        self.inner.data_dir()
    }
    fn require(&self, user: &User, perm: Permission) -> Result<(), Response> {
        self.inner.require(user, perm)
    }
    fn require_any_admin(&self, user: &User) -> Result<(), Response> {
        self.inner.require_any_admin(user)
    }
    fn lerr(&self, user: &User, status: StatusCode, key: &str) -> Response {
        self.inner.lerr(user, status, key)
    }
    fn setting_str(&self, key: &str, default: &str) -> String {
        self.inner.setting_str(key, default)
    }
    fn setting_bool(&self, key: &str, default: bool) -> bool {
        self.inner.setting_bool(key, default)
    }
    fn setting_i64(&self, key: &str, default: i64) -> i64 {
        self.inner.setting_i64(key, default)
    }
    fn set_settings(&self, patch: BTreeMap<String, serde_json::Value>) {
        self.inner.set_settings(patch);
    }
    fn publish(&self, event: Event) {
        self.log.published.lock().unwrap().push((None, event.topic));
    }
    fn publish_to(&self, user_id: &str, event: Event) {
        self.log.published.lock().unwrap().push((Some(user_id.to_string()), event.topic));
    }
    fn notify(&self, audience: &Audience, spec: &NotificationSpec) -> usize {
        self.log.notified.lock().unwrap().push((audience.clone(), spec.clone()));
        1
    }
    fn trigger_job(&self, key: &'static str, reason: &'static str) {
        self.inner.trigger_job(key, reason);
    }
    fn module_enabled(&self, id: &str) -> bool {
        self.inner.module_enabled(id)
    }
    fn library_folders(&self) -> Vec<LibraryFolders> {
        self.inner.library_folders()
    }
    fn tmdb_api_key(&self) -> Option<String> {
        self.inner.tmdb_api_key()
    }
    fn metadata_language(&self) -> String {
        self.inner.metadata_language()
    }
    fn get_service(&self, type_id: TypeId) -> Option<Arc<dyn Any + Send + Sync>> {
        self.inner.get_service(type_id)
    }
}

#[cfg(test)]
mod tests {
    use kroma_domain::NotificationEvent;
    use serde_json::json;

    use super::*;

    fn spec() -> NotificationSpec {
        NotificationSpec::new(
            NotificationEvent::RequestApproved,
            "notifications.request.approved.title",
            "notifications.request.approved.body",
        )
    }

    fn user() -> User {
        User {
            id: "u1".into(),
            email: "a@b.c".into(),
            username: "ana".into(),
            avatar_url: None,
            language: None,
            audio_language: None,
            subtitle_language: None,
            permissions: Vec::new(),
            created_at: "2024-01-01T00:00:00Z".into(),
            has_pin: false,
        }
    }

    // Every crate that tests against the seam now leans on these answers, so a
    // change to any of them shifts behaviour in tests that never mention this
    // file. That is what makes pinning them worth doing.

    #[test]
    fn an_unconfigured_stub_answers_neutrally() {
        let host = StubHost::new();

        // Settings hand back the CALLER'S default, so code under test sees its
        // own fallback rather than a value this file invented.
        assert_eq!(host.setting_str("anything", "fallback"), "fallback");
        assert!(host.setting_bool("anything", true));
        assert!(!host.setting_bool("anything", false));
        assert_eq!(host.setting_i64("anything", -7), -7);

        // Gates allow: a test about a handler's behaviour should not have to
        // grant permissions first. Tests about GATING use a real host.
        assert!(host.require(&user(), Permission::LibraryManage).is_ok());
        assert!(host.require_any_admin(&user()).is_ok());

        assert!(host.module_enabled("tv.kroma.anything"));
        assert!(host.library_folders().is_empty());
        assert!(host.tmdb_api_key().is_none());
        assert_eq!(host.metadata_language(), "en");
        assert!(host.get_service(TypeId::of::<u32>()).is_none());
        assert!(host.data_dir().is_dir());
    }

    #[test]
    fn each_builder_overrides_exactly_its_own_answer() {
        let host = StubHost::new()
            .with_tmdb_key("k")
            .with_metadata_language("fr-FR")
            .with_module_enabled(false)
            .with_libraries(vec![LibraryFolders {
                id: "lib1".into(),
                kind: "movies".into(),
                name: "Films".into(),
                folders: vec!["/media/films".into()],
            }])
            .with_setting("str", json!("set"))
            .with_setting("flag", json!(true))
            .with_setting("num", json!(42));

        assert_eq!(host.tmdb_api_key().as_deref(), Some("k"));
        assert_eq!(host.metadata_language(), "fr-FR");
        assert!(!host.module_enabled("tv.kroma.anything"));
        assert_eq!(host.library_folders()[0].folders, ["/media/films"]);
        assert_eq!(host.setting_str("str", "fallback"), "set");
        assert!(host.setting_bool("flag", false));
        assert_eq!(host.setting_i64("num", 0), 42);

        // An unseeded key still falls back, next to the seeded ones.
        assert_eq!(host.setting_str("other", "fallback"), "fallback");
    }

    #[test]
    fn a_string_settings_source_takes_over_from_the_seeded_map() {
        // The source sees the CALLER'S default, so a store with its own
        // registered defaults can answer through the seam exactly as it would
        // directly - which is the only reason this hook exists.
        let host = StubHost::new()
            .with_setting("k", json!("from the map"))
            .with_string_settings(|key, default| format!("{key}/{default}"));

        assert_eq!(host.setting_str("k", "fallback"), "k/fallback");
        assert_eq!(host.setting_str("other", "d"), "other/d");
        // Only strings route through it; the map still answers the rest.
        assert!(host.setting_bool("flag", true));
    }

    #[test]
    fn a_seeded_setting_that_is_not_a_string_still_reads_as_one() {
        // Settings are stored as JSON, and a caller asking for a string should
        // get the value rather than an empty default that hides the mismatch.
        let host = StubHost::new().with_setting("num", json!(42));
        assert_eq!(host.setting_str("num", "fallback"), "42");
    }

    #[test]
    fn the_bus_is_recorded_rather_than_delivered() {
        let host = StubHost::new();
        host.publish(Event::new("scan.finished", json!({})));
        host.publish_to("ana", Event::new("notification.created", json!({})));
        assert_eq!(host.notify(&Audience::user("ana"), &spec()), 1);
        host.trigger_job("library.scan", "test");

        assert_eq!(
            host.published(),
            [
                (None, "scan.finished".to_string()),
                (Some("ana".to_string()), "notification.created".to_string()),
            ]
        );
        assert_eq!(host.topics(), ["scan.finished", "notification.created"]);
        assert_eq!(host.notifications().len(), 1);
        assert_eq!(host.jobs(), [("library.scan", "test")]);
    }

    #[test]
    fn a_clone_sees_the_same_traffic_as_the_original() {
        // axum takes router state BY VALUE, so a handler always works on a clone.
        // If the log were not shared, every assertion after a request would read
        // an empty vec.
        let host = StubHost::new();
        let clone = host.clone();
        clone.publish(Event::new("download.progress", json!({})));
        assert_eq!(host.topics(), ["download.progress"]);
    }

    #[test]
    fn a_written_setting_is_recorded_and_readable_back() {
        let host = StubHost::new();
        host.set_settings(BTreeMap::from([("k".to_string(), json!("v"))]));

        assert_eq!(host.setting_str("k", "fallback"), "v");
        assert_eq!(host.settings_written().len(), 1);
        assert_eq!(host.settings_written()[0]["k"], json!("v"));
    }

    #[test]
    fn services_resolve_by_the_type_they_were_registered_under() {
        struct Manager(u32);
        struct Other;
        let host = StubHost::new().with_service(Arc::new(Manager(42)));

        let got = crate::service::<Manager>(&host).expect("registered");
        assert_eq!(got.0, 42);
        assert!(crate::service::<Other>(&host).is_none());
    }

    #[test]
    fn a_stub_without_a_database_says_so_instead_of_handing_one_out() {
        let host = StubHost::new();
        // `Pool` is not Debug, so map the Ok side away before unwrapping.
        let err = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _ = host.db();
        }))
        .unwrap_err();
        let msg = err.downcast_ref::<String>().expect("expect() panics with a String");
        assert!(msg.contains("StubHost::with_db"), "{msg}");
    }

    #[test]
    fn with_db_hands_out_a_migrated_pool_and_never_the_same_file_twice() {
        let a = StubHost::with_db("selftest");
        let b = StubHost::with_db("selftest");
        // Migrated: a core table is queryable.
        a.db().get().unwrap().execute("SELECT 1 FROM users LIMIT 0", []).unwrap();
        // Separate: a row in one is not in the other. Two tests running in
        // parallel threads of one process must not share a database.
        a.db()
            .get()
            .unwrap()
            .execute("INSERT INTO settings (key, value, updated_at) VALUES ('k', 'v', 'now')", [])
            .unwrap();
        let n: i64 = b
            .db()
            .get()
            .unwrap()
            .query_row("SELECT count(*) FROM settings WHERE key = 'k'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn lerr_carries_the_status_it_was_given() {
        let host = StubHost::new();
        assert_eq!(host.lerr(&user(), StatusCode::NOT_FOUND, "k").status(), StatusCode::NOT_FOUND);
    }

    // ----- the decorator -------------------------------------------------------

    #[test]
    fn recording_forwards_everything_but_the_bus() {
        let inner = StubHost::new().with_tmdb_key("k").with_metadata_language("fr-FR");
        let host = Recording::new(inner);

        // Forwarded, so the test still sees the real host's answers.
        assert_eq!(host.tmdb_api_key().as_deref(), Some("k"));
        assert_eq!(host.metadata_language(), "fr-FR");
        assert_eq!(host.setting_str("k", "fallback"), "fallback");
        assert!(host.require(&user(), Permission::LibraryManage).is_ok());
        assert!(host.require_any_admin(&user()).is_ok());
        assert_eq!(host.lerr(&user(), StatusCode::FORBIDDEN, "k").status(), StatusCode::FORBIDDEN);
        assert!(host.module_enabled("x"));
        assert!(host.library_folders().is_empty());
        assert!(host.get_service(TypeId::of::<u32>()).is_none());
        assert!(host.data_dir().is_dir());
        assert!(!host.setting_bool("k", false));
        assert_eq!(host.setting_i64("k", 3), 3);

        // Writes and jobs go THROUGH to the host underneath.
        host.set_settings(BTreeMap::from([("w".to_string(), json!(1))]));
        host.trigger_job("library.scan", "test");
        assert_eq!(host.inner().settings_written().len(), 1);
        assert_eq!(host.inner().jobs(), [("library.scan", "test")]);
    }

    #[test]
    fn recording_holds_the_bus_back_rather_than_passing_it_on() {
        // Delivering would fan the event out to whatever the real host is wired
        // to, which is never what a test asserting on it wants.
        let host = Recording::new(StubHost::new());
        host.publish(Event::new("scan.finished", json!({})));
        host.publish_to("ana", Event::new("notification.created", json!({})));
        assert_eq!(host.notify(&Audience::Everyone, &spec()), 1);

        assert_eq!(host.topics(), ["scan.finished", "notification.created"]);
        assert_eq!(host.published()[1].0.as_deref(), Some("ana"));
        assert_eq!(host.notifications().len(), 1);
        // Nothing reached the host underneath.
        assert!(host.inner().published().is_empty());
        assert!(host.inner().notifications().is_empty());
    }

    #[test]
    fn recording_hands_its_inner_hosts_database_through() {
        let host = Recording::new(StubHost::with_db("recording"));
        host.db().get().unwrap().execute("SELECT 1 FROM users LIMIT 0", []).unwrap();
    }

    // ----- the stub's required surface -------------------------------------------

    #[test]
    fn the_stub_answers_every_required_method_neutrally() {
        // The seam has ~25 methods and a double is only useful if the ones a
        // test is NOT about stay out of the way: settings hand back the caller's
        // own default, gates allow, and the optional capabilities are absent.
        let host = StubHost::new();
        host.publish(Event::new("scan.finished", json!({})));
        assert_eq!(host.topics(), ["scan.finished"]);
        assert_eq!(host.setting_str("k", "fallback"), "fallback");
        assert!(host.setting_bool("k", true));
        assert_eq!(host.setting_i64("k", 9), 9);
        assert!(host.require(&user(), Permission::LibraryManage).is_ok());
        assert!(host.require_any_admin(&user()).is_ok());
        assert_eq!(host.lerr(&user(), StatusCode::NOT_FOUND, "k").status(), StatusCode::NOT_FOUND);
        assert!(host.module_enabled("x"));
        assert!(host.library_folders().is_empty());
        assert!(host.tmdb_api_key().is_none());
        assert_eq!(host.metadata_language(), "en");
        assert!(host.get_service(TypeId::of::<u32>()).is_none());
        assert!(host.data_dir().is_dir());
        host.set_settings(BTreeMap::from([("k".to_string(), json!("v"))]));
        assert_eq!(host.setting_str("k", "fallback"), "v");
        host.trigger_job("library.scan", "test");
        assert_eq!(host.jobs(), [("library.scan", "test")]);
    }

    #[test]
    fn an_addressed_send_does_not_leak_into_the_broadcast_channel() {
        // `publish_to` carries personal content ("your request was denied" names
        // its recipient), so it must never reach the channel every client reads.
        // The trait makes implementing it mandatory; this is the other half -
        // that an implementation keeps the two buses apart.
        let host = StubHost::new();
        host.publish_to("ana", Event::new("notification.created", json!({})));
        assert_eq!(host.published(), [(Some("ana".to_string()), "notification.created".to_string())]);
        assert!(
            host.published().iter().all(|(to, _)| to.is_some()),
            "an addressed event leaked into the broadcast bus"
        );
    }

    #[test]
    fn the_stub_defaults_to_something_usable() {
        // `Default` exists so a double can be dropped into a `#[derive(Default)]`
        // harness; it must not differ from `new()`.
        assert_eq!(StubHost::default().metadata_language(), StubHost::new().metadata_language());
        assert!(StubHost::default().published().is_empty());
    }
}

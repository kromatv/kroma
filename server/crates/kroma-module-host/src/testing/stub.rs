//! [`StubHost`]: a [`HostCtx`] with no app behind it, every answer neutral
//! until a builder overrides it.

use std::any::{Any, TypeId};
use std::collections::BTreeMap;
use std::path::Path;
use std::sync::{Arc, Mutex};

use axum::http::StatusCode;
use axum::response::Response;
use kroma_db::Pool;
use kroma_domain::{Audience, NotificationSpec, Permission, User};
use kroma_testing::TempDir;

use super::log::{records_into_log, Log, Published};
use crate::{Event, HostCtx, HostStorage, LibraryFolders};

// A host service, as the registry stores it: keyed by the `TypeId` the caller
// will look it up with.
type Service = (TypeId, Arc<dyn Any + Send + Sync>);

// A stand-in for the app's real settings store: `(key, caller's default) ->
// value`, the exact shape of [`HostCtx::setting_str`].
type StringSettings = Arc<dyn Fn(&str, &str) -> String + Send + Sync>;

/// A [`HostCtx`] with no app behind it.
///
/// Every answer is the neutral one until configured: settings hand back the
/// caller's own default, both gates allow, the module is enabled, there are no
/// libraries and no TMDB key. The bus methods record instead of delivering, so
/// a test asserts on [`published`](Self::published) /
/// [`notifications`](Self::notifications) / [`jobs`](Self::jobs).
///
/// `data_dir()` is a scratch directory of this host's own, removed once the last
/// clone drops, so anything the code under test writes there goes with it.
///
/// `db()` / `store()` panic unless the host was built with
/// [`with_db`](Self::with_db) - louder than handing out a pool to a test that did
/// not ask for one.
#[derive(Clone)]
pub struct StubHost {
    db: Option<Pool>,
    store: Option<Pool>,
    sessions: Arc<Mutex<BTreeMap<String, User>>>,
    data_dir: Arc<TempDir>,
    tmdb_key: Option<String>,
    metadata_language: String,
    module_enabled: bool,
    libraries: Vec<LibraryFolders>,
    settings: Arc<Mutex<BTreeMap<String, serde_json::Value>>>,
    string_settings: Option<StringSettings>,
    services: Arc<Mutex<Vec<Service>>>,
    ports: Arc<Mutex<BTreeMap<String, (String, String)>>>,
    log: Arc<Log>,
}

impl Default for StubHost {
    fn default() -> Self {
        Self::new()
    }
}

impl StubHost {
    /// A host with no database. `db()` / `store()` panic if reached.
    pub fn new() -> Self {
        Self::in_dir(kroma_testing::temp_dir("stub-host"))
    }

    /// A host over a real, empty, migrated SQLite database inside this host's
    /// own scratch directory, plus the module-private store beside it. `tag` only
    /// shapes that directory's name, to make a stray one identifiable.
    pub fn with_db(tag: &str) -> Self {
        let data_dir = kroma_testing::temp_dir(tag);
        let db = kroma_db::init(&data_dir.path().join("kroma.db")).expect("init test db");
        // `open`, like the real runtime: a module's own file carries no core
        // schema, only what its own migrations put there.
        let store = kroma_db::open(&data_dir.path().join("module.sqlite")).expect("open test store");
        Self { db: Some(db), store: Some(store), ..Self::in_dir(data_dir) }
    }

    fn in_dir(data_dir: TempDir) -> Self {
        Self {
            db: None,
            store: None,
            sessions: Arc::new(Mutex::new(BTreeMap::new())),
            data_dir: Arc::new(data_dir),
            tmdb_key: None,
            metadata_language: "en".into(),
            module_enabled: true,
            libraries: Vec::new(),
            settings: Arc::new(Mutex::new(BTreeMap::new())),
            string_settings: None,
            services: Arc::new(Mutex::new(Vec::new())),
            ports: Arc::new(Mutex::new(BTreeMap::new())),
            log: Arc::new(Log::default()),
        }
    }

    /// A host over a pool the caller already built. For a module whose tests
    /// need their OWN migrations applied on top of the core schema, which
    /// [`with_db`](Self::with_db) does not know about.
    pub fn with_pool(pool: Pool) -> Self {
        let store = kroma_db::open(&kroma_testing::temp_dir("stub-store").path().join("module.sqlite"))
            .expect("open test store");
        Self { db: Some(pool), store: Some(store), ..Self::new() }
    }

    /// Answer `session_user(token)` with `user`. Without a seeded token the host
    /// falls back to a real lookup against its core pool, so a test that created
    /// a genuine session still authenticates through the seam.
    pub fn with_session(self, token: &str, user: User) -> Self {
        self.sessions.lock().unwrap().insert(token.to_string(), user);
        self
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

    /// Point a port contract at a provider this test stood up (see the SDK's
    /// `testing::serve`). Ports resolve over HTTP now, so a fake is served
    /// rather than injected.
    pub fn with_port(self, port: &str, base: &str, token: &str) -> Self {
        self.ports
            .lock()
            .unwrap()
            .insert(port.to_string(), (base.to_string(), token.to_string()));
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

impl HostStorage for StubHost {
    fn db(&self) -> &Pool {
        self.db.as_ref().expect("this StubHost has no database - build it with StubHost::with_db")
    }
    fn store(&self) -> &Pool {
        self.store.as_ref().expect("this StubHost has no store - build it with StubHost::with_db")
    }
}

impl HostCtx for StubHost {
    fn data_dir(&self) -> &Path {
        self.data_dir.path()
    }
    fn session_user(&self, token: &str) -> Option<User> {
        if let Some(u) = self.sessions.lock().unwrap().get(token) {
            return Some(u.clone());
        }
        kroma_db::session_user(self.db.as_ref()?, token).ok().flatten()
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
    records_into_log!();
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
    fn port_endpoint(&self, port: &str) -> Option<(String, String)> {
        self.ports.lock().unwrap().get(port).cloned()
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

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use super::super::fixtures::user;

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
    fn a_seeded_session_resolves_and_an_unknown_token_does_not() {
        let host = StubHost::new().with_session("tok", user());
        assert_eq!(host.session_user("tok").map(|u| u.id), Some("u1".to_string()));
        assert!(host.session_user("other").is_none());
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
    fn the_stub_defaults_to_something_usable() {
        // `Default` exists so a double can be dropped into a `#[derive(Default)]`
        // harness; it must not differ from `new()`.
        assert_eq!(StubHost::default().metadata_language(), StubHost::new().metadata_language());
        assert!(StubHost::default().published().is_empty());
    }
}

//! [`StubHost`]: a [`HostCtx`] with no app behind it, every answer neutral
//! until a builder overrides it.

use std::any::{Any, TypeId};
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use axum::http::StatusCode;
use axum::response::Response;
use kroma_sqlite::testing::TempPool;
use kroma_sqlite::Pool;
use kroma_module_wire::{Audience, EpisodeInfo, MatchCandidate, NotificationSpec, User};
use kroma_testing::TempDir;

use super::log::{Log, Published};
use crate::LibraryFolders;

// A host service, as the registry stores it: keyed by the `TypeId` the caller
// will look it up with.
type Service = (TypeId, Arc<dyn Any + Send + Sync>);

// A stand-in for the app's real settings store: `(key, caller's default) ->
// value`, the exact shape of [`HostCtx::setting_str`].
type StringSettings = Arc<dyn Fn(&str, &str) -> String + Send + Sync>;

/// A [`HostCtx`] with no app behind it.
///
/// Every answer is the neutral one until configured: settings hand back the
/// caller's own default, both gates allow (see
/// [`with_gates_enforced`](Self::with_gates_enforced)), the module is enabled,
/// there are no libraries and no TMDB key. The bus methods record instead of
/// delivering, so a test asserts on [`published`](Self::published) /
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
    metadata_candidates: Vec<MatchCandidate>,
    metadata_episodes: Vec<EpisodeInfo>,
    module_enabled: bool,
    gates_enforced: bool,
    libraries: Vec<LibraryFolders>,
    settings: Arc<Mutex<BTreeMap<String, serde_json::Value>>>,
    string_settings: Option<StringSettings>,
    services: Arc<Mutex<Vec<Service>>>,
    points: Arc<Mutex<Vec<crate::Contribution>>>,
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

    /// A host over a real, empty SQLite database inside this host's own scratch
    /// directory, plus the module-private store beside it. Neither carries a
    /// schema: a test that needs the core tables hands a migrated pool to
    /// [`with_pool`](Self::with_pool). `tag` only shapes that directory's name,
    /// to make a stray one identifiable.
    pub fn with_db(tag: &str) -> Self {
        let data_dir = kroma_testing::temp_dir(tag);
        let db = kroma_sqlite::open(&data_dir.path().join("kroma.db")).expect("open test db");
        // `open`, like the real runtime: a module's own file carries no core
        // schema, only what its own migrations put there.
        let store =
            kroma_sqlite::open(&data_dir.path().join("module.sqlite")).expect("open test store");
        Self {
            db: Some(db),
            store: Some(store),
            ..Self::in_dir(data_dir)
        }
    }

    fn in_dir(data_dir: TempDir) -> Self {
        Self {
            db: None,
            store: None,
            sessions: Arc::new(Mutex::new(BTreeMap::new())),
            data_dir: Arc::new(data_dir),
            tmdb_key: None,
            metadata_language: "en".into(),
            metadata_candidates: Vec::new(),
            metadata_episodes: Vec::new(),
            module_enabled: true,
            gates_enforced: false,
            libraries: Vec::new(),
            settings: Arc::new(Mutex::new(BTreeMap::new())),
            string_settings: None,
            services: Arc::new(Mutex::new(Vec::new())),
            points: Arc::new(Mutex::new(Vec::new())),
            log: Arc::new(Log::default()),
        }
    }

    /// A host over a core database the caller built, with the module-private
    /// store beside it. The core schema is not this crate's to know: a test that
    /// needs it hands over `kroma_db::testing::temp_pool`, whose directory this
    /// host then keeps for as long as it lives.
    pub fn with_core(core: TempPool) -> Self {
        let (db, data_dir) = core.into_parts();
        let store =
            kroma_sqlite::open(&data_dir.path().join("module.sqlite")).expect("open test store");
        Self {
            db: Some(db),
            store: Some(store),
            ..Self::in_dir(data_dir)
        }
    }

    /// A host whose MODULE store is `pool`, with a fresh, empty core database
    /// beside it. For a module testing its own tables: those live in its own file,
    /// so a test that seeded them has to hand them over as the store and not as
    /// the core.
    pub fn with_store(pool: Pool) -> Self {
        let data_dir = kroma_testing::temp_dir("stub-core");
        let db = kroma_sqlite::open(&data_dir.path().join("kroma.db")).expect("open test db");
        Self {
            db: Some(db),
            store: Some(pool),
            ..Self::in_dir(data_dir)
        }
    }

    /// Answer `session_user(token)` with `user`. A token nobody seeded is an
    /// unknown session, the way the real host answers one.
    pub fn with_session(self, token: &str, user: User) -> Self {
        self.sessions
            .lock()
            .unwrap()
            .insert(token.to_string(), user);
        self
    }

    /// Answer `secret("tmdb")` with `key`.
    pub fn with_tmdb_key(mut self, key: &str) -> Self {
        self.tmdb_key = Some(key.into());
        self
    }

    /// Answer `metadata_episodes()` with `episodes` (default: none).
    pub fn with_metadata_episodes(mut self, episodes: Vec<EpisodeInfo>) -> Self {
        self.metadata_episodes = episodes;
        self
    }

    /// Answer `metadata_candidates()` with `candidates`, whatever is asked
    /// (default: none, i.e. nothing matched).
    pub fn with_metadata_candidates(mut self, candidates: Vec<MatchCandidate>) -> Self {
        self.metadata_candidates = candidates;
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

    /// Answer both gates from the rights the user holds, instead of allowing
    /// every caller.
    pub fn with_gates_enforced(mut self) -> Self {
        self.gates_enforced = true;
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
        self.services
            .lock()
            .unwrap()
            .push((TypeId::of::<T>(), value));
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

    /// Answer `point` with a provider this test stood up (see
    /// [`test_serve::serve`](crate::test_serve::serve)). A point resolves over
    /// HTTP, so a fake is served rather than injected. Call it again with another
    /// `instance` to give the point two contributors and exercise fan-out.
    pub fn with_point(self, point: &str, instance: Option<&str>, base: &str, token: &str) -> Self {
        self.points.lock().unwrap().push(crate::Contribution {
            module_id: format!("test.{point}"),
            instance: instance.map(str::to_string),
            base_url: base.to_string(),
            token: token.to_string(),
        });
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

    fn gated(&self, holds: bool) -> Result<(), Response> {
        if holds || !self.gates_enforced {
            return Ok(());
        }
        Err(crate::json_error(StatusCode::FORBIDDEN, "forbidden"))
    }
}

mod answers;

#[cfg(test)]
mod tests;

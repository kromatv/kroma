//! [`Recording`]: a decorator over a REAL host that forwards everything but the
//! event bus, which it captures instead.

use std::any::{Any, TypeId};
use std::collections::BTreeMap;
use std::path::Path;
use std::sync::Arc;

use axum::http::StatusCode;
use axum::response::Response;
use kroma_db::Pool;
use kroma_domain::{Audience, NotificationSpec, Permission, User};

use super::log::{records_into_log, Log, Published};
use crate::{Event, HostCtx, HostStorage, LibraryFolders};

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
        Self {
            inner,
            log: Arc::new(Log::default()),
        }
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

impl<H: HostStorage> HostStorage for Recording<H> {
    fn db(&self) -> &Pool {
        self.inner.db()
    }
    fn store(&self) -> &Pool {
        self.inner.store()
    }
}

impl<H: HostCtx> HostCtx for Recording<H> {
    fn data_dir(&self) -> &Path {
        self.inner.data_dir()
    }
    fn session_user(&self, token: &str) -> Option<User> {
        self.inner.session_user(token)
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
    records_into_log!();
    fn trigger_job(&self, key: &'static str, reason: &'static str) {
        self.inner.trigger_job(key, reason);
    }
    fn module_enabled(&self, id: &str) -> bool {
        self.inner.module_enabled(id)
    }
    fn library_folders(&self) -> Vec<LibraryFolders> {
        self.inner.library_folders()
    }
    fn secret(&self, name: &str) -> Option<String> {
        self.inner.secret(name)
    }
    fn metadata_language(&self) -> String {
        self.inner.metadata_language()
    }
    fn contributions(&self, point: &str) -> Vec<crate::Contribution> {
        self.inner.contributions(point)
    }

    fn get_service(&self, type_id: TypeId) -> Option<Arc<dyn Any + Send + Sync>> {
        self.inner.get_service(type_id)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::super::fixtures::{spec, user};
    use super::super::StubHost;
    use super::*;

    #[test]
    fn recording_forwards_everything_but_the_bus() {
        let inner = StubHost::new()
            .with_tmdb_key("k")
            .with_metadata_language("fr-FR");
        let host = Recording::new(inner);

        // Forwarded, so the test still sees the real host's answers.
        assert_eq!(host.secret("tmdb").as_deref(), Some("k"));
        assert_eq!(host.metadata_language(), "fr-FR");
        assert_eq!(host.setting_str("k", "fallback"), "fallback");
        assert!(host.require(&user(), Permission::LibraryManage).is_ok());
        assert!(host.require_any_admin(&user()).is_ok());
        assert_eq!(
            host.lerr(&user(), StatusCode::FORBIDDEN, "k").status(),
            StatusCode::FORBIDDEN
        );
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
        host.db()
            .get()
            .unwrap()
            .execute("SELECT 1 FROM users LIMIT 0", [])
            .unwrap();
    }
}

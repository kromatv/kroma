//! The slice of the running app a module reaches through, and the blanket impl
//! that lifts it to the `Arc` a router carries as its state.

use std::any::{Any, TypeId};
use std::path::Path;
use std::sync::Arc;

use axum::http::StatusCode;
use axum::response::Response;

use kroma_domain::{Audience, NotificationSpec, Permission, User};

use super::{Event, LibraryFolders};

/// The slice of the running app a module's backend can reach. The binary's
/// `AppState` (as `Arc<AppState>` = `SharedState`) implements it; a module crate
/// names only this trait, never the app, so it stays a leaf and breaks the cycle.
pub trait HostCtx: Send + Sync + 'static {
    fn data_dir(&self) -> &Path;

    // Resolve a session bearer token to the account holding it, or `None` for a
    // missing, expired or unknown one. Blocking: in-process this is one indexed
    // read, out-of-process it is the `/_host/session` callback.
    fn session_user(&self, token: &str) -> Option<User>;

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

// The router state is `Arc<AppState>`, but the orphan rule forbids
// `impl HostCtx for Arc<AppState>` in the app crate. This blanket impl - legal
// here because the trait is local - lifts any `T: HostCtx` to `Arc<T>`.
impl<T: HostCtx + ?Sized> HostCtx for std::sync::Arc<T> {
    fn data_dir(&self) -> &Path {
        (**self).data_dir()
    }
    fn session_user(&self, token: &str) -> Option<User> {
        (**self).session_user(token)
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

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    use kroma_domain::NotificationEvent;

    use crate::testing;

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
        fn data_dir(&self) -> &Path {
            Path::new("/recorder")
        }
        fn session_user(&self, token: &str) -> Option<User> {
            self.note(&format!("session_user:{token}"));
            None
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
        assert!(host.session_user("tok").is_none());
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
                "session_user:tok",
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
}

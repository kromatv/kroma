//! The concrete side of the module host seam: `HostCtx` implemented for
//! [`AppState`]. Module crates name only the trait (in `kroma-module-host`); the
//! app supplies the real DB pool, capability gating (localized via the app's
//! i18n), settings, and data dir. `Arc<AppState>` (= `SharedState`, the axum
//! router state) gets `HostCtx` for free via the blanket `Arc<T>` impl.

use std::path::Path;

use axum::http::StatusCode;
use axum::response::Response;
use kroma_db::Pool;
use kroma_domain::{Permission, User};
use kroma_module_host::{json_error, Event, HostCtx};

use crate::services::jobs::JobKey;
use crate::state::AppState;

fn forbidden(user: &User) -> Response {
    json_error(
        StatusCode::FORBIDDEN,
        &crate::i18n::t(crate::i18n::user_locale(user), "error.permissionDenied", &[]),
    )
}

impl HostCtx for AppState {
    fn db(&self) -> &Pool {
        &self.db
    }

    fn data_dir(&self) -> &Path {
        &self.config.data_dir
    }

    fn require(&self, user: &User, perm: Permission) -> Result<(), Response> {
        if user.can(perm) {
            Ok(())
        } else {
            Err(forbidden(user))
        }
    }

    fn require_any_admin(&self, user: &User) -> Result<(), Response> {
        if user.is_any_admin() {
            Ok(())
        } else {
            Err(forbidden(user))
        }
    }

    fn lerr(&self, user: &User, status: StatusCode, key: &str) -> Response {
        json_error(status, &crate::i18n::t(crate::i18n::user_locale(user), key, &[]))
    }

    fn setting_str(&self, key: &str, default: &str) -> String {
        self.settings.get_str(key, default)
    }

    fn setting_bool(&self, key: &str, default: bool) -> bool {
        self.settings.get_bool(key, default)
    }

    fn setting_i64(&self, key: &str, default: i64) -> i64 {
        self.settings.get_i64(key, default)
    }

    fn set_settings(&self, patch: std::collections::BTreeMap<String, serde_json::Value>) {
        self.settings.set_patch(&self.db, patch);
    }

    fn publish(&self, event: Event) {
        // Merge the module's topic under the wire `type` key into its payload
        // object, matching the bus wire shape `{ "type": <topic>, ...fields }`.
        // The core stays generic: it names no module event type.
        let serde_json::Value::Object(mut obj) = event.payload else {
            tracing::warn!(topic = %event.topic, "module event payload is not a JSON object; dropping");
            return;
        };
        obj.insert("type".to_string(), serde_json::Value::String(event.topic));
        self.events.publish_value(serde_json::Value::Object(obj));
    }

    fn publish_to(&self, user_id: &str, event: Event) {
        // Same wire shape as `publish` above; only the envelope's audience
        // differs, so `ws.rs` forwards it to this user's sockets alone.
        let serde_json::Value::Object(mut obj) = event.payload else {
            tracing::warn!(topic = %event.topic, "module event payload is not a JSON object; dropping");
            return;
        };
        obj.insert("type".to_string(), serde_json::Value::String(event.topic));
        self.events.publish_value_to(user_id, serde_json::Value::Object(obj));
    }

    fn notify(
        &self,
        audience: &kroma_module_host::Audience,
        spec: &kroma_module_host::NotificationSpec,
    ) -> usize {
        // In-core modules and the core itself land on the same code path as the
        // out-of-process ones (which arrive here via `/api/_host/notify`), so
        // preferences and audience rules are enforced in exactly one place.
        crate::services::notify::emit(self, audience, spec)
    }

    fn trigger_job(&self, key: &'static str, reason: &'static str) {
        if let Some(state) = self.shared() {
            let _ = state.jobs.trigger(state.clone(), JobKey(key), reason);
        }
    }

    fn module_enabled(&self, id: &str) -> bool {
        crate::modules::module_enabled(&self.settings, id)
    }

    fn library_folders(&self) -> Vec<kroma_module_host::LibraryFolders> {
        crate::services::settings::library_defs(&self.settings, &self.config)
            .into_iter()
            .map(|d| kroma_module_host::LibraryFolders {
                id: d.id,
                kind: d.kind,
                name: d.name,
                folders: d.folders,
            })
            .collect()
    }

    fn tmdb_api_key(&self) -> Option<String> {
        self.config.tmdb_api_key.clone()
    }

    fn metadata_language(&self) -> String {
        crate::services::settings::metadata_language(&self.settings, &self.config)
    }

    fn get_service(
        &self,
        type_id: std::any::TypeId,
    ) -> Option<std::sync::Arc<dyn std::any::Any + Send + Sync>> {
        self.services.get(&type_id).cloned()
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use serde_json::json;

    use super::*;
    use crate::test_support::test_state;

    /// The JSON body of a bus message, whoever it was addressed to - these tests
    /// assert on what was published, not on who may read it.
    fn body(env: &crate::infra::events::Envelope) -> serde_json::Value {
        serde_json::from_str(env.payload_unrouted()).unwrap()
    }

    fn user(state: &crate::state::SharedState, perms: &[Permission]) -> User {
        kroma_db::create_user(&state.db, "a@b.c", "A", "h", perms).unwrap()
    }

    #[test]
    fn exposes_the_pool_and_data_dir_the_app_is_using() {
        // A module writing beside the app's data must land where the app reads.
        let state = test_state();
        assert_eq!(HostCtx::data_dir(&*state), state.config.data_dir.as_path());
        assert!(HostCtx::db(&*state).get().is_ok());
    }

    #[test]
    fn gates_on_the_permission_the_module_asked_for() {
        let state = test_state();
        let admin = user(&state, &[Permission::SettingsManage]);
        assert!(state.require(&admin, Permission::SettingsManage).is_ok());

        // A refusal is a 403 the module returns as-is - not a panic, and not a
        // silent allow.
        let denied = state.require(&admin, Permission::UsersManage).unwrap_err();
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);
    }

    #[test]
    fn gates_admin_only_surfaces() {
        let state = test_state();
        let plain = user(&state, &[Permission::Playback]);
        assert_eq!(state.require_any_admin(&plain).unwrap_err().status(), StatusCode::FORBIDDEN);
    }

    #[test]
    fn localizes_an_error_at_the_status_the_module_chose() {
        let state = test_state();
        let u = user(&state, &[]);
        // The module names a message KEY and the app owns the translation, so a
        // module never ships user-facing English of its own.
        let res = state.lerr(&u, StatusCode::NOT_FOUND, "error.notFound");
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn reads_and_writes_settings_through_the_app() {
        let state = test_state();
        assert_eq!(state.setting_str("nope", "fallback"), "fallback");
        assert!(state.setting_bool("nope", true));
        assert_eq!(state.setting_i64("nope", 7), 7);

        state.set_settings(BTreeMap::from([("cacheLimit".to_string(), json!("42 Go"))]));
        // Written to the store the APP reads, not a module-local copy that
        // vanishes on restart.
        assert_eq!(state.setting_str("cacheLimit", ""), "42 Go");
    }

    #[test]
    fn merges_the_topic_into_the_payload_as_the_wire_type() {
        let state = test_state();
        let mut rx = state.events.subscribe();
        state.publish(Event::new("download.progress", json!({ "id": "d1", "pct": 40 })));

        // The wire shape is one FLAT object, `{ "type": <topic>, ...fields }`, so
        // a client switches on `type` without unwrapping an envelope.
        let env = rx.try_recv().expect("published");
        assert_eq!(body(&env), json!({ "type": "download.progress", "id": "d1", "pct": 40 }));
        assert!(env.visible_to("anyone"), "a plain publish reaches every socket");
    }

    #[test]
    fn addresses_a_user_event_to_that_user_alone() {
        let state = test_state();
        let mut rx = state.events.subscribe();
        state.publish_to("u1", Event::new("download.done", json!({ "id": "d1" })));

        let env = rx.try_recv().expect("published");
        assert!(env.visible_to("u1"));
        // This is what keeps one account's downloads off another's screen.
        assert!(!env.visible_to("u2"));
        assert_eq!(body(&env), json!({ "type": "download.done", "id": "d1" }));
    }

    #[test]
    fn drops_an_event_whose_payload_is_not_an_object() {
        let state = test_state();
        let mut rx = state.events.subscribe();
        // There is nowhere to merge `type` into an array or a scalar. Publishing
        // anyway would put a frame on the wire that no client can switch on, so
        // it is DROPPED with a warning instead.
        state.publish(Event::new("bad", json!([1, 2, 3])));
        state.publish(Event::new("bad", json!("a string")));
        state.publish_to("u1", Event::new("bad", json!(42)));

        assert!(rx.try_recv().is_err(), "nothing reached the bus");
    }

    #[test]
    fn reports_the_tmdb_key_the_app_was_configured_with() {
        assert_eq!(HostCtx::tmdb_api_key(&*test_state()), None);
        assert_eq!(
            HostCtx::tmdb_api_key(&*crate::test_support::test_state_with_tmdb("k")),
            Some("k".to_string())
        );
    }

    #[test]
    fn always_reports_a_metadata_language() {
        // A module formatting a title has no fallback of its own, so this may
        // never be empty.
        assert!(!HostCtx::metadata_language(&*test_state()).is_empty());
    }

    #[test]
    fn has_no_service_a_module_never_registered() {
        // A lookup returning None, so asking for an optional peer is not a panic.
        let state = test_state();
        assert!(state.get_service(std::any::TypeId::of::<u32>()).is_none());
    }
    // ----- the rest of the seam ---------------------------------------------------

    #[test]
    fn a_modules_notification_goes_through_the_same_rules_as_the_cores() {
        // The point of routing module `notify` through `services::notify::emit`
        // is that preferences and audience are enforced in ONE place. A module
        // that reached the notification table directly would ignore the mute a
        // user set, and there would be no second place to fix it.
        use kroma_domain::{
            Audience, CategoryPref, NotificationCategory, NotificationEvent, NotificationSpec,
        };

        let state = test_state();
        let ana = kroma_db::create_user(&state.db, "ana@t.dev", "Ana", "h", &[]).unwrap().id;
        let spec = NotificationSpec::new(
            NotificationEvent::RequestApproved,
            "notifications.request.approved.title",
            "notifications.request.approved.body",
        );

        assert_eq!(HostCtx::notify(&*state, &Audience::user(ana.clone()), &spec), 1);

        // Now the user mutes that category; a module's notify must fall silent
        // too.
        kroma_db::notifications::set_prefs(
            &state.db,
            &ana,
            &[CategoryPref {
                category: NotificationCategory::Requests,
                in_app: false,
                push: false,
            }],
        )
        .unwrap();
        assert_eq!(HostCtx::notify(&*state, &Audience::user(ana), &spec), 0);
    }

    #[test]
    fn a_module_sees_the_library_folders_the_app_is_configured_with() {
        // This is how an importer decides WHERE a finished download goes, so the
        // id / kind / name have to survive the mapping - a module placing files
        // by name would put a show in the movies library if `name` were dropped.
        use crate::services::settings::{set_library_defs, LibraryDef};

        let state = test_state();
        set_library_defs(
            &state.settings,
            &state.db,
            &[
                LibraryDef {
                    id: "lib-films".into(),
                    name: "Films".into(),
                    kind: "movies".into(),
                    folders: vec!["/media/films".into(), "/media/films2".into()],
                    auto_scan: true,
                },
                LibraryDef {
                    id: "lib-series".into(),
                    name: "Séries".into(),
                    kind: "shows".into(),
                    folders: vec!["/media/series".into()],
                    auto_scan: false,
                },
            ],
        );

        let seen = HostCtx::library_folders(&*state);
        assert_eq!(seen.len(), 2);
        assert_eq!(seen[0].id, "lib-films");
        assert_eq!(seen[0].kind, "movies");
        assert_eq!(seen[0].name, "Films");
        assert_eq!(seen[0].folders, ["/media/films", "/media/films2"]);
        assert_eq!(seen[1].kind, "shows");
        assert_eq!(seen[1].name, "Séries");
    }

    #[test]
    fn a_module_reads_the_same_enabled_flag_the_admin_toggles() {
        // A module asking "is X on?" must get the admin's answer, not its own
        // default - that is what lets one module gate on another.
        let state = test_state();
        assert!(HostCtx::module_enabled(&*state, "tv.kroma.indexer"), "unknown means on");

        crate::modules::set_module_enabled(&state.settings, &state.db, "tv.kroma.indexer", false);
        assert!(!HostCtx::module_enabled(&*state, "tv.kroma.indexer"));
    }

    #[test]
    fn the_tmdb_key_and_language_come_from_the_apps_config() {
        // A sidecar has no config file of its own; these are the only way it
        // learns them, and a wrong language means every fetched title is in the
        // wrong one.
        let state = test_state();
        assert_eq!(HostCtx::tmdb_api_key(&*state), None);
        assert_eq!(HostCtx::metadata_language(&*state), state.config.tmdb_language);

        let keyed = crate::test_support::test_state_with_tmdb("abc123");
        assert_eq!(HostCtx::tmdb_api_key(&*keyed).as_deref(), Some("abc123"));
    }

    #[test]
    fn triggering_an_unknown_job_is_a_no_op_rather_than_a_panic() {
        // Modules trigger jobs by string key, and a key can outlive the job that
        // owned it (a module disabled, a job renamed). It must not take the
        // caller down.
        let state = test_state();
        HostCtx::trigger_job(&*state, "no.such.job", "test");
    }
}

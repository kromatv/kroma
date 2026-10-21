use std::any::{Any, TypeId};
use std::path::Path;
use std::sync::Arc;

use axum::http::StatusCode;
use axum::response::Response;
use kroma_module_host::{json_error, Event, HostCtx};
use kroma_module_wire::{Permission, User};

use crate::remote_host::RemoteHost;

impl HostCtx for RemoteHost {
    fn data_dir(&self) -> &Path {
        &self.inner.data_dir
    }

    // Asked of the core rather than read from the `sessions` table.
    fn session_user(&self, token: &str) -> Option<User> {
        // POSTed, not queried: the token is the caller's live session.
        self.callback()
            .post_json(
                &self.host_url("session"),
                &serde_json::json!({ "token": token }),
            )
            .ok()?
            .json::<Option<User>>()
            .ok()
            .flatten()
    }

    fn require(&self, user: &User, perm: Permission) -> Result<(), Response> {
        if user.can(perm) {
            Ok(())
        } else {
            Err(json_error(StatusCode::FORBIDDEN, "forbidden"))
        }
    }

    fn require_any_admin(&self, user: &User) -> Result<(), Response> {
        if user.is_any_admin() {
            Ok(())
        } else {
            Err(json_error(StatusCode::FORBIDDEN, "forbidden"))
        }
    }

    fn lerr(&self, _user: &User, status: StatusCode, key: &str) -> Response {
        // No i18n catalogs out-of-process; the frontend localizes known error keys.
        json_error(status, key)
    }

    fn setting_str(&self, key: &str, default: &str) -> String {
        self.callback()
            .query("key", key)
            .query("kind", "str")
            .query("default", default)
            .get_json::<serde_json::Value>(&self.host_url("setting"))
            .ok()
            .and_then(|v| v.get("value").and_then(|x| x.as_str().map(str::to_string)))
            .unwrap_or_else(|| default.to_string())
    }

    fn setting_bool(&self, key: &str, default: bool) -> bool {
        self.callback()
            .query("key", key)
            .query("kind", "bool")
            .query("default", default.to_string())
            .get_json::<serde_json::Value>(&self.host_url("setting"))
            .ok()
            .and_then(|v| v.get("value").and_then(serde_json::Value::as_bool))
            .unwrap_or(default)
    }

    fn setting_i64(&self, key: &str, default: i64) -> i64 {
        self.callback()
            .query("key", key)
            .query("kind", "i64")
            .query("default", default.to_string())
            .get_json::<serde_json::Value>(&self.host_url("setting"))
            .ok()
            .and_then(|v| v.get("value").and_then(serde_json::Value::as_i64))
            .unwrap_or(default)
    }

    fn set_settings(&self, patch: std::collections::BTreeMap<String, serde_json::Value>) {
        let _ = self.callback().post_json(
            &self.host_url("settings"),
            &serde_json::json!({ "patch": patch }),
        );
    }

    fn publish(&self, event: Event) {
        let _ = self.callback().post_json(
            &self.host_url("events"),
            &serde_json::json!({ "topic": event.topic, "payload": event.payload }),
        );
    }

    fn publish_to(&self, user_id: &str, event: Event) {
        let _ = self.callback().post_json(
            &self.host_url("events_to"),
            &serde_json::json!({ "userId": user_id, "topic": event.topic, "payload": event.payload }),
        );
    }

    fn notify(
        &self,
        audience: &kroma_module_host::Audience,
        spec: &kroma_module_host::NotificationSpec,
    ) -> usize {
        // The core resolves, filters, persists and pushes; this only ships the intent.
        let body = serde_json::json!({ "audience": audience, "spec": spec });
        self.callback()
            .post_json(&self.host_url("notify"), &body)
            .ok()
            .and_then(|r| r.json::<serde_json::Value>().ok())
            .and_then(|v| v.get("sent").and_then(serde_json::Value::as_u64))
            .unwrap_or(0) as usize
    }

    fn trigger_job(&self, key: &'static str, reason: &'static str) {
        let _ = self.callback().post_json(
            &self.host_url("job"),
            &serde_json::json!({ "key": key, "reason": reason }),
        );
    }

    fn module_enabled(&self, id: &str) -> bool {
        self.callback()
            .query("id", id)
            .get_json::<serde_json::Value>(&self.host_url("enabled"))
            .ok()
            .and_then(|v| v.get("enabled").and_then(serde_json::Value::as_bool))
            // A module process only runs while enabled, so default to true.
            .unwrap_or(true)
    }

    fn library_folders(&self) -> Vec<kroma_module_host::LibraryFolders> {
        // The core owns Settings + Config; this process never links the engine.
        self.callback()
            .get_json(&self.host_url("libraries"))
            .unwrap_or_default()
    }

    fn secret(&self, name: &str) -> Option<String> {
        self.callback()
            .query("name", name)
            .get_json::<Option<String>>(&self.host_url("secret"))
            .ok()
            .flatten()
    }

    fn metadata_language(&self) -> String {
        if let Some(v) = self.inner.language.read().unwrap().clone() {
            return v;
        }
        let asked = self
            .callback()
            .get_json::<String>(&self.host_url("metadata-language"))
            .ok()
            .filter(|v| !v.is_empty());
        // Only a real answer is cached, so a transient failure retries rather
        // than pinning the fallback for the life of the process.
        match asked {
            Some(v) => {
                *self.inner.language.write().unwrap() = Some(v.clone());
                v
            }
            None => "en-US".to_string(),
        }
    }

    // Asked of the core, which holds the provider credential.
    fn metadata_candidates(
        &self,
        query: &str,
        kind: &str,
        year: Option<u32>,
    ) -> Vec<kroma_module_wire::MatchCandidate> {
        let mut call = self.callback().query("q", query).query("kind", kind);
        if let Some(year) = year {
            call = call.query("year", year.to_string());
        }
        call.get_json::<Vec<kroma_module_wire::MatchCandidate>>(&self.host_url("metadata-search"))
            .unwrap_or_default()
    }

    fn metadata_episodes(&self, tmdb_id: u64, season: u32) -> Vec<kroma_module_wire::EpisodeInfo> {
        self.callback()
            .query("tmdbId", tmdb_id.to_string())
            .query("season", season.to_string())
            .get_json::<Vec<kroma_module_wire::EpisodeInfo>>(&self.host_url("metadata-episodes"))
            .unwrap_or_default()
    }

    // Asked of the core, which owns the supervisor: a sidecar cannot see which
    // of its peers is installed or running, and must not care.
    fn contributions(&self, point: &str) -> Vec<kroma_module_host::Contribution> {
        self.callback()
            .query("point", point)
            .get_json::<Vec<kroma_module_host::Contribution>>(&self.host_url("contributions"))
            .unwrap_or_default()
    }

    fn get_service(&self, type_id: TypeId) -> Option<Arc<dyn Any + Send + Sync>> {
        self.inner.services.read().unwrap().get(&type_id).cloned()
    }
}

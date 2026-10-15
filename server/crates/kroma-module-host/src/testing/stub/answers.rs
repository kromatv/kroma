//! What a [`StubHost`] answers as a host: the neutral reply to every method of
//! [`HostCtx`] and [`HostStorage`], unless a builder overrode it.

use std::any::{Any, TypeId};
use std::collections::BTreeMap;
use std::path::Path;
use std::sync::Arc;

use axum::http::StatusCode;
use axum::response::Response;
use kroma_sqlite::Pool;
use kroma_module_wire::{
    Audience, EpisodeInfo, MatchCandidate, NotificationSpec, Permission, User,
};

use super::super::log::records_into_log;
use super::StubHost;
use crate::{Event, HostCtx, HostStorage, LibraryFolders};

impl HostStorage for StubHost {
    fn db(&self) -> &Pool {
        self.db
            .as_ref()
            .expect("this StubHost has no database - build it with StubHost::with_db")
    }
    fn store(&self) -> &Pool {
        self.store
            .as_ref()
            .expect("this StubHost has no store - build it with StubHost::with_db")
    }
}

impl HostCtx for StubHost {
    fn data_dir(&self) -> &Path {
        self.data_dir.path()
    }
    fn session_user(&self, token: &str) -> Option<User> {
        self.sessions.lock().unwrap().get(token).cloned()
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
        self.settings
            .lock()
            .unwrap()
            .get(key)
            .and_then(|v| v.as_bool())
            .unwrap_or(default)
    }
    fn setting_i64(&self, key: &str, default: i64) -> i64 {
        self.settings
            .lock()
            .unwrap()
            .get(key)
            .and_then(|v| v.as_i64())
            .unwrap_or(default)
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
    fn secret(&self, name: &str) -> Option<String> {
        // One secret is enough for a double; a name it was not given is absent,
        // which is what a host that has none answers.
        self.tmdb_key.clone().filter(|_| name == "tmdb")
    }
    fn metadata_language(&self) -> String {
        self.metadata_language.clone()
    }

    fn metadata_candidates(
        &self,
        _query: &str,
        _kind: &str,
        _year: Option<u32>,
    ) -> Vec<MatchCandidate> {
        self.metadata_candidates.clone()
    }

    fn metadata_episodes(&self, _tmdb_id: u64, _season: u32) -> Vec<EpisodeInfo> {
        self.metadata_episodes.clone()
    }
    fn contributions(&self, point: &str) -> Vec<crate::Contribution> {
        let prefix = format!("test.{point}");
        self.points
            .lock()
            .unwrap()
            .iter()
            .filter(|c| c.module_id == prefix)
            .cloned()
            .collect()
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

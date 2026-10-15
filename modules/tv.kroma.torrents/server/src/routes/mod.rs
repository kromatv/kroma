//! The Downloads module's admin API, served under its `/api/admin/m/<id>` mount.

mod actions;
mod add;
mod bandwidth;
mod clients;
mod contents;
mod limits;
mod link;
mod organize;
mod play;
mod queue;
pub(crate) mod view;

use std::sync::Arc;

use axum::response::Response;
use axum::Router;

use kroma_module_sdk::domain::{Permission, User};
use kroma_module_sdk::host::{service, HostStorage};

use crate::DownloadManager;

/// Mounted behind the module's enabled-gate by the host, so the whole surface
/// 404s while the module is disabled.
pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    clients::routes::<S>()
        .merge(queue::routes::<S>())
        .merge(actions::routes::<S>())
        .merge(bandwidth::routes::<S>())
        .merge(limits::routes::<S>())
        .merge(add::routes::<S>())
        .merge(link::routes::<S>())
        .merge(contents::routes::<S>())
        .merge(play::routes::<S>())
        .merge(organize::routes::<S>())
}

pub(super) fn dm<S: HostStorage>(state: &S) -> Arc<DownloadManager> {
    service::<DownloadManager>(state).expect("download manager registered")
}

pub(super) fn require_downloads<S: HostStorage>(state: &S, user: &User) -> Result<(), Response> {
    if user.can(Permission::RequestsManage) || user.can(Permission::SettingsManage) {
        Ok(())
    } else {
        state.require(user, Permission::SettingsManage)
    }
}

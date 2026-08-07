//! The Downloads module's admin API (served under its `/api/admin/m/<id>` mount): torrent engines
//! ([`clients`]), the download queue ([`queue`]), the file-organize tool
//! ([`organize`]). Every handler is generic over the host state `S: HostCtx`, so
//! the module runs both in-process and out-of-process in its `.kmod` form.

mod clients;
mod organize;
mod queue;

use axum::Router;

use kroma_module_sdk::host::HostCtx;

/// Mounted behind the module's enabled-gate by the host, so the whole surface
/// 404s while the module is disabled.
pub fn routes<S: HostCtx + Clone + Send + Sync + 'static>() -> Router<S> {
    clients::routes::<S>().merge(queue::routes::<S>()).merge(organize::routes::<S>())
}

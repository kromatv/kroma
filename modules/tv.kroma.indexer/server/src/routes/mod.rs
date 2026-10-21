//! `/indexers` indexer management, for both kinds: external Torznab
//! (Jackett / Prowlarr) endpoints and native `builtin` Cardigann definitions.
//! CRUD + a test call, plus the definition catalog (browse + sync). Gated on
//! `settings.manage`. Secrets (api key, per-indexer passwords) are write-only and
//! never leave the server.
//!
//! Relocated into the Indexers module; generic over any [`HostCtx`] so the binary
//! mounts it with the app state, and it reaches the app only through the seam.

mod create;
mod definitions;
mod indexers;
mod test_call;
mod update;

#[cfg(test)]
mod test_support;
#[cfg(test)]
mod tests;

use axum::routing::{get, post};
use axum::Router;
use kroma_module_sdk::host::HostStorage;

pub use create::create;
pub use definitions::{definition_detail, list_definitions, sync_definitions};
pub use indexers::{list, remove};
pub use test_call::test;
pub use update::update;

pub fn routes<S>() -> Router<S>
where
    S: HostStorage + Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/indexers", get(list::<S>).post(create::<S>))
        // Static `definitions` paths are registered before the `:id` dynamic
        // route; matchit prioritizes static segments, so order is not load-bearing.
        .route("/indexers/definitions", get(list_definitions::<S>))
        .route("/indexers/definitions/sync", post(sync_definitions::<S>))
        .route("/indexers/definitions/{defId}", get(definition_detail::<S>))
        .route(
            "/indexers/{id}",
            axum::routing::put(update::<S>).delete(remove::<S>),
        )
        .route("/indexers/{id}/test", post(test::<S>))
}

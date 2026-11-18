//! The Jellyfin importer. It answers the core's `importer` point by reading a
//! Jellyfin server over its HTTP API: one sign-in, then libraries, users, titles,
//! watch state and the last play of each title. Every call it can make is a row
//! of the `dialect` table, and all but the sign-in are a `GET`.

mod client;
mod connect;
mod dialect;
mod jellyfin;
mod module;
mod plays;
mod queries;
mod serve;
mod sign_ins;
mod states;
mod survey;
#[cfg(test)]
mod test_support;
mod time;
mod titles;
mod web;
mod wire;

use std::sync::Arc;

use kroma_module_sdk::db::Pool;

pub use module::{server_module, MODULE};
pub use serve::routes;

pub const MODULE_ID: &str = "tv.kroma.import.jellyfin";

pub(crate) struct Importer {
    pub(crate) store: Pool,
    pub(crate) web: Arc<dyn web::Web>,
    pub(crate) dialect: &'static dialect::Dialect,
}

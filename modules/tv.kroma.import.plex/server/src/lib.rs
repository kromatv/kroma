//! The Plex importer: it answers the core's `importer` point for a Plex Media
//! Server. It signs in to plex.tv with a PIN the owner approves there, then
//! reads the server's libraries, users, watch state and plays, and describes
//! them. It changes nothing on plex.tv or on the server, and writes nothing to
//! KROMA: the core decides what each thing becomes.
//!
//! Every Plex fact the code relies on is in `docs/reference/plex-api.md`.

mod account;
mod connect;
mod failure;
mod ids;
mod library;
mod module;
mod paging;
mod plays;
mod plex;
mod route;
mod serve;
mod server;
mod states;
mod store;
mod survey;
#[cfg(test)]
mod test_support;
#[cfg(test)]
mod tests;
mod titles;
mod unlock;
mod web;
mod wire;
mod xml;

pub use module::{server_module, MODULE};
pub use serve::routes;

pub const MODULE_ID: &str = "tv.kroma.import.plex";

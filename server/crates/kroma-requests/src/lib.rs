//! The core's request and monitoring workflows: what a viewer asked for, which
//! titles the server wants to hold, and how both stand against the library. Every
//! function takes [`kroma_module_host::HostStorage`] rather than the app state, so
//! the core and a module run the same code, each against its own host.
//!
//! Synchronous and does network and database work: call it from a blocking
//! context, never inline in an async handler.

pub(crate) use kroma_db as db;
pub(crate) use kroma_domain as model;

pub mod lifecycle;
pub mod monitoring;
pub mod request_ledger;
pub mod tmdb;

#[cfg(any(test, feature = "testing"))]
pub mod testing;

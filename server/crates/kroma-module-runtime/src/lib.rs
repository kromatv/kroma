//! The out-of-process module runtime: each module is its own binary. `main()`
//! calls [`serve`], which builds a [`RemoteHost`] ([`HostCtx`]) proxying
//! settings, events, sessions and jobs to the core over `/api/_host/*`.
//!
//! Databases are a CAPABILITY, not part of the runtime: only a module built with
//! the `storage` feature opens one, and it opens two -- its own file, and the
//! core database behind the grant its manifest declared. A module without the
//! feature does not link SQLite at all, which is most of the size of a sidecar
//! that never had a table.

mod egress;
mod env;
mod events;
mod host_ctx;
mod jobs;
mod migrations;
mod remote_host;
mod serve;

pub use remote_host::RemoteHost;
pub use serve::{serve, serve_one};

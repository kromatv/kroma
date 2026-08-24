//! SQLite persistence (rusqlite + r2d2 pool).
//!
//! The whole library lives in SQLite. A scan computes the full set of
//! libraries/shows/items and atomically swaps it in via [`replace_all`]. Read
//! queries run on `spawn_blocking` threads against a small connection pool.
//!
//! Performance: WAL journaling, `synchronous=NORMAL`, a 256 MiB mmap and a 16
//! MiB page cache are set on every pooled connection; reads never block the
//! single writer, and the indices below keep movie/show/episode lookups O(log n).
//!
//! This module is the directory root: the connection pool lives in [`pool`],
//! the shared row-mappers in [`rows`], the item hydration in [`hydrate`] and
//! the schema DDL plus `init`/`migrate` in [`schema`]. It re-exports those and
//! the per-domain query submodules below as a flat namespace so
//! `db::list_movies(...)` etc. resolve unchanged.

use anyhow::Result;
use rusqlite::{params, Connection, Row};

use kroma_domain::{MediaItem, Metadata, Permission, User};

mod accounts;
mod admin;
mod catalog_query;
mod chunked;
mod downloaded_subs;
mod downloads;
mod hydrate;
mod ingest;
mod jobs;
mod library;
mod markers;
mod media;
mod passkeys;
mod playback;
mod pool;
mod rows;
// Kept namespaced (`db::pipeline::…`) rather than glob-exported: its `counts`
// would clash with `media::counts`, and the call sites read clearer scoped.
pub mod audio_analysis;
mod curated;
pub mod notifications;
pub mod pipeline;
pub mod push_subs;
mod reports;
mod requests;
mod suggest;
mod taste;
// Namespaced (`db::translations::…` / `db::metadata_core::…`) rather than
// glob-exported: the generic language cache the whole app writes into, kept
// scoped so `put`/`resolve_*`/`get_core` read clearly at the call sites.
mod backup;
mod core_tables;
mod grant;
mod home;
pub mod localize;
pub mod metadata_core;
mod schema;
#[cfg(any(test, feature = "testing"))]
pub mod testing;
pub mod tmdb_pin;
pub mod translations;
mod vectors;

pub use accounts::*;
pub use admin::*;
pub use audio_analysis::*;
pub use backup::*;
pub use catalog_query::*;
pub(crate) use chunked::*;
pub use core_tables::is_core_table;
pub use curated::*;
pub use downloaded_subs::*;
pub use downloads::*;
pub use grant::{init_scoped, Grant};
pub use home::*;
pub(crate) use hydrate::*;
pub use ingest::*;
pub use jobs::*;
pub use library::*;
pub use markers::*;
pub use media::*;
pub use passkeys::*;
pub use playback::*;
pub use pool::{Pool, PoolInner, PooledConn};
pub use reports::*;
pub use requests::*;
pub(crate) use rows::*;
pub use schema::{apply_migrations, init, open};
pub(crate) use schema::{FILE_COLS, ITEM_COLS, PRAGMAS};
pub use suggest::*;
pub use taste::*;
pub use vectors::*;

pub(crate) fn now_or_blank() -> String {
    kroma_primitives::now_iso8601()
}

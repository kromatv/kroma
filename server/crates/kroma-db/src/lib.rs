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

mod pool;
mod rows;
mod chunked;
mod hydrate;
mod media;
mod catalog_query;
mod ingest;
mod markers;
mod downloaded_subs;
mod downloads;
mod accounts;
mod passkeys;
mod playback;
mod library;
mod admin;
mod jobs;
// Kept namespaced (`db::pipeline::…`) rather than glob-exported: its `counts`
// would clash with `media::counts`, and the call sites read clearer scoped.
pub mod audio_analysis;
pub mod pipeline;
mod requests;
mod reports;
pub mod notifications;
pub mod push_subs;
mod taste;
mod curated;
mod suggest;
// Namespaced (`db::translations::…` / `db::metadata_core::…`) rather than
// glob-exported: the generic language cache the whole app writes into, kept
// scoped so `put`/`resolve_*`/`get_core` read clearly at the call sites.
pub mod translations;
pub mod metadata_core;
pub mod tmdb_pin;
pub mod localize;
mod core_tables;
mod grant;
mod schema;
mod vectors;
mod home;
mod backup;
#[cfg(any(test, feature = "testing"))]
pub mod testing;

pub use pool::{Pool, PoolInner, PooledConn};
pub(crate) use rows::*;
pub(crate) use chunked::*;
pub(crate) use hydrate::*;
pub use media::*;
pub use catalog_query::*;
pub use ingest::*;
pub use markers::*;
pub use audio_analysis::*;
pub use downloaded_subs::*;
pub use downloads::*;
pub use vectors::*;
pub use home::*;
pub use accounts::*;
pub use passkeys::*;
pub use playback::*;
pub use library::*;
pub use admin::*;
pub use jobs::*;
pub use requests::*;
pub use reports::*;
pub use taste::*;
pub use curated::*;
pub use suggest::*;
pub use backup::*;
pub use core_tables::is_core_table;
pub use grant::{init_scoped, Grant};
pub use schema::{apply_migrations, init, open};
pub(crate) use schema::{FILE_COLS, ITEM_COLS, PRAGMAS};

pub(crate) fn now_or_blank() -> String {
    kroma_primitives::now_iso8601()
}

//! The Downloads module's persistence, split by who reads it.
//!
//! `download_clients` is this module's alone -- credentials included -- so it
//! lives in this module's OWN database, which is what [`MIGRATIONS`] creates.
//! The `downloads` ledger is shared: the core reads it for the live progress
//! overlay on request / discover lists, and `request_id` is a real foreign key
//! into `requests`. It is therefore part of the CORE schema, and this module
//! reaches it through the grant its `module.json` declares.
//!
//! This module doubles as a thin facade: it re-exports the core `kroma-db` surface
//! (catalog, requests, settings, tmdb hints) and the `indexers` rows that moved to
//! the Indexers module crate, so a single `crate::db::...` path resolves every
//! query the module makes.

// The core persistence surface (catalog, requests, settings, acq tmdb hints, ...)
// stays in kroma-db; re-exported so `crate::db::get_request` etc. keep resolving.
pub use kroma_module_sdk::db::*;
// The indexers table is owned by the indexer module; the queue view + acquisition
// reach it through kroma_module_sdk::ports::IndexerDbPort, not a re-export here.

mod clients;
mod downloads;
#[cfg(test)]
mod test_support;

pub use clients::*;
pub use downloads::*;

// `IF NOT EXISTS` DDL only, so it runs harmlessly on every boot. Applied to this
// module's OWN database (see `ServerModule::migrations`), which is why the
// passwords in it are not in the shared one.
pub const MIGRATIONS: &str = "
    -- Download clients (torrent engines). The embedded rqbit engine is seeded
    -- as a row (id='embedded', kind='rqbit') at boot when compiled in, so
    -- dispatch and the admin UI treat every engine uniformly; url/username/
    -- password apply to the external kinds only.
    CREATE TABLE IF NOT EXISTS download_clients (
        id         TEXT PRIMARY KEY,
        kind       TEXT NOT NULL,
        name       TEXT NOT NULL,
        url        TEXT NOT NULL DEFAULT '',
        username   TEXT NOT NULL DEFAULT '',
        password   TEXT NOT NULL DEFAULT '',
        enabled    INTEGER NOT NULL DEFAULT 1,
        priority   INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
    );
";

// The seeded embedded-engine row id (created at boot when compiled in).
pub const EMBEDDED_CLIENT_ID: &str = "embedded";

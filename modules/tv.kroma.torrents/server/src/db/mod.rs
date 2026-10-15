//! The Downloads module's persistence, split by who reads it.
//!
//! `download_clients` is this module's alone, credentials included, so it lives
//! in this module's OWN database, which is what [`MIGRATIONS`] creates.
//! The `downloads` ledger is shared: the core reads it for the live progress
//! overlay on request / discover lists, and `request_id` is a real foreign key
//! into `requests`. It is therefore part of the CORE schema, and this module
//! reaches it through the grant its `module.json` declares.

pub use kroma_module_sdk::db::*;

mod bandwidth;
mod clients;
mod downloads;
mod drops;
mod ephemeral;
mod settings;
mod starters;
#[cfg(test)]
pub(crate) mod test_support;

pub use bandwidth::*;
pub use clients::*;
pub use downloads::*;
pub use drops::*;
pub use ephemeral::*;
pub use settings::*;
pub use starters::*;

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

    CREATE TABLE IF NOT EXISTS vpn_bandwidth (
        at                  INTEGER NOT NULL,
        step_secs           INTEGER NOT NULL,
        sealed_down_bytes   INTEGER NOT NULL DEFAULT 0,
        sealed_up_bytes     INTEGER NOT NULL DEFAULT 0,
        unsealed_down_bytes INTEGER NOT NULL DEFAULT 0,
        unsealed_up_bytes   INTEGER NOT NULL DEFAULT 0,
        bypass_down_bytes   INTEGER NOT NULL DEFAULT 0,
        bypass_up_bytes     INTEGER NOT NULL DEFAULT 0,
        sealed_secs         INTEGER NOT NULL DEFAULT 0,
        unsealed_secs       INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (step_secs, at)
    );
    CREATE INDEX IF NOT EXISTS idx_vpn_bandwidth_at ON vpn_bandwidth(at);

    CREATE TABLE IF NOT EXISTS ephemeral_downloads (id TEXT PRIMARY KEY);

    CREATE TABLE IF NOT EXISTS watch_starters (
        download_id TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        PRIMARY KEY (download_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS deferred_drops (id TEXT PRIMARY KEY);

    CREATE TABLE IF NOT EXISTS module_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
";

pub const EMBEDDED_CLIENT_ID: &str = "embedded";

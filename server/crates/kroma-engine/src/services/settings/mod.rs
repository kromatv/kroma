//! Persisted, runtime-editable server settings.
//!
//! `Config` (see [`crate::config`]) provides the immutable bootstrap values
//! sourced from the environment (bind address, data dir, …). This module layers
//! a *mutable* key/value store on top, persisted in the `settings` SQLite table,
//! so the admin console can change server behaviour at runtime and have it
//! survive a restart.
//!
//! Values are stored as JSON (`serde_json::Value`) keyed by a stable string. A
//! small set of keys are **functional** the server reads them to change real
//! behaviour (LAN classification, server name, transcode limits, …). The rest
//! are persisted preferences the admin UI renders but the server does not (yet)
//! enforce; those are marked `applied: false` in the schema so the UI can be
//! honest about it.
//!
//! Split into the declared [`keys`] (defaults + who may reach each one), the
//! [`store`] (map + persistence), the typed functional [`accessors`] (+ library
//! defs), and the admin view-model [`schema`].

/// The dropdown value that means "no explicit choice": the fallback language
/// defers to the server's own default.
pub const TMDB_LANGUAGE_AUTO: &str = "Auto";

mod accessors;
mod email_delivery;
mod kept_libraries;
mod keys;
mod library_list;
mod llm;
mod schema;
mod sign_in;
mod store;
mod tmdb_language;

pub use accessors::*;
pub use email_delivery::*;
pub use kept_libraries::{
    held_libraries, refusal, unreadable_list_failure, unreadable_list_notice, HeldLibrary,
    LibraryNotice, Refusal,
};
pub use keys::reach_of_setting;
pub use library_list::{
    library_list, set_library_defs, stored_library_defs, UnreadableLibraryList,
};
pub use llm::*;
pub use schema::*;
pub use sign_in::*;
pub use store::*;
pub use tmdb_language::*;

/// The statistics feature's own settings keys and the identity behind them.
pub mod stats {
    pub use crate::services::stats::{
        ensure_identity, ENABLED_KEY, ID_KEY, SENT_KEY, STATISTICS_KEY, USAGE_KEY,
    };
}

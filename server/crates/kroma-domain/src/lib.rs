//! Core data model, split by domain noun. These modules are pure data types
//! (serde) with no I/O dependencies the persistence layer lives in `kroma-db`.
//!
//! Everything is also re-exported flat at the crate root below, so downstream
//! crates can write `kroma_domain::MediaItem` regardless of which noun-module a
//! type lives in (and the server's `crate::model` barrel re-exports this).

pub mod accounts;
pub mod admin;
pub mod cast;
pub mod crash;
pub mod jobs;
pub mod library;
pub mod matching;
pub mod media;
pub mod metadata;
pub mod naming;
pub mod notifications;
pub mod people;
pub mod pipeline;
pub mod playback;
pub mod push;
pub mod reports;
pub mod requests;
pub mod section;
pub mod slug;

// Flat re-export (mirrors the server's former `model.rs`). `naming`, `matching`,
// `people` and `slug` are intentionally not globbed here; reach them via their module path.
pub use accounts::*;
pub use admin::*;
pub use cast::*;
pub use crash::*;
pub use jobs::*;
pub use library::*;
pub use media::*;
pub use metadata::*;
pub use notifications::*;
pub use pipeline::*;
pub use playback::*;
pub use push::*;
pub use reports::*;
pub use requests::*;
pub use section::*;

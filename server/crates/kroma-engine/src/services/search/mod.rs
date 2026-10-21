//! Keyword/typo-tolerant search over the catalogue: a tantivy index in a
//! `RamDirectory`, rebuilt from SQLite on every library change. A rebuild
//! constructs a new index and swaps it in, so searches never see a half-built
//! one. The semantic "more like this" recommender lives in [`crate::db`].

mod document;
mod engine;
mod hit;
mod index;
mod query;
mod schema;

pub use engine::{spawn_reindex, SearchEngine};
pub use hit::{Hit, HitKind};

#[cfg(test)]
mod tests;

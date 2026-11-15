//! Keyword/typo-tolerant search over the catalogue: a tantivy index in a
//! `RamDirectory`, rebuilt from SQLite on every library change. A rebuild
//! constructs a new index and swaps it in, so searches never see a half-built
//! one. The semantic "more like this" recommender lives in [`crate::db`].

mod document;
mod engine;
mod entry;
mod hit;
mod index;
mod lexicon;
mod parse;
mod people;
mod query;
mod rerank;
mod run;
mod schema;

pub use engine::{spawn_reindex, Answer, Asker, SearchEngine};
pub use hit::{Hit, HitKind};
pub use people::PersonHit;

#[cfg(test)]
pub(crate) mod tests;
#[cfg(test)]
mod understanding_tests;

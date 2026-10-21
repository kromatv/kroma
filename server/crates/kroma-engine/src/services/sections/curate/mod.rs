//! Editorial **curated collections** catalog-wide rows shown to everyone
//! ("Spielberg", "Best Horror", "Top IMDb", franchises, decades, moods). Two
//! producers, both emitting [`CuratedRow`]:
//!  * [`director_collections`] **deterministic**: group titles by their crew
//!    director (accurate, no model needed), and
//!  * the **LLM** path ([`build_curate_prompt`] → [`parse_curate`] →
//!    [`resolve_members`]) the model curates from the library titles we hand
//!    it; members are matched back to real ids, so nothing it invents surfaces.
//!
//! Pure + tested; the orchestration (load catalog, call the model, persist) is
//! the `sections.curate` job in [`crate::services::jobs`].

mod catalog;
mod prompt;
mod resolve;

#[cfg(test)]
mod fixtures;

pub use catalog::{build_catalog, director_collections, prune_for_prompt, CatalogEntry, MIN_ITEMS};
pub use prompt::{build_curate_prompt, tool_curate_prompt};
pub use resolve::{parse_curate, resolve_members, resolve_members_by_id, CuratedSpec};

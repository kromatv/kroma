//! Background TMDB enrichment: resolve poster / backdrop / overview / IDs for
//! every movie and show after a scan and write them into the DB, on a small
//! pool of threads so a large library never blocks startup or `/api/scan`.

mod engine;
mod episodes;
mod jobs;
mod lang;
mod process;
mod run;

pub use run::{enrich_one, maybe_spawn, run_tracked, EnrichSummary};

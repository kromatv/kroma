//! The home-screen section generator: the viewer's taste, the catalogue and
//! the moment (date, daypart) into an ordered, de-duplicated list of
//! [`Section`]s. The client renders the result generically, so all the "what
//! rows, in what order" logic lives here.

mod board;
mod cache;
mod context;
pub mod curate;
pub mod featured;
pub mod generate;
mod language_name;
mod localized;
mod math;
mod memo;
mod page;
mod rows;
mod shelves;
pub mod taste;
mod themed;
mod themes;
pub mod world;

pub use cache::VectorCache;
pub use memo::{hero, home, HomeMemo};
pub use page::{adapt, Accepts};

use crate::db::{self, Pool};
use crate::i18n;
use crate::model::Section;
use crate::services::reco::Viewer;
use crate::state::SharedState;

use crate::services::settings;
use board::Board;
use context::Context;

/// Build the ordered, de-duplicated home for one user. Infallible: any step that
/// fails (or comes up thin) simply contributes no section.
pub fn build_home(state: &SharedState, pool: &Pool, locale: &str, user_id: &str) -> Vec<Section> {
    let _ = state.vectors.refresh_if_stale(pool);
    let ctx = Context::build(pool, user_id, settings::played_percent(&state.settings));
    let catalog = state.home.catalog.get(state, pool);
    let now = crate::services::jobs::now_ms().div_euclid(1000);
    let viewer = Viewer::read(state, pool, &catalog, user_id, now);
    let board = Board::new(state, pool, locale, &catalog, &viewer, &ctx);
    page::compose(&board, state.settings.get_bool("showRecentHome", true))
}

// Logs before falling back to empty: swallowing the error made a broken query
// indistinguishable from "nobody watched anything", and a missing SQLite `POW()`
// silently emptied the Trending row on every request.
fn trending_ids(pool: &Pool, n: usize) -> Vec<String> {
    db::trending_ids(pool, n).unwrap_or_else(|e| {
        tracing::warn!(target: "sections", error = %e, "trending query failed; falling back to no trending items");
        Vec::new()
    })
}

fn curated_rows(
    pool: &Pool,
    locale: &str,
    max: usize,
) -> Vec<(String, String, Option<String>, Vec<String>)> {
    let all = db::get_curated(pool).unwrap_or_default();
    if all.is_empty() {
        return Vec::new();
    }
    // Rotate the window once per day (no per-request RNG → stable within a day).
    let day = (crate::services::jobs::now_ms() / 86_400_000) as usize;
    let offset = day % all.len();
    let n = max.min(all.len());
    (0..n)
        .map(|i| {
            let row = &all[(offset + i) % all.len()];
            let title = i18n::pick(&row.titles, locale).unwrap_or(&row.key).clone();
            let reason = i18n::pick(&row.reasons, locale).cloned();
            (row.key.clone(), title, reason, row.item_ids.clone())
        })
        .collect()
}

#[cfg(test)]
mod fixtures;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod trending_tests;

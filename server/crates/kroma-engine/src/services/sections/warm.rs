//! The first home after a start, built before anyone asks for it. Everything a
//! home reads is cold then (the embedder's model, the title vectors, the
//! catalogue, the pages SQLite reads), and the first viewer paid for all of it.

use tokio::task::JoinHandle;

use crate::db;
use crate::i18n;
use crate::state::SharedState;

/// Build the home of the viewer seen last, in the background, so what every
/// home reads is warm by the time someone opens one. Call it once the installed
/// modules are up: the embedder loads its model on the first call it answers.
/// Returns the build it started.
pub fn warm_up(state: SharedState) -> JoinHandle<()> {
    tokio::task::spawn_blocking(move || kroma_perf::job("sections.warm_up", || warm(&state)))
}

fn warm(state: &SharedState) {
    let (user_id, language) = match db::last_viewer(&state.db) {
        Ok(Some(viewer)) => viewer,
        Ok(None) => return,
        Err(e) => {
            tracing::warn!(target: "sections", "the viewer seen last could not be read: {e:#}");
            return;
        }
    };
    let locale = i18n::detect_locale(language.as_deref(), None);
    super::home(state, &state.db, locale, &user_id);
}

#[cfg(test)]
mod tests;

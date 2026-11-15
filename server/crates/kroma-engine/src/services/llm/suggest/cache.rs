//! The cached suggestions of a title: whether a row answers a reader, and what
//! a generation leaves in it.

use std::collections::HashMap;

use anyhow::Result;

use crate::db::{self, SuggestionRow};
use crate::state::SharedState;

use super::suggest_for;

/// Whether `row` was generated for `content_locale`, answered in it or not. A
/// row that was not is a miss once: [`regenerate`] records every locale it
/// asks for, so the same reader is never the reason for a second run.
pub fn covers(row: &SuggestionRow, content_locale: &str) -> bool {
    row.asked_locales
        .iter()
        .any(|asked| asked == content_locale)
}

/// Generates the suggestions of `seed_id` and caches them as asked for
/// `locales`. A generation that comes back with nothing leaves a cached row
/// that still has members as it is and only adds `locales` to its record, so
/// its readers keep the text they had. `Err` is a hard failure, of the model
/// or of the write, and leaves the cache untouched for a later retry.
pub fn regenerate(
    state: &SharedState,
    seed_id: &str,
    max_tokens: u32,
    locales: &[&str],
) -> Result<()> {
    let pool = &state.db;
    match suggest_for(state, seed_id, max_tokens)? {
        Some(found) => db::set_suggestion(pool, seed_id, &found.ids, &found.reasons, locales),
        None if has_members(state, seed_id)? => db::mark_suggestion_asked(pool, seed_id, locales),
        None => db::set_suggestion(pool, seed_id, &[], &HashMap::new(), locales),
    }
}

fn has_members(state: &SharedState, seed_id: &str) -> Result<bool> {
    let cached = db::get_suggestion(&state.db, seed_id)?;
    Ok(cached.is_some_and(|row| !row.item_ids.is_empty()))
}

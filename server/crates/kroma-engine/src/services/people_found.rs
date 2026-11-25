//! Who TMDB says each person written for a title is, when the provider gave
//! nobody of that name for it (LIB-99): their page and their portrait, asked
//! in the background once for each name, the way Jellyfin finds a person.

use std::path::Path;

use anyhow::Result;

use crate::db::people_found::{self, Found};
use crate::infra::image;
use crate::infra::metadata::person_search::{self, Person};
use crate::services::jobs::JobKey;
use crate::state::SharedState;

/// The job that asks TMDB about the people written since it last ran.
pub const JOB: JobKey = JobKey("people.match");

const ASK_AGAIN_AFTER_MS: i64 = 30 * 24 * 60 * 60 * 1000;

/// Ask TMDB in the background about the people written for titles, when a key
/// lets the server ask.
pub fn ask(state: &SharedState) {
    if state.config.tmdb_api_key.is_some() {
        let _ = state.jobs.trigger_after(state.clone(), JOB, "edit");
    }
}

/// What one pass did: how many names it asked about, and how many TMDB knew.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Pass {
    pub asked: usize,
    pub found: usize,
}

/// Ask TMDB about every name written for a title that it was not asked about,
/// or knew nobody under a month ago, until `cancelled`. Stops at the first
/// name TMDB could not be asked about, keeping what it found before.
pub fn match_written(state: &SharedState, cancelled: &dyn Fn() -> bool) -> Result<Pass> {
    let Some(api_key) = state.config.tmdb_api_key.as_deref() else {
        return Ok(Pass::default());
    };
    let asked_before = kroma_primitives::now_ms() - ASK_AGAIN_AFTER_MS;
    let mut pass = Pass::default();
    for name in people_found::unsearched(&state.db, asked_before)? {
        if cancelled() {
            break;
        }
        let found = person_search::named(api_key, &name)?
            .map(|person| portrait_kept(&state.config.data_dir, person))
            .unwrap_or_default();
        people_found::keep(&state.db, &name, &found)?;
        pass.asked += 1;
        pass.found += usize::from(found.tmdb_id.is_some());
    }
    Ok(pass)
}

fn portrait_kept(data_dir: &Path, person: Person) -> Found {
    let cached = person
        .profile_url
        .as_deref()
        .map(|url| image::cache_remote(data_dir, url).unwrap_or_else(|| url.to_string()));
    Found {
        tmdb_id: Some(person.tmdb_id),
        profile_url: cached,
        profile_source: person.profile_url,
    }
}

#[cfg(test)]
mod tests;

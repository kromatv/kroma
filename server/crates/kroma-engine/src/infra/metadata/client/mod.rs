//! TMDB HTTP client: search for the best match, fetch its details + external
//! IDs / credits / images through [`kroma_http::Fetch`], and map the JSON into
//! a [`Metadata`].

mod certification;
mod details;
mod details_json;
mod lookup;
mod seasons;

pub use lookup::{lookup, lookup_all, lookup_all_by_id};
pub use seasons::{season_episodes, season_episodes_multi, EpisodeArt, SeasonData};

use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};

use kroma_http::Fetch;
use serde::de::DeserializeOwned;
use tracing::{debug, warn};

const REQUEST_MAX_TIME_SECS: u32 = 10;

pub(super) const API: &str = "https://api.themoviedb.org/3";

/// A function, not a bare const, so tests can override it via `#[cfg(test)]`.
pub(super) fn api() -> String {
    #[cfg(test)]
    if let Some(base) = test_override::get() {
        return base;
    }
    API.to_string()
}

/// Test-only TMDB base override. Thread-local, so tests running in parallel
/// cannot see each other's fake server.
#[cfg(test)]
pub(crate) mod test_override {
    use std::cell::RefCell;

    thread_local! {
        static BASE: RefCell<Option<String>> = const { RefCell::new(None) };
    }

    static SHARED: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

    pub(crate) fn get() -> Option<String> {
        BASE.with(|b| b.borrow().clone()).or_else(|| {
            SHARED
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .clone()
        })
    }

    pub(crate) fn set_shared(base: Option<&str>) {
        *SHARED
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = base.map(str::to_string);
    }

    pub(crate) fn set(base: &str) {
        BASE.with(|b| *b.borrow_mut() = Some(base.to_string()));
    }

    pub(crate) fn clear() {
        BASE.with(|b| *b.borrow_mut() = None);
    }
}

pub(super) const IMG: &str = "https://image.tmdb.org/t/p";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Target {
    Movie,
    Tv,
}

impl Target {
    pub(super) fn search_path(self) -> &'static str {
        match self {
            Target::Movie => "search/movie",
            Target::Tv => "search/tv",
        }
    }
    fn detail_path(self) -> &'static str {
        match self {
            Target::Movie => "movie",
            Target::Tv => "tv",
        }
    }
    /// TMDB uses a different year query param for movies vs. shows.
    /// `primary_release_year` is the precise movie filter Seerr/Overseerr use.
    pub(super) fn year_param(self) -> &'static str {
        match self {
            Target::Movie => "primary_release_year",
            Target::Tv => "first_air_date_year",
        }
    }
    fn web_kind(self) -> &'static str {
        self.detail_path()
    }
    fn certification_append(self) -> &'static str {
        match self {
            Target::Movie => "release_dates",
            Target::Tv => "content_ratings",
        }
    }
}

const MAX_CAST: usize = 12;
const MAX_CREW: usize = 8;

// TMDB returns keywords unordered; this bounds how much feeds the embedding doc.
const MAX_KEYWORDS: usize = 20;

pub fn curl_available() -> bool {
    Command::new("curl")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

// First TMDB failure logs at WARN (so a bad `KROMA_TMDB_API_KEY` or dead
// network is visible); later ones drop to DEBUG to avoid spamming a bulk
// enrichment pass.
static FAILURE_WARNED: AtomicBool = AtomicBool::new(false);

fn note_failure(reason: &str, detail: &str) {
    let detail = detail.trim();
    if FAILURE_WARNED.swap(true, Ordering::Relaxed) {
        debug!(reason, detail, "TMDB request failed");
    } else {
        warn!(
            reason,
            detail,
            "TMDB enrichment request failed check KROMA_TMDB_API_KEY and network connectivity; \
             further failures are logged at debug level"
        );
    }
}

/// GET `url` with URL-encoded query params, parsed as JSON `T`. `Err(())` on
/// any transport/HTTP-status/parse failure so the caller never caches a
/// transient failure as a permanent miss.
pub(super) fn tmdb_json<T: DeserializeOwned>(
    url: &str,
    api_key: &str,
    params: &[(&str, String)],
) -> Result<T, ()> {
    let mut request = Fetch::new()
        .purpose("metadata")
        .max_time(REQUEST_MAX_TIME_SECS);
    request = if is_bearer_token(api_key) {
        request.header("Authorization", format!("Bearer {api_key}"))
    } else {
        request.query("api_key", api_key)
    };
    for (name, value) in params {
        request = request.query(name, value.as_str());
    }
    let response = request
        .get(url)
        .map_err(|e| note_failure("transport", &format!("{e:#}")))?
        .ensure_ok()
        .map_err(|e| note_failure("http_status", &e.to_string()))?;
    response
        .json()
        .map_err(|e| note_failure("parse", &e.to_string()))
}

// A TMDB v4 read token is a JWT (`header.payload.signature`); v3 keys are
// 32-char hex with no dots.
fn is_bearer_token(key: &str) -> bool {
    key.split('.').count() == 3
}

#[cfg(test)]
mod tests;

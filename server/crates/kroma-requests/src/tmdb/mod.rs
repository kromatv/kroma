//! TMDB, as the request flow reads it, through [`kroma_http::Fetch`]: the one
//! request every lookup makes, and the detail and season shapes built on it.

pub mod common;
pub mod discover;
mod seasons;

pub use seasons::{season_episodes, season_episodes_multi, EpisodeArt, SeasonData};

use std::sync::atomic::{AtomicBool, Ordering};

use kroma_http::Fetch;
use serde::de::DeserializeOwned;
use tracing::{debug, warn};

const REQUEST_MAX_TIME_SECS: u32 = 10;

const API: &str = "https://api.themoviedb.org/3";

/// The `net.connect` purpose every lookup here leaves under, which a module
/// running them declares for `api.themoviedb.org`.
pub const PURPOSE: &str = "metadata";

/// Where TMDB's images are served from.
pub const IMG: &str = "https://image.tmdb.org/t/p";

/// The API base every lookup is built on.
pub fn api() -> String {
    #[cfg(any(test, feature = "testing"))]
    if let Some(base) = test_override::get() {
        return base;
    }
    API.to_string()
}

/// Test-only TMDB base override. Thread-local, so tests running in parallel
/// cannot see each other's fake server.
#[cfg(any(test, feature = "testing"))]
pub mod test_override {
    use std::cell::RefCell;

    thread_local! {
        static BASE: RefCell<Option<String>> = const { RefCell::new(None) };
    }

    static SHARED: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

    /// The base in force on this thread, its own before the shared one.
    pub fn get() -> Option<String> {
        BASE.with(|b| b.borrow().clone()).or_else(|| {
            SHARED
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .clone()
        })
    }

    /// Point every thread at `base`, or at nothing.
    pub fn set_shared(base: Option<&str>) {
        *SHARED
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = base.map(str::to_string);
    }

    /// Point this thread at `base`.
    pub fn set(base: &str) {
        BASE.with(|b| *b.borrow_mut() = Some(base.to_string()));
    }

    /// Forget this thread's base.
    pub fn clear() {
        BASE.with(|b| *b.borrow_mut() = None);
    }
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

/// GET `url` with `params` as the query, parsed as JSON `T`. `Err(())` on any
/// failure, so a transient one is never cached as a miss.
#[allow(clippy::result_unit_err)]
pub fn tmdb_json<T: DeserializeOwned>(
    purpose: &'static str,
    url: &str,
    api_key: &str,
    params: &[(&str, String)],
) -> Result<T, ()> {
    let mut request = Fetch::new()
        .purpose(purpose)
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

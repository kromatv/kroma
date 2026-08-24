//! TMDB HTTP client: search for the best match, fetch its details + external
//! IDs / credits / images via `curl`, and map the JSON into a [`Metadata`].

mod details;
mod lookup;
mod seasons;

pub use lookup::{lookup, lookup_all, lookup_all_by_id};
pub use seasons::{season_episodes, season_episodes_multi, EpisodeArt, SeasonData};

use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Deserialize;
use tracing::{debug, warn};

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

    pub(crate) fn get() -> Option<String> {
        BASE.with(|b| b.borrow().clone())
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

fn note_curl_failure(reason: &str, detail: &str) {
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

/// GET `url` with URL-encoded query params via `curl`, parsed as JSON `T`.
/// `Err(())` on any transport/HTTP-status/parse failure so the caller never
/// caches a transient failure as a permanent miss. `-S` keeps curl's error
/// message on stderr even under `-s`; curl exit 22 = HTTP >= 400 (e.g. 401 bad
/// key), 28 = timeout, 6/7 = DNS/connect.
pub(super) fn curl_json<T: for<'de> Deserialize<'de>>(
    url: &str,
    api_key: &str,
    params: &[(&str, String)],
) -> Result<T, ()> {
    let mut cmd = Command::new("curl");
    cmd.args(["-s", "-S", "-f", "-G", "--max-time", "10"]);
    // TMDB accepts a v3 key as the `api_key` query param, or a v4 read token
    // (a JWT: header.payload.signature) as a Bearer header. Pick by shape.
    if is_bearer_token(api_key) {
        cmd.arg("-H")
            .arg(format!("Authorization: Bearer {api_key}"));
    } else {
        cmd.arg("--data-urlencode")
            .arg(format!("api_key={api_key}"));
    }
    for (k, v) in params {
        cmd.arg("--data-urlencode").arg(format!("{k}={v}"));
    }
    cmd.arg("--").arg(url);
    let out = match cmd.output() {
        Ok(out) => out,
        Err(e) => {
            note_curl_failure("spawn", &e.to_string());
            return Err(());
        }
    };
    if !out.status.success() {
        let code = out.status.code().unwrap_or(-1);
        note_curl_failure(
            &format!("curl_exit_{code}"),
            &String::from_utf8_lossy(&out.stderr),
        );
        return Err(());
    }
    serde_json::from_slice(&out.stdout).map_err(|e| {
        note_curl_failure("parse", &e.to_string());
    })
}

// A TMDB v4 read token is a JWT (`header.payload.signature`); v3 keys are
// 32-char hex with no dots.
fn is_bearer_token(key: &str) -> bool {
    key.split('.').count() == 3
}

//! The `watch` method of the `acquisition` point: find a film or an episode on
//! the indexers and start it on the embedded engine, so a viewer plays it while
//! it downloads.

mod contents;
mod locks;
mod release;
#[cfg(test)]
mod test_support;

pub use locks::WatchLocks;

use std::time::{Duration, Instant};

use anyhow::{bail, Result};
use kroma_module_sdk::host::HostStorage;
use serde::{Deserialize, Serialize};

use crate::peers::downloads::{self, DownloadRow, GrabSpec};
use crate::search::{CachedRelease, SearchTarget};

use contents::Watchable;

const EMBEDDED_CLIENT: &str = "embedded";

// Inside the core's 30 s loopback, with the margin a reply needs to get back.
const WATCH_BUDGET: Duration = Duration::from_secs(25);

// A watch request carries no season length, so a pack is budgeted for a
// middling season rather than rejected on size.
const ASSUMED_SEASON_LENGTH: u32 = 24;

/// What a viewer asked to watch: a `movie`, or one `episode` of a `season` of a
/// `show`. Another kind, or a show without both numbers, answers an error.
#[derive(Debug, Deserialize)]
pub struct WatchRequest {
    pub tmdb_id: u64,
    pub kind: String,
    pub title: String,
    pub year: Option<u32>,
    pub season: Option<u32>,
    pub episode: Option<u32>,
}

impl WatchRequest {
    fn episode(&self) -> Result<Option<(u32, u32)>> {
        match (self.kind.as_str(), self.season.zip(self.episode)) {
            ("movie", _) => Ok(None),
            ("show", Some(episode)) => Ok(Some(episode)),
            ("show", None) => bail!("a season and an episode are needed to watch a show"),
            _ => bail!("only a film or an episode can be watched while it downloads"),
        }
    }

    fn targets(&self, episode: Option<(u32, u32)>) -> Vec<SearchTarget> {
        let (tmdb_id, title) = (self.tmdb_id, self.title.clone());
        let Some((season, episode)) = episode else {
            return vec![SearchTarget::movie(tmdb_id, None, title, self.year)];
        };
        vec![
            SearchTarget::episode(tmdb_id, title.clone(), season, episode),
            SearchTarget::season(tmdb_id, title, season, ASSUMED_SEASON_LENGTH, None),
        ]
    }
}

#[derive(Debug, Serialize)]
pub struct WatchReply {
    pub download_id: String,
    pub release: String,
    pub reused: bool,
}

impl From<Watchable> for WatchReply {
    fn from(started: Watchable) -> Self {
        let (row, reused) = match started {
            Watchable::Grabbed(row) => (row, false),
            Watchable::Reused(row) => (row, true),
        };
        WatchReply {
            download_id: row.id,
            release: row.release_title,
            reused,
        }
    }
}

/// Start `request` on the embedded engine, or hand back the download of it the
/// engine already holds, a season pack included. Two starts of one title
/// converge on one download: the second waits for the first and reuses its row.
/// Blocking.
pub fn watch<S: HostStorage + Clone>(
    host: &S,
    locks: &WatchLocks,
    request: &WatchRequest,
) -> Result<WatchReply> {
    let deadline = Instant::now() + WATCH_BUDGET;
    let episode = request.episode()?;
    let _lock = locks.hold(request, episode);
    let started = match live_download(host, request)? {
        Some(row) => Watchable::Reused(row),
        None => {
            let ranked = release::rank(host, request.tmdb_id, &request.targets(episode))?;
            contents::start_watchable(host, request, &ranked, deadline)?
        }
    };
    Ok(started.into())
}

fn live_download<S: HostStorage>(host: &S, request: &WatchRequest) -> Result<Option<DownloadRow>> {
    downloads::live_for_title(
        host,
        &request.kind,
        request.tmdb_id,
        EMBEDDED_CLIENT,
        request.episode()?,
    )
}

fn grab_spec<S: HostStorage>(
    host: &S,
    release: &CachedRelease,
    request: &WatchRequest,
) -> Result<GrabSpec> {
    let preferred = release
        .torrent_url
        .as_deref()
        .unwrap_or(&release.magnet_or_url);
    let link = crate::search::resolve_grab_target(host, &release.view, preferred)?;
    if link.is_empty() {
        bail!("release has no magnet or download link");
    }
    let spec = crate::search::grab_spec_from_release(
        &release.view,
        &link,
        request.tmdb_id,
        Some(request.title.clone()),
        request.year,
        None,
        Vec::new(),
        false,
    );
    Ok(GrabSpec {
        client_id: Some(EMBEDDED_CLIENT.into()),
        ephemeral: true,
        ..spec
    })
}

#[cfg(test)]
mod tests;

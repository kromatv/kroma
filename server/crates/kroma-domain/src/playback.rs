//! Playback types: a saved position, a "continue watching" entry, the rule
//! that turns a position into "watched", and the file of a watch download a
//! player names in place of a catalogue item.

use serde::{Deserialize, Serialize};

use crate::media::MediaItem;

/// The played threshold applied when a title carries no credits marker, as a
/// percentage of its runtime. Plex, Jellyfin and Kodi all default to 90.
pub const DEFAULT_PLAYED_PERCENT: i64 = 90;

/// Whether `position_ms` finished a title: its credits have started, or the
/// played threshold of its runtime is crossed. Without a duration only the
/// credits marker can answer.
pub fn finished(
    position_ms: i64,
    duration_ms: Option<i64>,
    credits_start_ms: Option<i64>,
    played_percent: i64,
) -> bool {
    if credits_start_ms.is_some_and(|c| position_ms >= c) {
        return true;
    }
    match duration_ms {
        Some(d) if d > 0 => position_ms * 100 >= d * played_percent,
        _ => false,
    }
}

/// One file of a download played while it arrives, named the way the
/// `watchable` capability names it: the mount that answers, the download there
/// and the file's index in it. The rest is what the player shows about it. The
/// core holds and hands this on without reading it, because it cannot know the
/// module behind the mount.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WatchItem {
    pub mount: String,
    pub id: String,
    pub file: u32,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub poster: Option<String>,
    #[serde(rename = "tmdbId", default, skip_serializing_if = "Option::is_none")]
    pub tmdb_id: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub season: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub episode: Option<u32>,
}

impl WatchItem {
    pub fn is_episode(&self) -> bool {
        self.season.is_some() && self.episode.is_some()
    }
}

/// One row of a user's playback progress.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressEntry {
    #[serde(rename = "itemId")]
    pub item_id: String,
    #[serde(rename = "positionMs")]
    pub position_ms: i64,
    #[serde(rename = "durationMs")]
    pub duration_ms: Option<i64>,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

/// A "continue watching" entry: the resumable item plus where to resume from.
#[derive(Debug, Clone, Serialize)]
pub struct ContinueItem {
    pub item: MediaItem,
    #[serde(rename = "positionMs")]
    pub position_ms: i64,
    #[serde(rename = "durationMs")]
    pub duration_ms: Option<i64>,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

/// The episode to play to continue a show (`GET /api/shows/:id/up-next`): the
/// episode plus whether it has a saved resume position (drives the "Reprendre"
/// vs "Lecture" button label).
#[derive(Debug, Clone, Serialize)]
pub struct UpNext {
    pub item: MediaItem,
    pub resume: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    const TWO_HOURS: i64 = 7_200_000;

    #[test]
    fn crossing_the_played_threshold_finishes_a_title_without_a_marker() {
        assert!(finished(6_480_000, Some(TWO_HOURS), None, 90));
        assert!(!finished(6_479_999, Some(TWO_HOURS), None, 90));
    }

    #[test]
    fn reaching_the_credits_finishes_a_title_below_the_threshold() {
        let credits = Some(6_000_000);

        assert!(finished(6_000_000, Some(TWO_HOURS), credits, 90));
        assert!(!finished(5_999_999, Some(TWO_HOURS), credits, 90));
    }

    #[test]
    fn the_threshold_still_applies_when_the_credits_marker_sits_later() {
        assert!(finished(6_500_000, Some(TWO_HOURS), Some(7_000_000), 90));
    }

    #[test]
    fn an_unknown_duration_leaves_only_the_marker_to_answer() {
        assert!(!finished(6_500_000, None, None, 90));
        assert!(!finished(6_500_000, Some(0), None, 90));
        assert!(finished(6_500_000, None, Some(6_000_000), 90));
    }
}

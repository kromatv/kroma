//! Torrent content classification from its file list: tell a movie from an
//! episode, a season pack or a multi-season series, and map each video file to
//! its season/episode so the caller can offer per-file selection.

use serde::{Deserialize, Serialize};

use crate::parse_release_name;

const VIDEO_EXTS: &[&str] = &["mkv", "mp4", "m4v", "mov", "webm", "avi", "ts", "m2ts", "wmv", "flv"];

/// What a torrent holds, overall. `Unknown` means the admin picks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ContentKind {
    Movie,
    Episode,
    Season,
    Series,
    Unknown,
}

impl ContentKind {
    pub fn as_str(self) -> &'static str {
        match self {
            ContentKind::Movie => "movie",
            ContentKind::Episode => "episode",
            ContentKind::Season => "season",
            ContentKind::Series => "series",
            ContentKind::Unknown => "unknown",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ContentFile {
    pub index: usize,
    pub path: String,
    pub size_bytes: u64,
    pub is_video: bool,
    pub season: Option<u32>,
    pub episode: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TorrentContent {
    pub kind: ContentKind,
    pub seasons: Vec<u32>,
    pub files: Vec<ContentFile>,
}

fn is_video(path: &str) -> bool {
    let ext = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    VIDEO_EXTS.contains(&ext.as_str())
}

fn base_name(path: &str) -> &str {
    path.rsplit(['/', '\\']).next().unwrap_or(path)
}

/// Classify a torrent from its `(path, size)` file list.
pub fn classify(files: &[(String, u64)]) -> TorrentContent {
    let mut content_files = Vec::with_capacity(files.len());
    for (index, (path, size)) in files.iter().enumerate() {
        let video = is_video(path);
        let (mut season, mut episode) = (None, None);
        if video {
            let parsed = parse_release_name(base_name(path));
            season = parsed.season;
            episode = parsed.episode;
        }
        content_files.push(ContentFile {
            index,
            path: path.clone(),
            size_bytes: *size,
            is_video: video,
            season,
            episode,
        });
    }

    let episode_files: Vec<&ContentFile> =
        content_files.iter().filter(|f| f.is_video && f.episode.is_some()).collect();
    let mut seasons: Vec<u32> = episode_files.iter().filter_map(|f| f.season).collect();
    seasons.sort_unstable();
    seasons.dedup();

    let video_count = content_files.iter().filter(|f| f.is_video).count();

    let kind = if episode_files.is_empty() {
        if video_count >= 1 {
            ContentKind::Movie
        } else {
            ContentKind::Unknown
        }
    } else if seasons.len() > 1 {
        ContentKind::Series
    } else if episode_files.len() > 1 {
        ContentKind::Season
    } else {
        ContentKind::Episode
    };

    TorrentContent { kind, seasons, files: content_files }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn f(paths: &[&str]) -> Vec<(String, u64)> {
        paths.iter().map(|p| (p.to_string(), 1_000_000)).collect()
    }

    #[test]
    fn detects_a_movie() {
        let c = classify(&f(&["The.Matrix.1999.1080p.BluRay.x265-GRP.mkv", "sample.mkv", "readme.txt"]));
        assert_eq!(c.kind, ContentKind::Movie);
        assert!(c.seasons.is_empty());
        assert_eq!(c.files.iter().filter(|f| f.is_video).count(), 2);
        assert!(!c.files.iter().find(|f| f.path == "readme.txt").unwrap().is_video);
    }

    #[test]
    fn detects_a_single_episode() {
        let c = classify(&f(&["Show.S02E05.1080p.WEB.x265.mkv"]));
        assert_eq!(c.kind, ContentKind::Episode);
        assert_eq!(c.seasons, vec![2]);
        let ep = &c.files[0];
        assert_eq!((ep.season, ep.episode), (Some(2), Some(5)));
    }

    #[test]
    fn detects_a_season_pack() {
        let c = classify(&f(&[
            "Breaking.Bad.S01/Breaking.Bad.S01E01.1080p.mkv",
            "Breaking.Bad.S01/Breaking.Bad.S01E02.1080p.mkv",
            "Breaking.Bad.S01/Breaking.Bad.S01E03.1080p.mkv",
        ]));
        assert_eq!(c.kind, ContentKind::Season);
        assert_eq!(c.seasons, vec![1]);
        assert_eq!(c.files.iter().filter(|f| f.episode.is_some()).count(), 3);
        assert_eq!(c.files[1].index, 1);
        assert_eq!(c.files[1].episode, Some(2));
    }

    #[test]
    fn detects_a_multi_season_series() {
        let c = classify(&f(&[
            "Show/Season 1/Show.S01E01.mkv",
            "Show/Season 1/Show.S01E02.mkv",
            "Show/Season 2/Show.S02E01.mkv",
        ]));
        assert_eq!(c.kind, ContentKind::Series);
        assert_eq!(c.seasons, vec![1, 2]);
    }

    #[test]
    fn no_video_is_unknown() {
        let c = classify(&f(&["readme.nfo", "cover.jpg"]));
        assert_eq!(c.kind, ContentKind::Unknown);
    }
}

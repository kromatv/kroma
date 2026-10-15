//! The text subtitle files sitting beside a video inside the same torrent.

use std::path::{Path, PathBuf};

use kroma_module_sdk::media::external_subtitles::{self, ExternalSubtitle};

use super::DownloadManager;

pub(crate) struct TorrentSubtitle {
    pub(crate) file_index: usize,
    pub(crate) found: ExternalSubtitle,
    pub(crate) arrived: bool,
}

impl DownloadManager {
    /// The text subtitle files beside `file` in the same torrent, in the order
    /// they are offered in.
    ///
    /// Reading names and piece bitfields is all this costs: nothing is asked of
    /// the swarm, and a torrent whose metadata has not arrived has none of them
    /// yet.
    pub(crate) fn subtitles_beside(&self, id: &str, file: usize) -> Vec<TorrentSubtitle> {
        let Ok(entries) = self.resolved_files(id) else {
            return Vec::new();
        };
        let Some(video) = entries.iter().find(|entry| entry.index == file) else {
            return Vec::new();
        };
        let paths: Vec<PathBuf> = entries
            .iter()
            .map(|entry| PathBuf::from(&entry.path))
            .collect();
        external_subtitles::beside(Path::new(&video.path), &paths)
            .into_iter()
            .filter_map(|found| {
                let at = entries
                    .iter()
                    .find(|entry| Path::new(&entry.path) == found.path)?
                    .index;
                Some(TorrentSubtitle {
                    arrived: self.file_layout(id, at).is_ok_and(|layout| layout.whole()),
                    file_index: at,
                    found,
                })
            })
            .collect()
    }

    /// The torrent files a watch keeps selected: the video being played and the
    /// subtitle files beside it. They are a few kilobytes each, and a selection
    /// narrowed to the video alone would never fetch them at all.
    pub(crate) fn watched_with_its_subtitles(&self, id: &str, file: usize) -> Vec<usize> {
        let mut keeping = vec![file];
        keeping.extend(
            self.subtitles_beside(id, file)
                .iter()
                .map(|beside| beside.file_index),
        );
        keeping
    }
}

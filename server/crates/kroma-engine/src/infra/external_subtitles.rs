//! The text subtitle files sitting beside a video, listed once per folder.
//!
//! A library usually lives on an SMB mount, where a `readdir` is a network
//! round trip, so this holds each folder's answer for [`REMEMBERED_FOR`] rather
//! than listing it again per request.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use kroma_media::external_subtitles::{self, ExternalSubtitle, SUBTITLE_FOLDERS};

use crate::domain::media::SubtitleTrack;
use crate::model::MediaItem;

pub const REMEMBERED_FOR: Duration = Duration::from_secs(60);

// A folder holding more than this is not a release folder, and walking it per
// request would cost more than the tracks are worth.
const MOST_ENTRIES: usize = 4_000;

#[derive(Clone, Default)]
pub struct ExternalSubtitles(Arc<Mutex<HashMap<PathBuf, Listing>>>);

struct Listing {
    read_at: Instant,
    files: Arc<[PathBuf]>,
}

impl ExternalSubtitles {
    /// The external text subtitle files of the video at `abs`, in the order they
    /// are offered in. Blocking on a cache miss; run it on a blocking thread.
    pub fn of(&self, abs: &str) -> Vec<ExternalSubtitle> {
        let video = Path::new(abs);
        let Some(folder) = video.parent() else {
            return Vec::new();
        };
        external_subtitles::beside(video, &self.files_in(folder))
    }

    pub fn tracks_of(&self, abs: &str) -> Vec<SubtitleTrack> {
        self.of(abs).into_iter().map(as_track).collect()
    }

    /// Append every file's external tracks to `item`, the representative file's
    /// to the item itself. A file nothing has probed yet is left alone: the item
    /// carries no embedded track to put these after, and the index a client
    /// would build would move once the probe landed.
    pub fn attach(&self, item: &mut MediaItem) {
        for file in &mut item.files {
            let Some(abs) = file.abs_path.clone().filter(|_| file.probed) else {
                continue;
            };
            file.subtitles.extend(self.tracks_of(&abs));
        }
        let Some(abs) = item.abs_path.clone() else {
            return;
        };
        if item.files.iter().any(|file| file.probed) {
            item.subtitles.extend(self.tracks_of(&abs));
        }
    }

    fn files_in(&self, folder: &Path) -> Arc<[PathBuf]> {
        if let Some(remembered) = self.remembered(folder) {
            return remembered;
        }
        let files: Arc<[PathBuf]> = listed(folder).into();
        let mut held = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        held.retain(|_, listing| listing.read_at.elapsed() < REMEMBERED_FOR);
        held.insert(
            folder.to_path_buf(),
            Listing {
                read_at: Instant::now(),
                files: Arc::clone(&files),
            },
        );
        files
    }

    fn remembered(&self, folder: &Path) -> Option<Arc<[PathBuf]>> {
        let held = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        let listing = held.get(folder)?;
        (listing.read_at.elapsed() < REMEMBERED_FOR).then(|| Arc::clone(&listing.files))
    }
}

fn as_track(found: ExternalSubtitle) -> SubtitleTrack {
    SubtitleTrack {
        language: found.language.map(str::to_string),
        codec: found.codec.to_string(),
        title: found.title(),
        forced: found.forced,
    }
}

// An `Extras/` or `Featurettes/` folder is never descended: a release puts its
// subtitles in one place and walking the rest is what makes this expensive.
fn listed(folder: &Path) -> Vec<PathBuf> {
    let (mut files, folders) = read_folder(folder);
    for under in folders
        .into_iter()
        .filter(|folder| is_subtitle_folder(folder))
    {
        let (loose, named) = read_folder(&under);
        files.extend(loose);
        for inner in named {
            files.extend(read_folder(&inner).0);
        }
    }
    files.truncate(MOST_ENTRIES);
    files
}

fn read_folder(folder: &Path) -> (Vec<PathBuf>, Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(folder) else {
        return (Vec::new(), Vec::new());
    };
    let mut files = Vec::new();
    let mut folders = Vec::new();
    for entry in entries.flatten().take(MOST_ENTRIES) {
        match entry.file_type() {
            Ok(kind) if kind.is_dir() => folders.push(entry.path()),
            Ok(_) => files.push(entry.path()),
            Err(_) => (),
        }
    }
    (files, folders)
}

fn is_subtitle_folder(folder: &Path) -> bool {
    folder
        .file_name()
        .and_then(std::ffi::OsStr::to_str)
        .is_some_and(|name| SUBTITLE_FOLDERS.contains(&name.to_lowercase().as_str()))
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::model::MediaFile;

    fn scratch(name: &str) -> kroma_testing::TempDir {
        kroma_testing::temp_dir(&format!("external-subs-{name}"))
    }

    fn write(path: &Path) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, "1\n00:00:01,000 --> 00:00:02,000\nhello\n").unwrap();
    }

    fn file_at(abs: &Path, probed: bool) -> MediaFile {
        MediaFile {
            id: "f1".into(),
            rel_path: None,
            container: "mkv".into(),
            duration_ms: None,
            video: None,
            audio: None,
            audio_tracks: Vec::new(),
            subtitles: Vec::new(),
            size: None,
            edition: None,
            probed,
            unreadable: None,
            edition_id: None,
            abs_path: Some(abs.to_string_lossy().into_owned()),
        }
    }

    fn item_over(abs: &Path, probed: bool) -> MediaItem {
        MediaItem {
            id: "i1".into(),
            title: "Film".into(),
            kind: crate::model::Kind::Movie,
            year: None,
            duration_ms: None,
            container: "mkv".into(),
            video: None,
            audio: None,
            audio_tracks: Vec::new(),
            subtitles: vec![SubtitleTrack {
                language: Some("eng".into()),
                codec: "subrip".into(),
                title: None,
                forced: false,
            }],
            library: "lib".into(),
            show_id: None,
            show_title: None,
            season: None,
            episode: None,
            episode_end: None,
            episode_title: None,
            rel_path: None,
            added_at: String::new(),
            metadata: None,
            abs_path: Some(abs.to_string_lossy().into_owned()),
            files: vec![file_at(abs, probed)],
            editions: Vec::new(),
            default_file_id: None,
            markers: Vec::new(),
            audio_analysis: None,
        }
    }

    #[test]
    fn a_film_with_a_subtitle_beside_it_is_offered_that_track() {
        let dir = scratch("beside");
        let film = dir.path().join("Film (2019)/Film (2019).mkv");
        write(&film);
        write(&dir.path().join("Film (2019)/Film (2019).fr.srt"));

        let found = ExternalSubtitles::default().tracks_of(&film.to_string_lossy());

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].language.as_deref(), Some("fr"));
        assert_eq!(found[0].codec, "subrip");
    }

    #[test]
    fn a_subs_folder_is_read_and_an_extras_folder_is_not() {
        let dir = scratch("folders");
        let film = dir.path().join("Film/Film.mkv");
        write(&film);
        write(&dir.path().join("Film/Subs/Film.en.srt"));
        write(&dir.path().join("Film/Extras/Film.de.srt"));

        let found = ExternalSubtitles::default().tracks_of(&film.to_string_lossy());

        let languages: Vec<Option<&str>> = found
            .iter()
            .map(|track| track.language.as_deref())
            .collect();
        assert_eq!(languages, vec![Some("en")]);
    }

    #[test]
    fn a_folder_read_once_is_not_read_again_while_it_is_remembered() {
        let dir = scratch("remembered");
        let film = dir.path().join("Film/Film.mkv");
        write(&film);
        let cache = ExternalSubtitles::default();

        let before = cache.tracks_of(&film.to_string_lossy());
        write(&dir.path().join("Film/Film.en.srt"));
        let after = cache.tracks_of(&film.to_string_lossy());

        assert!(before.is_empty());
        assert!(after.is_empty(), "the folder was listed a second time");
    }

    #[test]
    fn an_items_external_tracks_come_after_the_ones_inside_its_file() {
        let dir = scratch("attach");
        let film = dir.path().join("Film/Film.mkv");
        write(&film);
        write(&dir.path().join("Film/Film.fr.srt"));
        let mut item = item_over(&film, true);

        ExternalSubtitles::default().attach(&mut item);

        assert_eq!(item.subtitles.len(), 2);
        assert_eq!(item.subtitles[0].language.as_deref(), Some("eng"));
        assert_eq!(item.subtitles[1].language.as_deref(), Some("fr"));
        assert_eq!(item.files[0].subtitles.len(), 1);
    }

    #[test]
    fn a_file_nothing_has_probed_yet_is_offered_no_external_track() {
        let dir = scratch("unprobed");
        let film = dir.path().join("Film/Film.mkv");
        write(&film);
        write(&dir.path().join("Film/Film.fr.srt"));
        let mut item = item_over(&film, false);

        ExternalSubtitles::default().attach(&mut item);

        assert_eq!(item.subtitles.len(), 1);
        assert!(item.files[0].subtitles.is_empty());
    }
}

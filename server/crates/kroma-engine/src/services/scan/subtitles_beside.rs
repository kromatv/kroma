use std::collections::{BTreeSet, HashMap};
use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use kroma_media::external_subtitles::beside;

use crate::infra::external_subtitles::is_subtitle_folder;
use crate::model::{MediaFile, MediaItem};

#[derive(Default)]
struct Held {
    loose: Vec<PathBuf>,
    filed: Vec<PathBuf>,
}

type Videos = Vec<(String, PathBuf)>;

pub(super) fn languages_beside(
    items: &HashMap<String, MediaItem>,
    subtitles: Vec<PathBuf>,
) -> HashMap<String, Vec<String>> {
    let held = by_folder(subtitles);
    let none = Held::default();
    let mut languages = HashMap::new();
    for (folder, videos) in videos_by_folder(items) {
        let subtitles = held.get(&folder).unwrap_or(&none);
        for (id, video) in &videos {
            languages.insert(id.clone(), languages_of(video, &videos, subtitles));
        }
    }
    languages
}

fn videos_by_folder(items: &HashMap<String, MediaItem>) -> HashMap<PathBuf, Videos> {
    let mut folders: HashMap<PathBuf, Videos> = HashMap::new();
    let files = items.values().flat_map(|item| &item.files);
    for (id, video) in files.filter_map(located) {
        let folder = video.parent().map(Path::to_path_buf).unwrap_or_default();
        folders.entry(folder).or_default().push((id, video));
    }
    folders
}

fn located(file: &MediaFile) -> Option<(String, PathBuf)> {
    let abs = file.abs_path.as_ref()?;
    Some((file.id.clone(), PathBuf::from(abs)))
}

fn by_folder(subtitles: Vec<PathBuf>) -> HashMap<PathBuf, Held> {
    let mut folders: HashMap<PathBuf, Held> = HashMap::new();
    for file in subtitles {
        let dir = file.parent().map(Path::to_path_buf).unwrap_or_default();
        for release in releases_filing(&dir) {
            folders.entry(release).or_default().filed.push(file.clone());
        }
        folders.entry(dir).or_default().loose.push(file);
    }
    folders
}

fn releases_filing(dir: &Path) -> impl Iterator<Item = PathBuf> + '_ {
    dir.ancestors()
        .zip(dir.ancestors().skip(1))
        .take(2)
        .filter(|(folder, _)| is_subtitle_folder(folder))
        .map(|(_, release)| release.to_path_buf())
}

fn languages_of(video: &Path, videos: &[(String, PathBuf)], held: &Held) -> Vec<String> {
    let stem = video
        .file_stem()
        .map(OsStr::to_string_lossy)
        .unwrap_or_default();
    let another = videos
        .iter()
        .map(|(_, other)| other)
        .find(|other| other.as_path() != video);
    let mut seen = vec![video.to_path_buf()];
    seen.extend(another.cloned());
    seen.extend(
        held.loose
            .iter()
            .filter(|file| starts_with(file, &stem))
            .cloned(),
    );
    seen.extend(held.filed.iter().cloned());
    let codes: BTreeSet<&str> = beside(video, &seen)
        .iter()
        .filter_map(|track| track.language)
        .collect();
    codes.into_iter().map(str::to_string).collect()
}

fn starts_with(file: &Path, stem: &str) -> bool {
    file.file_name()
        .is_some_and(|name| name.to_string_lossy().starts_with(stem))
}

#[cfg(test)]
mod tests;

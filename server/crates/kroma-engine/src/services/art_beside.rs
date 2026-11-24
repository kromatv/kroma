use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use kroma_domain::naming::is_season_folder;
use kroma_primitives::video::has_video_extension;

use crate::infra::image::cache_picture_beside;

const PICTURES: [&str; 4] = ["jpg", "jpeg", "png", "webp"];
const FILM_POSTERS: [&str; 5] = ["poster", "folder", "cover", "default", "movie"];
const SHOW_POSTERS: [&str; 5] = ["poster", "folder", "cover", "default", "show"];
const POSTER_WIDTH: u32 = 780;

/// The poster a person keeps beside a film's `videos`, cached as a WebP: a
/// picture named after one of the videos, alone or followed by `-poster`, or
/// `poster`, `folder`, `cover`, `default` or `movie` in a folder that holds no
/// other title's video. `None` when there is none.
pub fn film_poster(data_dir: &Path, videos: &[PathBuf]) -> Option<PathBuf> {
    let picture = videos
        .iter()
        .find_map(|video| film_picture(video, videos))?;
    cache_picture_beside(data_dir, &picture, POSTER_WIDTH)
}

/// The poster a person keeps in a show's folder, the one above its season
/// folders, cached as a WebP: `poster`, `folder`, `cover`, `default` or `show`,
/// in a folder that holds no other show's episode. `None` when there is none.
pub fn show_poster(data_dir: &Path, episodes: &[PathBuf]) -> Option<PathBuf> {
    let picture = show_folders(episodes).find_map(|folder| show_picture(&folder, episodes))?;
    cache_picture_beside(data_dir, &picture, POSTER_WIDTH)
}

fn film_picture(video: &Path, videos: &[PathBuf]) -> Option<PathBuf> {
    let folder = Folder::read(video.parent()?)?;
    let stem = video.file_stem()?.to_string_lossy().to_lowercase();
    let named = [format!("{stem}-poster"), stem];
    let shared: &[&str] = if folder.holds_only(videos) {
        &FILM_POSTERS
    } else {
        &[]
    };
    let mut names = named
        .iter()
        .map(String::as_str)
        .chain(shared.iter().copied());
    names.find_map(|name| folder.picture(name))
}

fn show_folders(episodes: &[PathBuf]) -> impl Iterator<Item = PathBuf> + '_ {
    let mut seen = HashSet::new();
    episodes
        .iter()
        .filter_map(|episode| show_folder(episode))
        .filter(move |folder| seen.insert(folder.clone()))
}

fn show_folder(episode: &Path) -> Option<PathBuf> {
    let parent = episode.parent()?;
    let named = |name: &std::ffi::OsStr| is_season_folder(&name.to_string_lossy());
    let folder = if parent.file_name().is_some_and(named) {
        parent.parent()?
    } else {
        parent
    };
    Some(folder.to_path_buf())
}

fn show_picture(folder: &Path, episodes: &[PathBuf]) -> Option<PathBuf> {
    let folder = Folder::read(folder).filter(|f| f.holds_only(episodes))?;
    SHOW_POSTERS.iter().find_map(|name| folder.picture(name))
}

struct Folder {
    pictures: HashMap<String, PathBuf>,
    videos: Vec<PathBuf>,
}

impl Folder {
    fn read(path: &Path) -> Option<Self> {
        let mut files: Vec<PathBuf> = std::fs::read_dir(path)
            .ok()?
            .flatten()
            .map(|entry| entry.path())
            .collect();
        files.sort();
        let mut pictures = HashMap::new();
        for file in &files {
            if let Some(stem) = picture_stem(file) {
                pictures.entry(stem).or_insert_with(|| file.clone());
            }
        }
        files.retain(|file| has_video_extension(file));
        Some(Self {
            pictures,
            videos: files,
        })
    }

    fn holds_only(&self, videos: &[PathBuf]) -> bool {
        self.videos.iter().all(|video| videos.contains(video))
    }

    fn picture(&self, name: &str) -> Option<PathBuf> {
        self.pictures.get(name).cloned()
    }
}

fn picture_stem(file: &Path) -> Option<String> {
    let ext = file.extension()?.to_str()?;
    let stem = file.file_stem()?.to_string_lossy().to_lowercase();
    PICTURES
        .iter()
        .any(|picture| ext.eq_ignore_ascii_case(picture))
        .then_some(stem)
}

#[cfg(test)]
mod tests;

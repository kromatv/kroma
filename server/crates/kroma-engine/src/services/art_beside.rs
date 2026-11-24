use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use kroma_domain::naming::is_season_folder;

use crate::db::art_beside::BACKDROP;

/// The extensions of the pictures read beside the media, compared without
/// regard to case.
pub const PICTURES: [&str; 4] = ["jpg", "jpeg", "png", "webp"];
const FILM_POSTERS: [&str; 5] = ["poster", "folder", "cover", "default", "movie"];
const SHOW_POSTERS: [&str; 5] = ["poster", "folder", "cover", "default", "show"];
const BACKDROPS: [&str; 4] = ["backdrop", "fanart", "background", "art"];
const POSTER_WIDTH: u32 = 780;
const BACKDROP_WIDTH: u32 = 1920;

struct Role {
    after_video: &'static [&'static str],
    video_alone: bool,
    in_own_folder: &'static [&'static str],
}

const FILM_POSTER: Role = Role {
    after_video: &["poster"],
    video_alone: true,
    in_own_folder: &FILM_POSTERS,
};

const FILM_BACKDROP: Role = Role {
    after_video: &BACKDROPS,
    video_alone: false,
    in_own_folder: &BACKDROPS,
};

/// The poster and the backdrop a person keeps beside a title's files.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Art {
    pub poster: Option<PathBuf>,
    pub backdrop: Option<PathBuf>,
}

/// The pictures a scan found, by the folder they are in, with the videos of
/// those folders.
pub struct Folders(HashMap<PathBuf, Folder>);

#[derive(Default)]
struct Folder {
    pictures: HashMap<String, PathBuf>,
    videos: Vec<PathBuf>,
}

impl Folders {
    /// Holds each of `pictures` in its folder, and each of `videos` that is in
    /// one of those folders.
    pub fn new(pictures: Vec<PathBuf>, videos: impl IntoIterator<Item = PathBuf>) -> Self {
        let mut folders: HashMap<PathBuf, Folder> = HashMap::new();
        for picture in pictures {
            let (Some(dir), Some(stem)) = (picture.parent(), picture_stem(&picture)) else {
                continue;
            };
            let dir = dir.to_path_buf();
            folders.entry(dir).or_default().hold(stem, picture);
        }
        for video in videos {
            if let Some(folder) = video.parent().and_then(|dir| folders.get_mut(dir)) {
                folder.videos.push(video);
            }
        }
        Self(folders)
    }

    fn film_picture(&self, video: &Path, videos: &[PathBuf], role: &Role) -> Option<PathBuf> {
        let folder = self.0.get(video.parent()?)?;
        let stem = video.file_stem()?.to_string_lossy().to_lowercase();
        let mut named = role
            .after_video
            .iter()
            .map(|suffix| format!("{stem}-{suffix}"))
            .chain(role.video_alone.then(|| stem.clone()));
        named.find_map(|name| folder.picture(&name)).or_else(|| {
            folder
                .holds_only(videos)
                .then(|| folder.first_of(role.in_own_folder))
                .flatten()
        })
    }
}

impl Folder {
    fn hold(&mut self, stem: String, picture: PathBuf) {
        let held = self
            .pictures
            .entry(stem)
            .or_insert_with(|| picture.clone());
        if picture < *held {
            *held = picture;
        }
    }

    fn holds_only(&self, videos: &[PathBuf]) -> bool {
        self.videos.iter().all(|video| videos.contains(video))
    }

    fn picture(&self, name: &str) -> Option<PathBuf> {
        self.pictures.get(name).cloned()
    }

    fn first_of(&self, names: &[&str]) -> Option<PathBuf> {
        names.iter().find_map(|name| self.picture(name))
    }
}

/// The art kept beside a film's `videos`. A picture named after one of them
/// comes first: alone or followed by `-poster` for the poster, followed by
/// `-backdrop`, `-fanart`, `-background` or `-art` for the backdrop. Then, in a
/// folder that holds no other title's video, `poster`, `folder`, `cover`,
/// `default` or `movie`, and `backdrop`, `fanart`, `background` or `art`.
pub fn film_art(folders: &Folders, videos: &[PathBuf]) -> Art {
    let pick = |role: &Role| {
        videos
            .iter()
            .find_map(|video| folders.film_picture(video, videos, role))
    };
    Art {
        poster: pick(&FILM_POSTER),
        backdrop: pick(&FILM_BACKDROP),
    }
}

/// The art kept in a show's folder, the one above its season folders, when it
/// holds no other show's episode: `poster`, `folder`, `cover`, `default` or
/// `show`, and `backdrop`, `fanart`, `background` or `art`.
pub fn show_art(folders: &Folders, episodes: &[PathBuf]) -> Art {
    let held: Vec<&Folder> = show_folders(episodes)
        .filter_map(|dir| folders.0.get(&dir))
        .filter(|folder| folder.holds_only(episodes))
        .collect();
    let pick = |names: &[&str]| held.iter().find_map(|folder| folder.first_of(names));
    Art {
        poster: pick(&SHOW_POSTERS),
        backdrop: pick(&BACKDROPS),
    }
}

/// The widest a picture kept as `role` is cached.
pub fn max_width(role: &str) -> u32 {
    if role == BACKDROP {
        BACKDROP_WIDTH
    } else {
        POSTER_WIDTH
    }
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

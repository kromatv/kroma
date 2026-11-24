//! The `.nfo` file kept beside a film's, a show's or an episode's files.

use std::path::PathBuf;

use super::{film_file, Folders, Role};

const FILM_NFO: Role = Role {
    after_video: &[],
    video_alone: true,
    in_own_folder: &["movie"],
};

const EPISODE_NFO: Role = Role {
    after_video: &[],
    video_alone: true,
    in_own_folder: &[],
};

/// The `.nfo` file kept beside a film's `videos`: one named after one of them,
/// else `movie.nfo` in a folder that holds no other title's video.
pub fn film_nfo(folders: &Folders, videos: &[PathBuf]) -> Option<PathBuf> {
    film_file(folders, videos, &FILM_NFO)
}

/// `tvshow.nfo` in a show's folder, the one above its season folders, when it
/// holds no other show's episode.
pub fn show_nfo(folders: &Folders, episodes: &[PathBuf]) -> Option<PathBuf> {
    let held = folders.of_show(episodes);
    held.iter().find_map(|folder| folder.file("tvshow"))
}

/// The `.nfo` file named after one of an episode's `videos`, as Kodi and
/// Jellyfin keep it.
pub fn episode_nfo(folders: &Folders, videos: &[PathBuf]) -> Option<PathBuf> {
    film_file(folders, videos, &EPISODE_NFO)
}

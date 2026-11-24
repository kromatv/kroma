//! What a person keeps beside a title's files: its poster, its backdrop and
//! its logo, a season's poster, an episode's thumbnail, and the `.nfo` file
//! that gives a title its text.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use kroma_domain::naming::is_season_folder;

use crate::db::art_beside::{BACKDROP, LOGO};

/// The extensions of the pictures read beside the media, compared without
/// regard to case.
pub const PICTURES: [&str; 4] = ["jpg", "jpeg", "png", "webp"];
const FILM_POSTERS: [&str; 5] = ["poster", "folder", "cover", "default", "movie"];
const SHOW_POSTERS: [&str; 5] = ["poster", "folder", "cover", "default", "show"];
const SEASON_POSTERS: [&str; 4] = ["poster", "folder", "cover", "default"];
const BACKDROPS: [&str; 4] = ["backdrop", "fanart", "background", "art"];
const LOGOS: [&str; 2] = ["logo", "clearlogo"];
const POSTER_WIDTH: u32 = 780;
const BACKDROP_WIDTH: u32 = 1920;
const LOGO_WIDTH: u32 = 800;

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

const FILM_LOGO: Role = Role {
    after_video: &LOGOS,
    video_alone: false,
    in_own_folder: &LOGOS,
};

const EPISODE_STILL: Role = Role {
    after_video: &["thumb"],
    video_alone: true,
    in_own_folder: &[],
};

const FILM_NFO: Role = Role {
    after_video: &[],
    video_alone: true,
    in_own_folder: &["movie"],
};

/// The poster, the backdrop and the logo a person keeps beside a title's
/// files, or the still beside an episode's.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Art {
    pub poster: Option<PathBuf>,
    pub backdrop: Option<PathBuf>,
    pub logo: Option<PathBuf>,
    pub still: Option<PathBuf>,
}

/// The files of one kind a scan found, pictures or `.nfo` files, by the
/// folder they are in, with the videos of those folders.
pub struct Folders(HashMap<PathBuf, Folder>);

#[derive(Default)]
struct Folder {
    files: HashMap<String, PathBuf>,
    videos: Vec<PathBuf>,
}

impl Folders {
    /// Holds each of `files` in its folder by its name, and each of `videos`
    /// that is in one of those folders.
    pub fn new(files: Vec<PathBuf>, videos: impl IntoIterator<Item = PathBuf>) -> Self {
        let mut folders: HashMap<PathBuf, Folder> = HashMap::new();
        for file in files {
            let (Some(dir), Some(stem)) = (file.parent(), file.file_stem()) else {
                continue;
            };
            let stem = stem.to_string_lossy().to_lowercase();
            folders
                .entry(dir.to_path_buf())
                .or_default()
                .hold(stem, file);
        }
        for video in videos {
            if let Some(folder) = video.parent().and_then(|dir| folders.get_mut(dir)) {
                folder.videos.push(video);
            }
        }
        Self(folders)
    }

    fn of_show(&self, episodes: &[PathBuf]) -> Vec<&Folder> {
        show_folders(episodes)
            .filter_map(|dir| self.0.get(&dir))
            .filter(|folder| folder.holds_only(episodes))
            .collect()
    }

    fn of_season(&self, videos: &[PathBuf]) -> Vec<&Folder> {
        let mut seen = HashSet::new();
        videos
            .iter()
            .filter_map(|video| video.parent())
            .filter(|dir| dir.file_name().is_some_and(names_a_season))
            .filter(|dir| seen.insert(*dir))
            .filter_map(|dir| self.0.get(dir))
            .filter(|folder| folder.holds_only(videos))
            .collect()
    }

    fn film_file(&self, video: &Path, videos: &[PathBuf], role: &Role) -> Option<PathBuf> {
        let folder = self.0.get(video.parent()?)?;
        let stem = video.file_stem()?.to_string_lossy().to_lowercase();
        let mut named = role
            .after_video
            .iter()
            .map(|suffix| format!("{stem}-{suffix}"))
            .chain(role.video_alone.then(|| stem.clone()));
        named.find_map(|name| folder.file(&name)).or_else(|| {
            folder
                .holds_only(videos)
                .then(|| folder.first_of(role.in_own_folder))
                .flatten()
        })
    }
}

impl Folder {
    fn hold(&mut self, stem: String, file: PathBuf) {
        let held = self.files.entry(stem).or_insert_with(|| file.clone());
        if file < *held {
            *held = file;
        }
    }

    fn holds_only(&self, videos: &[PathBuf]) -> bool {
        self.videos.iter().all(|video| videos.contains(video))
    }

    fn file(&self, name: &str) -> Option<PathBuf> {
        self.files.get(name).cloned()
    }

    fn first_of(&self, names: &[&str]) -> Option<PathBuf> {
        names.iter().find_map(|name| self.file(name))
    }
}

/// The art kept beside a film's `videos`. A picture named after one of them
/// comes first: alone or followed by `-poster` for the poster, followed by
/// `-backdrop`, `-fanart`, `-background` or `-art` for the backdrop, and by
/// `-logo` or `-clearlogo` for the logo. Then, in a folder that holds no other
/// title's video, `poster`, `folder`, `cover`, `default` or `movie`, `backdrop`,
/// `fanart`, `background` or `art`, and `logo` or `clearlogo`.
pub fn film_art(folders: &Folders, videos: &[PathBuf]) -> Art {
    Art {
        poster: film_file(folders, videos, &FILM_POSTER),
        backdrop: film_file(folders, videos, &FILM_BACKDROP),
        logo: film_file(folders, videos, &FILM_LOGO),
        still: None,
    }
}

/// The thumbnail kept beside an episode's `videos`: a picture named after one
/// of them followed by `-thumb`, as Jellyfin and Kodi name it, else named after
/// it alone, as Plex does.
pub fn episode_art(folders: &Folders, videos: &[PathBuf]) -> Art {
    Art {
        still: film_file(folders, videos, &EPISODE_STILL),
        ..Art::default()
    }
}

/// The `.nfo` file kept beside a film's `videos`: one named after one of them,
/// else `movie.nfo` in a folder that holds no other title's video.
pub fn film_nfo(folders: &Folders, videos: &[PathBuf]) -> Option<PathBuf> {
    film_file(folders, videos, &FILM_NFO)
}

fn film_file(folders: &Folders, videos: &[PathBuf], role: &Role) -> Option<PathBuf> {
    videos
        .iter()
        .find_map(|video| folders.film_file(video, videos, role))
}

/// The art kept in a show's folder, the one above its season folders, when it
/// holds no other show's episode: `poster`, `folder`, `cover`, `default` or
/// `show`, `backdrop`, `fanart`, `background` or `art`, and `logo` or
/// `clearlogo`.
pub fn show_art(folders: &Folders, episodes: &[PathBuf]) -> Art {
    let held = folders.of_show(episodes);
    let pick = |names: &[&str]| held.iter().find_map(|folder| folder.first_of(names));
    Art {
        poster: pick(&SHOW_POSTERS),
        backdrop: pick(&BACKDROPS),
        logo: pick(&LOGOS),
        still: None,
    }
}

/// One season of a show: its number and the videos of its episodes.
pub struct SeasonVideos<'a> {
    pub number: u32,
    pub videos: &'a [PathBuf],
}

/// The poster kept for one `season` of a show whose `episodes` are given. In
/// the season's own folder, a folder named as a season that holds no other
/// episode: `poster`, `folder`, `cover` or `default`, as Jellyfin reads them,
/// or the season's number, `Season01`, as Plex does. Else, in the show's
/// folder, `season01-poster`, as Kodi does. Season 0 also takes
/// `season-specials-poster`.
pub fn season_poster(
    folders: &Folders,
    episodes: &[PathBuf],
    season: &SeasonVideos<'_>,
) -> Option<PathBuf> {
    let numbered = numbered(season.number);
    let numbered: Vec<&str> = numbered.iter().map(String::as_str).collect();
    let own = folders.of_season(season.videos);
    own.iter()
        .find_map(|folder| folder.first_of(&SEASON_POSTERS))
        .or_else(|| own.iter().find_map(|folder| folder.first_of(&numbered)))
        .or_else(|| {
            let show = folders.of_show(episodes);
            show.iter().find_map(|folder| folder.first_of(&numbered))
        })
}

fn numbered(number: u32) -> Vec<String> {
    let mut names = vec![
        format!("season{number:02}-poster"),
        format!("season{number:02}"),
        format!("season{number}-poster"),
        format!("season{number}"),
    ];
    if number == 0 {
        names.push("season-specials-poster".into());
    }
    names
}

/// `tvshow.nfo` in a show's folder, the one above its season folders, when it
/// holds no other show's episode.
pub fn show_nfo(folders: &Folders, episodes: &[PathBuf]) -> Option<PathBuf> {
    let held = folders.of_show(episodes);
    held.iter().find_map(|folder| folder.file("tvshow"))
}

/// The widest a picture kept as `role` is cached.
pub fn max_width(role: &str) -> u32 {
    match role {
        BACKDROP => BACKDROP_WIDTH,
        LOGO => LOGO_WIDTH,
        _ => POSTER_WIDTH,
    }
}

fn show_folders(episodes: &[PathBuf]) -> impl Iterator<Item = PathBuf> + '_ {
    let mut seen = HashSet::new();
    episodes
        .iter()
        .filter_map(|episode| show_folder(episode))
        .filter(move |folder| seen.insert(folder.clone()))
}

fn names_a_season(name: &std::ffi::OsStr) -> bool {
    is_season_folder(&name.to_string_lossy())
}

fn show_folder(episode: &Path) -> Option<PathBuf> {
    let parent = episode.parent()?;
    let folder = if parent.file_name().is_some_and(names_a_season) {
        parent.parent()?
    } else {
        parent
    };
    Some(folder.to_path_buf())
}

#[cfg(test)]
mod tests;

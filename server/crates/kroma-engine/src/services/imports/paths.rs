//! The path translation of another server: where the folders the owner
//! confirmed are on this machine, and so where every path below one is.

use std::path::{Path, PathBuf};

use anyhow::Result;

use crate::db;
use crate::model::imports::KeptFolder;

/// What every import of one server kept of its folders. A stage that matches a
/// title of that server to a file here reads the title's paths through it.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct Translation {
    folders: Vec<KeptFolder>,
}

impl Translation {
    /// The translation kept for the server `server_id` names in
    /// `import_servers`.
    pub(crate) fn kept(pool: &db::Pool, server_id: &str) -> Result<Self> {
        let folders = db::imports::kept_folders(pool, server_id)?;
        Ok(Self { folders })
    }

    /// Where `path` of the other server is on this machine, by the deepest
    /// kept folder that holds it. `None` for a path no kept folder holds, and
    /// for one that climbs with `..`.
    pub(crate) fn here(&self, path: &str) -> Option<String> {
        let path = parts(path)?;
        self.folders
            .iter()
            .filter_map(|kept| {
                let folder = parts(&kept.folder)?;
                path.starts_with(&folder).then_some((folder.len(), kept))
            })
            .max_by_key(|(depth, _)| *depth)
            .map(|(depth, kept)| below(&kept.here, &path[depth..]))
    }

    /// Where the folder `folder` of the other server is on this machine.
    /// `None` when [`here`](Self::here) places it nowhere, or on something
    /// that is no folder of this machine.
    pub(crate) fn folder_here(&self, folder: &str) -> Option<String> {
        self.here(folder).filter(|here| on_this_machine(here))
    }
}

pub(super) fn on_this_machine(folder: &str) -> bool {
    let folder = Path::new(folder);
    folder.is_absolute() && folder.is_dir()
}

pub(super) fn under_its_own_name(folder: &str) -> Option<String> {
    (parts(folder).is_some() && on_this_machine(folder)).then(|| folder.to_string())
}

fn parts(path: &str) -> Option<Vec<&str>> {
    let of_windows = !path.starts_with('/');
    let parts: Vec<&str> = path
        .split(|c| c == '/' || (of_windows && c == '\\'))
        .filter(|part| !part.is_empty() && *part != ".")
        .collect();
    (!parts.contains(&"..")).then_some(parts)
}

fn below(here: &str, rest: &[&str]) -> String {
    let mut placed = PathBuf::from(here);
    placed.extend(rest);
    placed.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn translation(folders: &[(&str, &str)]) -> Translation {
        let folders = folders
            .iter()
            .map(|(folder, here)| KeptFolder {
                folder: (*folder).into(),
                here: (*here).into(),
            })
            .collect();
        Translation { folders }
    }

    #[test]
    fn one_answer_translates_its_folder_and_every_path_below_it() {
        let translation = translation(&[("/data/movies", "/volume1/video/movies")]);

        let folder = translation.here("/data/movies/");
        let film = translation.here("/data/movies/Heat (1995)/Heat.mkv");

        assert_eq!(folder.as_deref(), Some("/volume1/video/movies"));
        assert_eq!(
            film.as_deref(),
            Some("/volume1/video/movies/Heat (1995)/Heat.mkv")
        );
    }

    #[test]
    fn a_path_beside_a_folder_whose_name_it_starts_with_is_not_below_it() {
        let translation = translation(&[("/data/movies", "/volume1/video/movies")]);

        let beside = translation.here("/data/movies-4k/Heat.mkv");

        assert_eq!(beside, None);
    }

    #[test]
    fn the_deepest_folder_that_holds_a_path_translates_it() {
        let translation = translation(&[("/data", "/mnt/all"), ("/data/movies", "/mnt/films")]);

        let film = translation.here("/data/movies/Heat.mkv");
        let episode = translation.here("/data/shows/Dark/S01E01.mkv");

        assert_eq!(film.as_deref(), Some("/mnt/films/Heat.mkv"));
        assert_eq!(episode.as_deref(), Some("/mnt/all/shows/Dark/S01E01.mkv"));
    }

    #[test]
    fn a_path_that_climbs_out_of_its_folder_is_nowhere_here() {
        let translation = translation(&[("/data/movies", "/volume1/video/movies")]);

        let climbing = translation.here("/data/movies/../../etc");

        assert_eq!(climbing, None);
    }

    #[test]
    fn a_path_of_a_windows_server_is_read_with_its_own_separator() {
        let translation = translation(&[(r"D:\Media\Movies", "/volume1/video/movies")]);

        let film = translation.here(r"D:\Media\Movies\Heat (1995)\Heat.mkv");

        assert_eq!(
            film.as_deref(),
            Some("/volume1/video/movies/Heat (1995)/Heat.mkv")
        );
    }

    #[test]
    fn a_backslash_in_a_name_of_a_unix_server_separates_nothing() {
        let translation = translation(&[("/data/movies", "/mnt/films")]);

        let film = translation.here(r"/data/movies/AC\DC Live.mkv");

        assert_eq!(film.as_deref(), Some(r"/mnt/films/AC\DC Live.mkv"));
    }
}

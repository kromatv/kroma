//! Where a file of the other server is on this machine, below a source
//! folder, under the path a scan writes for it.
//!
//! A scan writes the folder it walks as the file system resolves it, and each
//! name below as its folder lists it. A path that reaches a file under another
//! spelling, on a file system that folds case, is spelled here the same way.

use std::cell::RefCell;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::super::super::paths::Translation;
use crate::model::import::Title;
use crate::services::scan::walk;
use crate::services::settings;
use crate::state::SharedState;

const MAX_PATHS_OF_A_TITLE: usize = 8;
const MAX_PATH_BYTES: usize = 4096;

/// One file below a source folder. `path` is the whole of it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Placed {
    root: PathBuf,
    below: PathBuf,
    pub(super) path: String,
}

impl Placed {
    fn at(root: &Path, below: PathBuf) -> Self {
        Self {
            path: root.join(&below).to_string_lossy().into_owned(),
            root: root.to_path_buf(),
            below,
        }
    }

    pub(super) fn is_a_file(&self) -> bool {
        Path::new(&self.path).is_file()
    }

    /// Whether a scan of its source writes this file.
    pub(super) fn is_scanned(&self) -> bool {
        walk::takes(&self.below)
    }
}

fn names_in(folder: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(folder) else {
        return Vec::new();
    };
    entries
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect()
}

/// The source folders of this server, each as it is configured and as the
/// file system resolves it, and the folders listed for one page of titles.
pub(super) struct Sources {
    roots: Vec<(PathBuf, PathBuf)>,
    listed: RefCell<HashMap<PathBuf, Vec<String>>>,
}

impl Sources {
    pub(super) fn of(state: &SharedState) -> Self {
        let roots = settings::all_folders(&state.settings, &state.config)
            .into_iter()
            .map(|root| {
                let resolved = root.canonicalize().unwrap_or_else(|_| root.clone());
                (root, resolved)
            })
            .collect();
        Self {
            roots,
            listed: RefCell::default(),
        }
    }

    fn placed(&self, here: &str) -> Option<Placed> {
        let here = Path::new(here);
        self.roots.iter().find_map(|(root, resolved)| {
            let below = here
                .strip_prefix(root)
                .or_else(|_| here.strip_prefix(resolved))
                .ok()?;
            Some(Placed::at(resolved, below.to_path_buf()))
        })
    }

    /// The files of `title` that a source folder holds, in the order the other
    /// server gives them.
    pub(super) fn files_of(&self, title: &Title, translation: &Translation) -> Vec<Placed> {
        title
            .paths
            .iter()
            .take(MAX_PATHS_OF_A_TITLE)
            .filter(|path| path.len() <= MAX_PATH_BYTES)
            .filter_map(|path| self.placed(&translation.here(path)?))
            .collect()
    }

    fn name_in(&self, folder: &Path, name: &str) -> Option<String> {
        let mut listed = self.listed.borrow_mut();
        let names = listed
            .entry(folder.to_path_buf())
            .or_insert_with(|| names_in(folder));
        if names.iter().any(|listed| listed == name) {
            return Some(name.to_string());
        }
        let folded = name.to_lowercase();
        let mut alike = names.iter().filter(|name| name.to_lowercase() == folded);
        match (alike.next(), alike.next()) {
            (Some(only), None) => Some(only.clone()),
            _ => None,
        }
    }

    /// `file` with each name below its source folder spelled as its folder
    /// lists it. `None` when a folder lists no such name, or two that differ
    /// only by case.
    pub(super) fn as_listed(&self, file: &Placed) -> Option<Placed> {
        let mut folder = file.root.clone();
        let mut below = PathBuf::new();
        for name in file.below.components() {
            let listed = self.name_in(&folder, &name.as_os_str().to_string_lossy())?;
            folder.push(&listed);
            below.push(&listed);
        }
        Some(Placed::at(&file.root, below))
    }
}

#[cfg(test)]
mod tests {
    use kroma_testing::TempDir;

    use super::*;

    fn a_source_with(files: &[&str]) -> (TempDir, Sources) {
        let disk = kroma_testing::temp_dir("import-on-disk");
        for file in files {
            let path = disk.path().join(file);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, b"x").unwrap();
        }
        let sources = Sources {
            roots: vec![(disk.path().to_path_buf(), disk.path().to_path_buf())],
            listed: RefCell::default(),
        };
        (disk, sources)
    }

    fn placed(disk: &TempDir, below: &str) -> Placed {
        Placed::at(disk.path(), PathBuf::from(below))
    }

    #[test]
    fn a_path_spelled_as_its_folders_list_it_stays_as_it_is() {
        let (disk, sources) = a_source_with(&["Heat (1995)/Heat (1995).mkv"]);
        let file = placed(&disk, "Heat (1995)/Heat (1995).mkv");

        let listed = sources.as_listed(&file);

        assert_eq!(listed, Some(file));
    }

    #[test]
    fn a_path_in_another_case_is_spelled_as_its_folders_list_it() {
        let (disk, sources) = a_source_with(&["Heat (1995)/Heat (1995).mkv"]);
        let file = placed(&disk, "heat (1995)/HEAT (1995).MKV");

        let listed = sources.as_listed(&file);

        assert_eq!(listed, Some(placed(&disk, "Heat (1995)/Heat (1995).mkv")));
    }

    #[test]
    fn a_name_no_folder_lists_has_no_spelling() {
        let (disk, sources) = a_source_with(&["Heat (1995)/Heat (1995).mkv"]);

        let no_file = sources.as_listed(&placed(&disk, "Heat (1995)/Ronin (1998).mkv"));
        let no_folder = sources.as_listed(&placed(&disk, "Ronin (1998)/Ronin (1998).mkv"));
        let below_a_file = sources.as_listed(&placed(&disk, "Heat (1995)/Heat (1995).mkv/x"));

        assert_eq!((no_file, no_folder, below_a_file), (None, None, None));
    }

    #[test]
    fn a_name_two_entries_of_a_folder_fold_to_has_no_spelling() {
        let (disk, sources) = a_source_with(&[]);
        let names = vec!["Heat.mkv".to_string(), "HEAT.mkv".to_string()];
        sources
            .listed
            .borrow_mut()
            .insert(disk.path().to_path_buf(), names);

        let either = sources.as_listed(&placed(&disk, "heat.mkv"));
        let one_of_them = sources.as_listed(&placed(&disk, "HEAT.mkv"));

        assert_eq!(either, None);
        assert_eq!(one_of_them, Some(placed(&disk, "HEAT.mkv")));
    }

    #[test]
    fn a_file_is_scanned_when_the_walk_takes_its_container_and_its_folders() {
        let (disk, _) = a_source_with(&[]);

        let film = placed(&disk, "Heat (1995)/Heat (1995).mkv");
        let old_rip = placed(&disk, "Heat (1995)/Heat (1995).wmv");
        let in_a_pruned_folder = placed(&disk, "@eaDir/Heat (1995).mkv");

        assert!(film.is_scanned());
        assert!(!old_rip.is_scanned());
        assert!(!in_a_pruned_folder.is_scanned());
    }
}

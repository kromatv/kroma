//! Where the scan records the files of another server. The catalogue knows a
//! file by the path the scan gave it: the resolved folder of its source, then
//! the file's path below that folder.

use std::path::{Path, PathBuf};

use anyhow::Result;

use super::paths::Translation;
use crate::services::settings::{self, LibraryDef};
use crate::state::SharedState;

struct Root {
    folder: PathBuf,
    resolved: PathBuf,
}

/// The paths of one other server's files as `files.abs_path` holds them, over
/// the folders the owner confirmed and the sources this server has now.
pub(crate) struct ScanPaths {
    translation: Translation,
    roots: Vec<Root>,
}

fn roots(sources: &[LibraryDef]) -> Vec<Root> {
    sources
        .iter()
        .flat_map(|source| &source.folders)
        .map(|folder| {
            let folder = PathBuf::from(folder);
            let resolved = folder.canonicalize().unwrap_or_else(|_| folder.clone());
            Root { folder, resolved }
        })
        .collect()
}

impl ScanPaths {
    /// For the server `server_id` names in `import_servers`.
    pub(crate) fn kept(state: &SharedState, server_id: &str) -> Result<Self> {
        let sources = settings::library_defs(&state.settings, &state.config)?;
        Ok(Self {
            translation: Translation::kept(&state.db, server_id)?,
            roots: roots(&sources),
        })
    }

    /// The path the scan records for the file at `path` on the other server.
    /// `None` where [`Translation::here`] places it nowhere. A file no source
    /// holds keeps its translated path.
    pub(crate) fn of(&self, path: &str) -> Option<String> {
        let here = self.translation.here(path)?;
        let scanned = self.roots.iter().find_map(|root| {
            let below = Path::new(&here).strip_prefix(&root.folder).ok()?;
            Some(root.resolved.join(below).to_string_lossy().into_owned())
        });
        Some(scanned.unwrap_or(here))
    }
}

#[cfg(test)]
mod tests {
    use kroma_testing::TempDir;

    use super::*;
    use crate::db;
    use crate::db::imports::NewImport;
    use crate::model::imports::{KeptFolder, Origin, Selection};
    use crate::test_support::test_state;

    const IMPORTER: &str = "tv.x.import";

    fn a_server(state: &SharedState, movies_here: &Path) -> String {
        let server = Origin {
            id: "srv".into(),
            name: String::new(),
        };
        let new = NewImport {
            id: "i1",
            importer: IMPORTER,
            server: &server,
            sign_in: "s-1",
            selection: &Selection::default(),
            started_by: None,
            created_ms: 1,
        };
        assert!(db::imports::queue(&state.db, &new).unwrap());
        let server_id = db::imports::server_key(IMPORTER, "srv");
        let answered = KeptFolder {
            folder: "/data/movies".into(),
            here: movies_here.to_string_lossy().into_owned(),
        };
        db::imports::keep_folders(&state.db, &server_id, &[answered]).unwrap();
        server_id
    }

    fn a_source(state: &SharedState, folder: &Path) {
        let source = LibraryDef {
            id: "films".into(),
            name: "Films".into(),
            kind: "movies".into(),
            folders: vec![folder.to_string_lossy().into_owned()],
            auto_scan: true,
        };
        settings::set_library_defs(&state.settings, &state.db, &[source]);
    }

    fn a_disk_reached_through_a_link() -> (TempDir, PathBuf, PathBuf) {
        let disk = kroma_testing::temp_dir("import-scan-paths");
        let mounted = disk.path().canonicalize().unwrap().join("volume1");
        let link = disk.path().join("media");
        std::fs::create_dir_all(mounted.join("films")).unwrap();
        std::os::unix::fs::symlink(&mounted, &link).unwrap();
        (disk, mounted, link)
    }

    #[test]
    fn a_file_is_where_the_scan_records_it_below_the_resolved_folder_of_its_source() {
        let (_disk, mounted, link) = a_disk_reached_through_a_link();
        let state = test_state();
        let server_id = a_server(&state, &link.join("films"));
        a_source(&state, &link);
        let paths = ScanPaths::kept(&state, &server_id).unwrap();

        let heat = paths.of("/data/movies/Heat (1995)/Heat.mkv");

        let recorded = mounted.join("films/Heat (1995)/Heat.mkv");
        assert_eq!(heat, Some(recorded.to_string_lossy().into_owned()));
    }

    #[test]
    fn a_file_no_source_holds_keeps_its_translated_path() {
        let (_disk, _mounted, link) = a_disk_reached_through_a_link();
        let state = test_state();
        let server_id = a_server(&state, &link.join("films"));
        let paths = ScanPaths::kept(&state, &server_id).unwrap();

        let heat = paths.of("/data/movies/Heat.mkv");

        let translated = link.join("films/Heat.mkv");
        assert_eq!(heat, Some(translated.to_string_lossy().into_owned()));
    }

    #[test]
    fn a_file_under_no_confirmed_folder_is_nowhere() {
        let (_disk, _mounted, link) = a_disk_reached_through_a_link();
        let state = test_state();
        let server_id = a_server(&state, &link.join("films"));
        a_source(&state, &link);
        let paths = ScanPaths::kept(&state, &server_id).unwrap();

        let episode = paths.of("/data/shows/The Wire/S01E01.mkv");

        assert_eq!(episode, None);
    }
}

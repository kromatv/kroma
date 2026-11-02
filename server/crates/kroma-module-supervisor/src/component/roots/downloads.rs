use std::path::PathBuf;

use kroma_module_manifest::FsRoot;

use super::{declares, holds, is_data_dir_name, FolderRoots};
use crate::Supervisor;

const ENGINE_DOWNLOADS: &str = "downloads";

/// Where downloads land, as a first-party module that declares `downloads` holds
/// them, and the folders the operator named that it does not hold because each
/// lies inside or above a folder of the server's own.
#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct DownloadFolders {
    pub(crate) held: Vec<PathBuf>,
    pub(crate) refused: Vec<PathBuf>,
}

impl Supervisor {
    /// The `downloads` folder of each data directory a first-party module
    /// declaring `downloads` keeps, and every existing folder the operator named.
    pub(crate) fn download_folders(&self, folders: &FolderRoots) -> DownloadFolders {
        let files = self.server_files(folders);
        let engines = self
            .installed_manifests()
            .into_iter()
            .filter(|manifest| declares(manifest, FsRoot::Downloads))
            .filter(|manifest| self.origin(&manifest.id).official)
            .flat_map(|manifest| manifest.data_dirs)
            .filter(|name| is_data_dir_name(name))
            .map(|name| self.cfg.data_dir.join(name))
            .map(|dir| (dir.join(ENGINE_DOWNLOADS), dir))
            .filter(|(downloads, dir)| downloads.is_dir() && holds(dir, downloads))
            .map(|(downloads, _)| downloads);
        let (named, refused): (Vec<PathBuf>, Vec<PathBuf>) = (folders.downloads)()
            .into_iter()
            .filter(|dir| dir.is_absolute() && dir.is_dir())
            .partition(|dir| !files.above(dir) && !files.inside(dir));
        let mut held: Vec<PathBuf> = engines.chain(named).collect();
        held.sort();
        held.dedup();
        DownloadFolders { held, refused }
    }
}

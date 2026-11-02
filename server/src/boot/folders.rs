//! Where the folders a module may hold are on this machine: the libraries, the
//! folders the operator named for downloads, and what holds the server itself.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use kroma_config::Config;
use kroma_engine::state::SharedState;
use kroma_module_host::HostCtx;
use kroma_module_supervisor::{FolderRoots, Folders};

const DOWNLOAD_FOLDERS: &str = "downloadFolders";
const RECYCLE_BIN: &str = "acqRecycleBin";

/// The folder roots the supervisor grants from, read again each time a module
/// starts.
pub fn folder_roots(state: &SharedState) -> FolderRoots {
    FolderRoots {
        media: media_roots(state),
        downloads: download_folders(state),
        server_dirs: server_dirs(&state.config),
    }
}

fn media_roots(state: &SharedState) -> Folders {
    let state = state.clone();
    Arc::new(move || {
        let mut roots: Vec<PathBuf> = HostCtx::library_folders(&*state)
            .into_iter()
            .flat_map(|library| library.folders)
            .map(PathBuf::from)
            .collect();
        roots.sort();
        roots.dedup();
        roots
    })
}

fn named_folders(listed: &str) -> impl Iterator<Item = PathBuf> + '_ {
    listed
        .split([',', '\n'])
        .map(str::trim)
        .filter(|folder| !folder.is_empty())
        .map(PathBuf::from)
}

fn download_folders(state: &SharedState) -> Folders {
    let state = state.clone();
    Arc::new(move || {
        let listed = state.settings.get_str(DOWNLOAD_FOLDERS, "");
        let bin = state.settings.get_str(RECYCLE_BIN, "");
        named_folders(&listed).chain(named_folders(&bin)).collect()
    })
}

fn server_dirs(config: &Config) -> Vec<PathBuf> {
    let binary = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf));
    [
        config.self_update_dir.clone(),
        config.update_dir.clone(),
        config.web_dir.clone(),
        binary,
    ]
    .into_iter()
    .flatten()
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folders_are_read_from_a_comma_or_line_separated_list() {
        let listed = "/volume1/downloads, /mnt/torrents\n\n /srv/incoming ,";

        let folders: Vec<PathBuf> = named_folders(listed).collect();

        assert_eq!(
            folders,
            ["/volume1/downloads", "/mnt/torrents", "/srv/incoming"].map(PathBuf::from)
        );
    }
}

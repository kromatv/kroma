use std::path::{Path, PathBuf};

use super::{holds, FolderRoots, RESERVED_DATA_DIRS};
use crate::Supervisor;

pub(super) struct ServerFiles {
    own: Vec<PathBuf>,
    reserved: Vec<PathBuf>,
}

impl ServerFiles {
    pub(super) fn above(&self, dir: &Path) -> bool {
        self.own.iter().any(|own| holds(dir, own))
    }

    pub(super) fn inside(&self, dir: &Path) -> bool {
        self.own.iter().any(|own| holds(own, dir))
    }

    pub(super) fn inside_reserved(&self, dir: &Path) -> bool {
        self.reserved.iter().any(|reserved| holds(reserved, dir))
    }
}

impl Supervisor {
    pub(super) fn server_files(&self, folders: &FolderRoots) -> ServerFiles {
        let data_dir = &self.cfg.data_dir;
        let named = || {
            std::iter::once(self.cfg.modules_dir.clone()).chain(folders.server_dirs.iter().cloned())
        };
        ServerFiles {
            own: std::iter::once(data_dir.clone()).chain(named()).collect(),
            reserved: RESERVED_DATA_DIRS
                .iter()
                .map(|name| data_dir.join(name))
                .chain(named())
                .collect(),
        }
    }
}

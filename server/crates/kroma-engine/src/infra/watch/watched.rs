use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver};

use notify::{ErrorKind, RecommendedWatcher, RecursiveMode, Watcher, WatcherKind};
use tracing::warn;
use walkdir::WalkDir;

use crate::services::scan::walk::is_pruned_dir;

pub(super) struct Watched {
    pub(super) rx: Receiver<()>,
    watcher: Option<RecommendedWatcher>,
    roots: Vec<PathBuf>,
    full: bool,
}

impl Watched {
    pub(super) fn start(roots: Vec<PathBuf>) -> Self {
        let (tx, rx) = mpsc::channel();
        let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            if res.is_ok_and(|event| !event.kind.is_access()) {
                let _ = tx.send(());
            }
        })
        .map_err(|e| warn!(error = %e, "filesystem watcher unavailable (periodic re-scan only)"))
        .ok();
        let mut watched = Self {
            rx,
            watcher,
            roots,
            full: false,
        };
        watched.watch_roots();
        watched
    }

    pub(super) fn fs_events(&self) -> bool {
        self.watcher.is_some()
    }

    pub(super) fn refresh(&mut self) {
        let Some(watcher) = self.watcher.as_mut().filter(|_| one_watch_per_folder()) else {
            return;
        };
        let mut folders = self.roots.iter().flat_map(|root| folders_under(root));
        let refused = folders.find_map(|dir| {
            let watched = watcher.watch(&dir, RecursiveMode::NonRecursive);
            watched
                .err()
                .filter(|e| matches!(e.kind, ErrorKind::MaxFilesWatch))
        });
        if let Some(error) = refused.filter(|_| !self.full) {
            warn!(%error, "not every library folder is watched; the periodic re-scan covers the rest");
            self.full = true;
        }
    }

    fn watch_roots(&mut self) {
        if one_watch_per_folder() {
            return self.refresh();
        }
        let Some(watcher) = self.watcher.as_mut() else {
            return;
        };
        for root in &self.roots {
            if let Err(e) = watcher.watch(root, RecursiveMode::Recursive) {
                warn!(path = %root.display(), error = %e, "could not watch media dir");
            }
        }
    }
}

fn one_watch_per_folder() -> bool {
    RecommendedWatcher::kind() == WatcherKind::Inotify
}

fn folders_under(root: &Path) -> impl Iterator<Item = PathBuf> {
    WalkDir::new(root)
        .follow_links(true)
        .into_iter()
        .filter_entry(|entry| entry.depth() == 0 || !is_pruned_dir(entry.file_name()))
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_dir())
        .map(walkdir::DirEntry::into_path)
}

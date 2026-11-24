use std::collections::HashSet;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use super::super::subtitles_beside::SubtitleFiles;
use super::WalkEntry;

const TEXT_SUBTITLES: [&str; 5] = ["srt", "ass", "ssa", "vtt", "webvtt"];

pub(super) struct Descent {
    root: PathBuf,
    abs_root: PathBuf,
    descended: Mutex<HashSet<PathBuf>>,
    subtitles: SubtitleFiles,
}

impl Descent {
    pub(super) fn new(root: &Path, abs_root: &Path, subtitles: SubtitleFiles) -> Self {
        Self {
            root: root.to_path_buf(),
            abs_root: abs_root.to_path_buf(),
            descended: Mutex::new(HashSet::from([abs_root.to_path_buf()])),
            subtitles,
        }
    }

    pub(super) fn note_subtitles(&self, children: &[jwalk::Result<WalkEntry>]) {
        let found = children
            .iter()
            .flatten()
            .filter(|e| e.file_type().is_file() && is_text_subtitle(&e.file_name))
            .map(|e| self.abs_root.join(e.path().trim_prefix(&self.root)))
            .collect();
        self.subtitles.add(found);
    }

    pub(super) fn already_walked_link(&self, e: &WalkEntry) -> bool {
        e.depth > 0
            && e.file_type().is_dir()
            && e.path_is_symlink()
            && !self.first_descent(&e.path())
    }

    // jwalk's own guard compares a symlink's raw target against the ancestor paths,
    // so `link -> /abs/ancestor` is caught and `link -> .` is not: the kernel's
    // 32-symlink ceiling then bounds the depth, which two such links in one
    // directory turn into 2^32 paths.
    fn first_descent(&self, dir: &Path) -> bool {
        let Ok(resolved) = dir.canonicalize() else {
            return false;
        };
        match self.descended.lock() {
            Ok(mut seen) => seen.insert(resolved),
            Err(poisoned) => poisoned.into_inner().insert(resolved),
        }
    }
}

fn is_text_subtitle(name: &OsStr) -> bool {
    Path::new(name)
        .extension()
        .and_then(OsStr::to_str)
        .is_some_and(|ext| {
            TEXT_SUBTITLES
                .iter()
                .any(|text| ext.eq_ignore_ascii_case(text))
        })
}

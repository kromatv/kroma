use std::collections::HashSet;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::services::art_beside::PICTURES;

use super::super::found::Beside;
use super::WalkEntry;

const TEXT_SUBTITLES: [&str; 5] = ["srt", "ass", "ssa", "vtt", "webvtt"];
const SIDECARS: [&[&str]; 3] = [&TEXT_SUBTITLES, &PICTURES, &["nfo"]];

pub(super) struct Descent {
    root: PathBuf,
    abs_root: PathBuf,
    descended: Mutex<HashSet<PathBuf>>,
    beside: Beside,
}

impl Descent {
    pub(super) fn new(root: &Path, abs_root: &Path, beside: Beside) -> Self {
        Self {
            root: root.to_path_buf(),
            abs_root: abs_root.to_path_buf(),
            descended: Mutex::new(HashSet::from([abs_root.to_path_buf()])),
            beside,
        }
    }

    pub(super) fn note_beside(&self, children: &[jwalk::Result<WalkEntry>]) {
        let mut found: [Vec<PathBuf>; 3] = Default::default();
        for e in children
            .iter()
            .flatten()
            .filter(|e| e.file_type().is_file())
        {
            let kind = SIDECARS
                .iter()
                .position(|extensions| has_extension(&e.file_name, extensions));
            if let Some(kind) = kind {
                found[kind].push(self.abs_root.join(e.path().trim_prefix(&self.root)));
            }
        }
        let [subtitles, pictures, nfos] = found;
        self.beside.subtitles.add(subtitles);
        self.beside.pictures.add(pictures);
        self.beside.nfos.add(nfos);
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

fn has_extension(name: &OsStr, extensions: &[&str]) -> bool {
    Path::new(name)
        .extension()
        .and_then(OsStr::to_str)
        .is_some_and(|ext| {
            extensions
                .iter()
                .any(|known| ext.eq_ignore_ascii_case(known))
        })
}

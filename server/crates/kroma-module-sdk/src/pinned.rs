use std::fs::OpenOptions;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use kroma_http::Fetch;
use kroma_primitives::sha256_file;

const LOCK_EXPIRES: Duration = Duration::from_secs(2 * 60 * 60);

/// One file a module downloads, and the sha256 its bytes must have.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PinnedFile<'a> {
    pub name: &'a str,
    pub sha256: &'a str,
}

/// Whether `dir` holds `file` with exactly its pinned bytes.
pub fn holds(dir: &Path, file: &PinnedFile<'_>) -> bool {
    hashes_to(&dir.join(file.name), file.sha256)
}

/// Make `dir` hold `file`, downloading it from `url` with `fetch` when it does
/// not. Bytes that are not the pinned ones are deleted, never installed. One
/// caller downloads a given file at a time: another finds it busy and gets
/// `false`, as it does when the download fails.
pub fn ensure(dir: &Path, file: &PinnedFile<'_>, url: &str, fetch: &dyn Fn(&str, &Path) -> bool) -> bool {
    if holds(dir, file) {
        return true;
    }
    let Some(_lock) = Lock::take(&dir.join(format!("{}.lock", file.name))) else {
        return false;
    };
    if holds(dir, file) {
        return true;
    }
    let dest = dir.join(file.name);
    let _ = std::fs::remove_file(&dest);
    let part = dir.join(format!("{}.part", file.name));
    if !fetch(url, &part) || !hashes_to(&part, file.sha256) {
        let _ = std::fs::remove_file(&part);
        return false;
    }
    std::fs::rename(&part, &dest).is_ok()
}

/// The fetch [`ensure`] takes outside a test: `purpose` names the `net.connect`
/// entry the module declared for it, and a download may run `max_secs`.
pub fn download(purpose: &'static str, max_secs: u32) -> impl Fn(&str, &Path) -> bool {
    move |url, dest| {
        Fetch::new()
            .purpose(purpose)
            .max_time(max_secs)
            .download(url, dest)
            .is_ok_and(|response| response.ensure_ok().is_ok())
    }
}

fn hashes_to(path: &Path, sha256: &str) -> bool {
    sha256_file(path).is_ok_and(|actual| actual == sha256)
}

struct Lock(PathBuf);

impl Lock {
    fn take(path: &Path) -> Option<Self> {
        if Self::create(path) {
            return Some(Self(path.to_path_buf()));
        }
        let expired = std::fs::metadata(path)
            .and_then(|meta| meta.modified())
            .ok()
            .and_then(|at| SystemTime::now().duration_since(at).ok())
            .is_some_and(|age| age >= LOCK_EXPIRES);
        (expired && std::fs::remove_file(path).is_ok() && Self::create(path)).then(|| Self(path.to_path_buf()))
    }

    fn create(path: &Path) -> bool {
        OpenOptions::new().write(true).create_new(true).open(path).is_ok()
    }
}

impl Drop for Lock {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

#[cfg(test)]
mod tests;

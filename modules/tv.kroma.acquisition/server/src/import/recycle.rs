//! Where a file an upgrade replaced goes: into the recycle bin when one is set,
//! kept there for a number of days, or straight away when none is.

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use kroma_module_sdk::host::HostCtx;
use kroma_module_sdk::media::external_subtitles::beside;

/// What became of a replaced file.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Retired {
    Deleted,
    Recycled(PathBuf),
}

pub(super) fn retire_with_subtitles(host: &dyn HostCtx, video: &Path) -> std::io::Result<Retired> {
    for subtitle in subtitles_of(video) {
        if let Err(e) = retire(host, &subtitle) {
            tracing::warn!(file = %subtitle.display(), "a subtitle file stayed behind: {e}");
        }
    }
    retire(host, video)
}

fn subtitles_of(video: &Path) -> Vec<PathBuf> {
    let folder = video.parent().unwrap_or_else(|| Path::new("."));
    let siblings: Vec<PathBuf> = std::fs::read_dir(folder)
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .collect();
    beside(video, &siblings)
        .into_iter()
        .map(|found| found.path)
        .collect()
}

/// Takes a replaced file out of the library.
pub(super) fn retire(host: &dyn HostCtx, path: &Path) -> std::io::Result<Retired> {
    let bin = host.setting_str("acqRecycleBin", "");
    if bin.trim().is_empty() {
        std::fs::remove_file(path)?;
        return Ok(Retired::Deleted);
    }
    let day = kroma_module_sdk::engine::services::requests::today_ymd();
    let into = Path::new(bin.trim()).join(day);
    std::fs::create_dir_all(&into)?;
    let target = free_name(&into, path);
    move_file(path, &target)?;
    Ok(Retired::Recycled(target))
}

fn free_name(dir: &Path, path: &Path) -> PathBuf {
    let name = path.file_name().map(PathBuf::from).unwrap_or_default();
    let mut target = dir.join(&name);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext = path.extension().and_then(|s| s.to_str());
    let mut n = 2;
    while target.exists() {
        let numbered = match ext {
            Some(ext) => format!("{stem} ({n}).{ext}"),
            None => format!("{stem} ({n})"),
        };
        target = dir.join(numbered);
        n += 1;
    }
    target
}

// A rename cannot cross filesystems, and a recycle bin on another disk than the
// library is the common case on a NAS: copy, then remove the original.
fn move_file(from: &Path, to: &Path) -> std::io::Result<()> {
    if std::fs::rename(from, to).is_err() {
        std::fs::copy(from, to)?;
        std::fs::remove_file(from)?;
    }
    if let Err(e) = touch(to) {
        tracing::warn!(file = %to.display(), "the recycled file kept its old date: {e}");
    }
    Ok(())
}

// Retention counts from the move, and a rename carries the file's own date,
// which is the day it was imported: a file older than the retention would be
// cleared on the next pass.
fn touch(path: &Path) -> std::io::Result<()> {
    std::fs::OpenOptions::new()
        .write(true)
        .open(path)?
        .set_modified(SystemTime::now())
}

/// Clears what has sat in the recycle bin longer than `acqRecycleDays`.
pub fn empty_recycle_bin(host: &dyn HostCtx) -> usize {
    let bin = host.setting_str("acqRecycleBin", "");
    if bin.trim().is_empty() {
        return 0;
    }
    let days = host.setting_i64("acqRecycleDays", 30).max(1) as u64;
    let older_than = SystemTime::now() - Duration::from_secs(days * 24 * 60 * 60);
    let mut removed = 0;
    for entry in walkdir::WalkDir::new(bin.trim())
        .min_depth(1)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file())
    {
        let stale = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .is_some_and(|at| at < older_than);
        if stale && std::fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }
    removed
}

#[cfg(test)]
mod tests {
    use super::*;
    use kroma_module_sdk::engine::services::requests::today_ymd;
    use kroma_module_sdk::host::testing::StubHost;

    fn dir(tag: &str) -> kroma_module_sdk::testing::TempDir {
        kroma_module_sdk::testing::temp_dir(tag)
    }

    #[test]
    fn with_no_recycle_bin_a_replaced_file_is_deleted() {
        let lib = dir("recycle-none");
        let file = lib.path().join("Film 1080p.mkv");
        std::fs::write(&file, b"x").unwrap();

        let retired = retire(&StubHost::new(), &file).unwrap();

        assert_eq!(retired, Retired::Deleted);
        assert!(!file.exists());
    }

    #[test]
    fn with_a_recycle_bin_a_replaced_file_is_moved_under_the_day() {
        let lib = dir("recycle-lib");
        let bin = dir("recycle-bin");
        let host = StubHost::new().with_setting(
            "acqRecycleBin",
            serde_json::json!(bin.path().to_string_lossy()),
        );
        let file = lib.path().join("Film 1080p.mkv");
        std::fs::write(&file, b"x").unwrap();

        let Retired::Recycled(at) = retire(&host, &file).unwrap() else {
            panic!("expected the file in the bin");
        };

        assert!(!file.exists());
        assert!(at.starts_with(bin.path()));
        assert_eq!(std::fs::read(&at).unwrap(), b"x");
    }

    #[test]
    fn a_second_file_of_the_same_name_does_not_overwrite_the_first() {
        let lib = dir("recycle-twice-lib");
        let bin = dir("recycle-twice-bin");
        let host = StubHost::new().with_setting(
            "acqRecycleBin",
            serde_json::json!(bin.path().to_string_lossy()),
        );
        let file = lib.path().join("Film.mkv");
        std::fs::write(&file, b"one").unwrap();
        let first = retire(&host, &file).unwrap();
        std::fs::write(&file, b"two").unwrap();

        let second = retire(&host, &file).unwrap();

        assert_ne!(first, second);
    }

    #[test]
    fn a_file_older_than_the_retention_survives_the_cleanup_that_follows_its_move() {
        let lib = dir("recycle-old-lib");
        let bin = dir("recycle-old-bin");
        let host = StubHost::new().with_setting(
            "acqRecycleBin",
            serde_json::json!(bin.path().to_string_lossy()),
        );
        let file = lib.path().join("Film 1080p.mkv");
        std::fs::write(&file, b"x").unwrap();
        let long_ago = SystemTime::now() - Duration::from_secs(90 * 24 * 60 * 60);
        std::fs::OpenOptions::new()
            .write(true)
            .open(&file)
            .unwrap()
            .set_modified(long_ago)
            .unwrap();

        let Retired::Recycled(at) = retire(&host, &file).unwrap() else {
            panic!("expected the file in the bin");
        };

        assert_eq!(empty_recycle_bin(&host), 0);
        assert!(at.exists());
    }

    #[test]
    fn the_subtitles_of_a_replaced_file_follow_it_out_of_the_library() {
        let lib = dir("recycle-subs-lib");
        let bin = dir("recycle-subs-bin");
        let host = StubHost::new().with_setting(
            "acqRecycleBin",
            serde_json::json!(bin.path().to_string_lossy()),
        );
        let film = lib.path().join("Film 1080p.mkv");
        let subtitle = lib.path().join("Film 1080p.fr.srt");
        std::fs::write(&film, b"x").unwrap();
        std::fs::write(&subtitle, b"1\n00:00:01,000 --> 00:00:02,000\nbonjour\n").unwrap();

        retire_with_subtitles(&host, &film).unwrap();

        assert!(!film.exists());
        assert!(!subtitle.exists(), "the subtitle named a file that is gone");
        assert_eq!(
            std::fs::read_dir(bin.path().join(today_ymd()))
                .unwrap()
                .count(),
            2
        );
    }

    #[test]
    fn a_fresh_file_survives_emptying_the_bin() {
        let bin = dir("recycle-fresh");
        let host = StubHost::new().with_setting(
            "acqRecycleBin",
            serde_json::json!(bin.path().to_string_lossy()),
        );
        std::fs::write(bin.path().join("kept.mkv"), b"x").unwrap();

        let removed = empty_recycle_bin(&host);

        assert_eq!(removed, 0);
        assert!(bin.path().join("kept.mkv").exists());
    }
}

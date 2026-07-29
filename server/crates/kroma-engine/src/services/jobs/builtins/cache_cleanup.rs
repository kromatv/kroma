//! `cache.cleanup` report the on-demand HLS segment cache size (trimmed live by
//! infra::hls against the `transcodeCacheLimit` byte budget - idle / superseded
//! sessions evicted oldest-first, live ones untouched - so no manual wipe here),
//! then enforce the `cacheLimit` budget on the poster/backdrop image cache (never
//! auto-wiped expensive to refetch so it grows unbounded without this; trimmed
//! oldest-first when over the limit).

use std::collections::HashSet;
use std::path::Path;

use super::prelude::*;

/// Nightly maintenance: report the HLS cache footprint + trim the image cache.
pub(super) const SPEC: Builtin = Builtin {
    key: JobKey("cache.cleanup"),
    category: Category::Maintenance,
    schedule: Some("0 4 * * *"),
    triggers: &[],
    run,
};

pub(super) fn run(ctx: &JobContext) -> Result<()> {
    let data_dir = &ctx.state.config.data_dir;

    // 1) The HLS segment cache trims itself live against its byte budget (see
    // infra::hls); we just report its current footprint. Every segment is
    // regenerable, so there is nothing to protect or wipe here.
    let budget = crate::services::settings::transcode_cache_limit_bytes(&ctx.state.settings);
    let limit = if budget == 0 { "unlimited".to_string() } else { human_bytes(budget) };
    ctx.info(format!("HLS segment cache: {} / {limit} budget", human_bytes(ctx.state.hls.cache_bytes())));

    // 2) Enforce the image-cache budget (`cacheLimit`).
    enforce_image_limit(ctx, &data_dir.join("images"));
    Ok(())
}

/// Trim the poster/backdrop image cache to the configured `cacheLimit`, deleting
/// oldest files first. "Illimité"/"Unlimited" (or any non-numeric value) disables
/// trimming. A deleted poster is re-downloaded on the next enrichment.
/// The file name a stored image URL points at, ignoring any `?w=` rendition
/// suffix - the renditions are derived and may be trimmed freely.
fn basename(url: &str) -> Option<String> {
    let path = url.split('?').next()?;
    path.rsplit('/').next().map(str::to_owned)
}

fn enforce_image_limit(ctx: &JobContext, images: &Path) {
    let label = ctx.state.settings.get_str("cacheLimit", "80 Go");
    let Some(limit) = parse_limit_bytes(&label) else {
        ctx.info(format!("image cache limit “{label}” → no trimming"));
        return;
    };
    let used = dir_size(images);
    if used <= limit {
        ctx.info(format!("image cache {} within limit {}", human_bytes(used), human_bytes(limit)));
        return;
    }

    // Uploaded images live in this same dir (image::store_upload) but are NOT
    // regenerable art, so never trim a file something still references it would
    // 404 with no way to refetch. Two sources: account avatars, and the images
    // attached to notifications still sitting in someone's centre.
    //
    // Every read here must SUCCEED before anything is deleted. An incomplete
    // protected set is indistinguishable from "nothing is referenced", and the
    // trimmer would then delete uploads that cannot be re-fetched from anywhere -
    // `store_upload` is their only producer and the source bytes are long gone.
    // The failure is likeliest exactly when this job runs: a nightly sweep on a
    // busy server, with the pool contended. Skipping the trim costs disk until
    // tomorrow; getting it wrong costs images that 404 forever.
    let Ok(conn) = ctx.state.db.get() else {
        ctx.info("image cache: no database connection, skipping the trim".to_string());
        return;
    };
    let (Ok(avatars), Ok(attached)) = (
        crate::db::avatar_urls(&ctx.state.db),
        crate::db::notifications::referenced_images(&conn),
    ) else {
        ctx.info("image cache: could not read the referenced images, skipping the trim".to_string());
        return;
    };
    let protected: HashSet<String> =
        avatars.iter().chain(attached.iter()).filter_map(|u| basename(u)).collect();

    // Oldest-first by mtime: least-recently fetched art is evicted first.
    let mut files: Vec<(std::path::PathBuf, u64, std::time::SystemTime)> =
        walkdir::WalkDir::new(images)
            .into_iter()
            .filter_map(std::result::Result::ok)
            .filter(|e| e.file_type().is_file())
            .filter(|e| {
                !e.path()
                    .file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| protected.contains(n))
            })
            .filter_map(|e| {
                let m = e.metadata().ok()?;
                Some((e.path().to_path_buf(), m.len(), m.modified().ok()?))
            })
            .collect();
    files.sort_by_key(|(_, _, mtime)| *mtime);

    let (mut remaining, mut freed, mut removed) = (used, 0u64, 0usize);
    for (path, size, _) in files {
        if remaining <= limit || ctx.cancelled() {
            break;
        }
        if std::fs::remove_file(&path).is_ok() {
            remaining = remaining.saturating_sub(size);
            freed += size;
            removed += 1;
        }
    }
    ctx.info(format!(
        "image cache over limit ({} > {}) trimmed {} across {removed} files (now {})",
        human_bytes(used),
        human_bytes(limit),
        human_bytes(freed),
        human_bytes(remaining),
    ));
}

/// Parse a cache-limit label (`"80 Go"`, `"256 Go"`, `"Illimité"`, …) into a byte
/// budget. `None` = unlimited / unparseable → no trimming. Labels use decimal
/// "Go" (gigaoctets), so 1 Go = 1e9 bytes.
fn parse_limit_bytes(label: &str) -> Option<u64> {
    let digits: String = label.chars().take_while(|c| !c.is_alphabetic()).filter(char::is_ascii_digit).collect();
    match digits.parse::<u64>() {
        Ok(n) if n > 0 => Some(n * 1_000_000_000),
        _ => None,
    }
}

/// Recursive byte size of a directory tree (0 if missing).
fn dir_size(path: &Path) -> u64 {
    walkdir::WalkDir::new(path)
        .into_iter()
        .filter_map(std::result::Result::ok)
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum()
}

/// Compact human byte size for log lines (e.g. `1.4 GB`).
fn human_bytes(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut size = bytes as f64;
    let mut unit = 0;
    while size >= 1024.0 && unit < UNITS.len() - 1 {
        size /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} B")
    } else {
        format!("{size:.1} {}", UNITS[unit])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    use crate::services::jobs::JobContext;
    use crate::state::SharedState;
    use crate::test_support::test_state;

    /// Set the cache-limit label the trimmer reads.
    fn set_limit(state: &SharedState, label: &str) {
        state.settings.set_patch(
            &state.db,
            BTreeMap::from([("cacheLimit".to_string(), serde_json::json!(label))]),
        );
    }

    #[test]
    fn parse_limit_bytes_reads_leading_gigabytes() {
        assert_eq!(parse_limit_bytes("80 Go"), Some(80_000_000_000));
        assert_eq!(parse_limit_bytes("256 Go"), Some(256_000_000_000));
        // Non-numeric / zero / empty labels mean "unlimited" -> no budget.
        assert_eq!(parse_limit_bytes("Illimité"), None);
        assert_eq!(parse_limit_bytes("0 Go"), None);
        assert_eq!(parse_limit_bytes(""), None);
    }

    #[test]
    fn human_bytes_scales_units() {
        assert_eq!(human_bytes(0), "0 B");
        assert_eq!(human_bytes(512), "512 B");
        assert_eq!(human_bytes(1024), "1.0 KB");
        assert_eq!(human_bytes(1536), "1.5 KB");
        assert_eq!(human_bytes(1024 * 1024), "1.0 MB");
        assert_eq!(human_bytes(1_500_000_000), "1.4 GB");
    }

    #[test]
    fn dir_size_sums_files_recursively_and_zero_when_missing() {
        use std::sync::atomic::{AtomicU32, Ordering};
        static SEQ: AtomicU32 = AtomicU32::new(0);
        let n = SEQ.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("kroma-dirsize-{}-{n}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        // A path that does not exist sums to zero.
        assert_eq!(dir_size(&dir), 0);

        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("a.bin"), b"abc").unwrap(); // 3 bytes
        std::fs::write(dir.join("sub/b.bin"), b"hello").unwrap(); // 5 bytes
        assert_eq!(dir_size(&dir), 8);

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// A file whose LOGICAL length is `len` but which occupies almost nothing on
    /// disk. The trimmer only ever reads `metadata().len()`, so this exercises a
    /// multi-gigabyte cache honestly without writing gigabytes - the smallest
    /// budget the label parser can express is 1 Go.
    fn sparse(path: &std::path::Path, len: u64, mtime_rank: u64) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        let f = std::fs::File::create(path).unwrap();
        f.set_len(len).unwrap();
        drop(f);
        // Distinct, ordered mtimes so "oldest first" is a defined order rather
        // than whatever the filesystem happened to record.
        let when = std::time::SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(mtime_rank);
        let f = std::fs::File::options().write(true).open(path).unwrap();
        f.set_times(std::fs::FileTimes::new().set_modified(when)).unwrap();
    }

    fn images_dir(state: &crate::state::SharedState) -> std::path::PathBuf {
        let dir = state.config.data_dir.join("images");
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn names(dir: &std::path::Path) -> Vec<String> {
        let mut v: Vec<String> = std::fs::read_dir(dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        v.sort();
        v
    }

    const GB: u64 = 1_000_000_000;

    #[test]
    fn an_unlimited_label_trims_nothing() {
        let state = test_state();
        set_limit(&state, "Illimité");
        let images = images_dir(&state);
        sparse(&images.join("a.jpg"), 5 * GB, 1);

        enforce_image_limit(&JobContext::for_test(state.clone()), &images);
        // Unparseable means "no budget", not "zero budget" - the opposite reading
        // would wipe the whole cache the moment someone typed a word.
        assert_eq!(names(&images), vec!["a.jpg"]);
    }

    #[test]
    fn a_cache_within_budget_is_left_alone() {
        let state = test_state();
        set_limit(&state, "80 Go");
        let images = images_dir(&state);
        sparse(&images.join("a.jpg"), 1024, 1);

        enforce_image_limit(&JobContext::for_test(state.clone()), &images);
        assert_eq!(names(&images), vec!["a.jpg"]);
    }

    #[test]
    fn over_budget_evicts_the_oldest_first() {
        let state = test_state();
        set_limit(&state, "2 Go");
        let images = images_dir(&state);
        sparse(&images.join("old.jpg"), 1500 * 1_000_000, 1);
        sparse(&images.join("new.jpg"), 1500 * 1_000_000, 9);

        enforce_image_limit(&JobContext::for_test(state.clone()), &images);
        // Least-recently-fetched art goes first; 3 Go - 1.5 Go is under the 2 Go
        // budget, so exactly one file is evicted.
        assert_eq!(names(&images), vec!["new.jpg"]);
    }

    #[test]
    fn never_evicts_an_avatar_an_account_still_references() {
        let state = test_state();
        set_limit(&state, "1 Go");
        let images = images_dir(&state);
        // NEVER, not "usually": the avatar is the OLDEST here, so a trimmer that
        // only sorted by mtime would take it out first.
        sparse(&images.join("avatar.png"), 1500 * 1_000_000, 1);
        sparse(&images.join("poster.jpg"), 1500 * 1_000_000, 9);

        let user = kroma_db::create_user(&state.db, "a@b.c", "A", "h", &[]).unwrap();
        crate::db::set_user_avatar(&state.db, &user.id, Some("/images/avatar.png")).unwrap();

        enforce_image_limit(&JobContext::for_test(state.clone()), &images);
        // Uploaded avatars share this directory with poster art but are NOT
        // regenerable: deleting one 404s the avatar with no way to refetch it.
        // So the poster goes instead, even though it is newer.
        assert_eq!(names(&images), vec!["avatar.png"]);
    }

    #[test]
    fn stops_trimming_when_cancelled() {
        let state = test_state();
        set_limit(&state, "1 Go");
        let images = images_dir(&state);
        sparse(&images.join("a.jpg"), 1500 * 1_000_000, 1);
        sparse(&images.join("b.jpg"), 1500 * 1_000_000, 2);

        let handle = std::sync::Arc::new(crate::services::jobs::RunHandle::new(
            "test-run".into(),
            "cache.cleanup".into(),
        ));
        handle.request_cancel();
        enforce_image_limit(&JobContext::from_handle(state.clone(), handle), &images);
        // An admin cancelling mid-trim leaves the cache large rather than
        // half-deleted at some arbitrary point.
        assert_eq!(names(&images), vec!["a.jpg", "b.jpg"]);
    }

    #[test]
    fn the_job_runs_end_to_end() {
        let state = test_state();
        set_limit(&state, "80 Go");
        images_dir(&state);
        // Reports the HLS footprint and enforces the image budget; neither half
        // may fail the nightly maintenance run.
        run(&JobContext::for_test(state)).unwrap();
    }
}

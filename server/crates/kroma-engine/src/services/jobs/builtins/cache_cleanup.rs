//! `cache.cleanup`: reports the HLS segment cache footprint (trimmed live
//! elsewhere) and enforces the `cacheLimit` budget on the poster/backdrop
//! image cache, evicting oldest-first.

use std::collections::HashSet;
use std::path::Path;

use super::prelude::*;

pub(super) const SPEC: Builtin = Builtin {
    key: JobKey("cache.cleanup"),
    category: Category::Maintenance,
    schedule: Some("0 4 * * *"),
    triggers: &[],
    run,
};

pub(super) fn run(ctx: &JobContext) -> Result<()> {
    let data_dir = &ctx.state.config.data_dir;

    let budget = crate::services::settings::transcode_cache_limit_bytes(&ctx.state.settings);
    let limit = if budget == 0 { "unlimited".to_string() } else { human_bytes(budget) };
    ctx.info(format!("HLS segment cache: {} / {limit} budget", human_bytes(ctx.state.hls.cache_bytes())));

    enforce_image_limit(ctx, &data_dir.join("images"));
    Ok(())
}

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

    // Avatars and notification images live in this dir but aren't regenerable;
    // deleting one 404s it forever. Both reads must succeed before any deletion -
    // a partial protected set is indistinguishable from "nothing is referenced".
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

fn parse_limit_bytes(label: &str) -> Option<u64> {
    let digits: String = label.chars().take_while(|c| !c.is_alphabetic()).filter(char::is_ascii_digit).collect();
    match digits.parse::<u64>() {
        // Decimal Go (1 Go = 1e9 B), not binary.
        Ok(n) if n > 0 => Some(n * 1_000_000_000),
        _ => None,
    }
}

fn dir_size(path: &Path) -> u64 {
    walkdir::WalkDir::new(path)
        .into_iter()
        .filter_map(std::result::Result::ok)
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum()
}

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
        let root = kroma_testing::temp_dir("dirsize");
        let dir = root.path().join("cache");

        assert_eq!(dir_size(&dir), 0);

        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("a.bin"), b"abc").unwrap();
        std::fs::write(dir.join("sub/b.bin"), b"hello").unwrap();
        assert_eq!(dir_size(&dir), 8);
    }

    // A sparse file: `len` bytes reported by metadata, near-zero bytes on disk -
    // exercises a multi-gigabyte cache without writing gigabytes.
    fn sparse(path: &std::path::Path, len: u64, mtime_rank: u64) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        let f = std::fs::File::create(path).unwrap();
        f.set_len(len).unwrap();
        drop(f);
        // Explicit mtimes make "oldest first" deterministic instead of whatever
        // the filesystem recorded.
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
        // Unparseable = no budget, not zero budget - the reverse would wipe the
        // cache on a typo.
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
        // 3 Go total - 1.5 Go is under the 2 Go budget, so exactly one is evicted.
        assert_eq!(names(&images), vec!["new.jpg"]);
    }

    #[test]
    fn never_evicts_an_avatar_an_account_still_references() {
        let state = test_state();
        set_limit(&state, "1 Go");
        let images = images_dir(&state);
        // Avatar is the OLDEST file here, so a naive mtime-only trim would evict
        // it first.
        sparse(&images.join("avatar.png"), 1500 * 1_000_000, 1);
        sparse(&images.join("poster.jpg"), 1500 * 1_000_000, 9);

        let user = kroma_db::create_user(&state.db, "a@b.c", "A", "h", &[]).unwrap();
        crate::db::set_user_avatar(&state.db, &user.id, Some("/images/avatar.png")).unwrap();

        enforce_image_limit(&JobContext::for_test(state.clone()), &images);
        // Avatars aren't regenerable, so the poster is evicted instead despite
        // being newer.
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
        assert_eq!(names(&images), vec!["a.jpg", "b.jpg"]);
    }

    #[test]
    fn the_job_runs_end_to_end() {
        let state = test_state();
        set_limit(&state, "80 Go");
        images_dir(&state);
        run(&JobContext::for_test(state)).unwrap();
    }
}

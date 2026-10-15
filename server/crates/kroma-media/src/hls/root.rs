use std::path::Path;

use tracing::warn;

// The engine empties its root on construction, so it has to be sure the root is
// its own: a caller who handed it a data directory instead would otherwise have
// the lot deleted.
const SENTINEL: &str = ".kroma-hls";

pub(super) fn empty_our_own(root: &Path) {
    if !ours(root) {
        warn!(root = %root.display(), "left an HLS root that holds something else");
        return;
    }
    let _ = std::fs::remove_dir_all(root);
    if std::fs::create_dir_all(root).is_ok() {
        let _ = std::fs::write(root.join(SENTINEL), b"");
    }
}

fn ours(root: &Path) -> bool {
    if root.join(SENTINEL).exists() {
        return true;
    }
    match std::fs::read_dir(root) {
        Ok(mut entries) => entries.next().is_none(),
        Err(_) => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_root_this_engine_wrote_before_is_emptied_and_claimed_again() {
        let data = kroma_testing::temp_dir("hls-root-ours");
        let root = data.path().join("hls");
        empty_our_own(&root);
        std::fs::write(root.join("seg_00001.m4s"), b"x").expect("a segment");

        empty_our_own(&root);

        assert!(!root.join("seg_00001.m4s").exists());
        assert!(root.join(SENTINEL).exists());
    }

    #[test]
    fn a_directory_holding_someone_elses_files_is_left_alone() {
        let data = kroma_testing::temp_dir("hls-root-theirs");
        let root = data.path().join("data");
        std::fs::create_dir_all(root.join("modules")).expect("the data dir");
        std::fs::write(root.join("kroma.sqlite"), b"x").expect("the database");

        empty_our_own(&root);

        assert!(root.join("kroma.sqlite").exists());
        assert!(root.join("modules").exists());
        assert!(!root.join(SENTINEL).exists());
    }
}

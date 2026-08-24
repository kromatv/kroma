//! Scratch directories for test harnesses, owned by a guard.
//!
//! A hand-built `env::temp_dir().join(pid)` is a path, not a resource: nothing
//! removes it when the test ends, panics, or is killed. A [`TempDir`] goes when
//! its holder drops, unwinding included.

pub use tempfile::TempDir;

/// A fresh, empty directory under `$TMPDIR`, named `kroma-<tag>-<random>` so a
/// stray one is still identifiable.
///
/// The directory is removed when the returned guard drops, so bind the guard
/// for as long as the path is used: a caller that keeps only `path()` is
/// holding a directory that is already gone.
pub fn temp_dir(tag: &str) -> TempDir {
    tempfile::Builder::new()
        .prefix(&format!("kroma-{tag}-"))
        .tempdir()
        .expect("create temp dir")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_directory_exists_while_the_guard_does_and_not_after() {
        let path = {
            let dir = temp_dir("selftest");
            let path = dir.path().to_path_buf();
            assert!(path.is_dir());
            std::fs::write(path.join("payload"), b"x").expect("write into the temp dir");
            path
        };
        assert!(!path.exists(), "the guard dropped but left {path:?} behind");
    }

    #[test]
    fn two_guards_never_share_a_directory() {
        let a = temp_dir("selftest");
        let b = temp_dir("selftest");
        assert_ne!(a.path(), b.path());
    }

    #[test]
    fn a_panicking_test_still_takes_its_directory_with_it() {
        let leaked = std::panic::catch_unwind(|| {
            let dir = temp_dir("selftest-panic");
            let path = dir.path().to_path_buf();
            panic!("{}", path.display());
        })
        .unwrap_err();
        let path = leaked
            .downcast_ref::<String>()
            .expect("panicked with a String");
        assert!(
            !std::path::Path::new(path).exists(),
            "unwinding left {path} behind"
        );
    }

    #[test]
    fn the_name_says_which_harness_made_it() {
        let dir = temp_dir("scanroot");
        let name = dir
            .path()
            .file_name()
            .and_then(|n| n.to_str())
            .expect("a utf-8 name");
        assert!(name.starts_with("kroma-scanroot-"), "{name}");
    }
}

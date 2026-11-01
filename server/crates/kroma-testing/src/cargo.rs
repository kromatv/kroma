use std::ffi::OsStr;
use std::process::Command;

/// The cargo running this test, without the settings the test's own build
/// exported (flags, wrappers, coverage, target dir and triple), so a nested
/// build is set up by its own arguments alone.
pub fn cargo() -> Command {
    let mut command = Command::new(std::env::var_os("CARGO").unwrap_or_else(|| "cargo".into()));
    for (key, _) in std::env::vars_os() {
        if is_host_build_setting(&key) {
            command.env_remove(key);
        }
    }
    command
}

fn is_host_build_setting(key: &OsStr) -> bool {
    let Some(key) = key.to_str() else {
        return false;
    };
    key.ends_with("RUSTFLAGS")
        || key.ends_with("RUSTDOCFLAGS")
        || key.starts_with("CARGO_LLVM_COV")
        || matches!(
            key,
            "RUSTC_WRAPPER"
                | "RUSTC_WORKSPACE_WRAPPER"
                | "CARGO_TARGET_DIR"
                | "CARGO_BUILD_TARGET_DIR"
                | "CARGO_BUILD_TARGET"
                | "LLVM_PROFILE_FILE"
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_flags_wrappers_and_coverage_of_the_outer_build_are_dropped() {
        for key in [
            "RUSTFLAGS",
            "CARGO_ENCODED_RUSTFLAGS",
            "RUSTDOCFLAGS",
            "CARGO_LLVM_COV_TARGET_DIR",
            "RUSTC_WRAPPER",
            "RUSTC_WORKSPACE_WRAPPER",
            "CARGO_TARGET_DIR",
            "CARGO_BUILD_TARGET",
            "LLVM_PROFILE_FILE",
        ] {
            assert!(is_host_build_setting(OsStr::new(key)), "{key}");
        }
    }

    #[test]
    fn the_rest_of_the_environment_is_kept() {
        for key in ["PATH", "HOME", "CARGO_HOME", "RUSTUP_TOOLCHAIN"] {
            assert!(!is_host_build_setting(OsStr::new(key)), "{key}");
        }
    }

    #[test]
    fn it_runs_the_cargo_that_runs_the_tests() {
        let expected = std::env::var_os("CARGO").unwrap_or_else(|| "cargo".into());

        assert_eq!(cargo().get_program(), expected);
    }
}

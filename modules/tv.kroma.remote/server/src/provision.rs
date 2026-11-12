//! The `cloudflared` the connector runs. The manifest pins each platform's build,
//! and the host fetches and checks it.

use std::path::Path;

/// The name `permissions.run` and `helpers` declare it under.
pub(crate) const PROGRAM: &str = "cloudflared";

/// Have the host fetch the pinned build.
#[cfg(not(test))]
pub(crate) async fn fetch() -> Result<(), String> {
    use kroma_module_sdk::host::{process, run_blocking};

    run_blocking(|| process::ensure(PROGRAM))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
pub(crate) async fn fetch() -> Result<(), String> {
    Ok(())
}

/// Where a test puts its stand-in.
#[cfg(test)]
pub(crate) fn cached_path(data_dir: &Path) -> std::path::PathBuf {
    data_dir.join("bin").join(PROGRAM)
}

#[cfg(test)]
pub(crate) fn program(data_dir: &Path) -> String {
    let cached = cached_path(data_dir);
    if cached.is_file() {
        cached.to_string_lossy().into_owned()
    } else {
        PROGRAM.to_string()
    }
}

#[cfg(not(test))]
pub(crate) fn program(_data_dir: &Path) -> String {
    PROGRAM.to_string()
}

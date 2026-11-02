//! What WASI has no call for on the files a module holds.

use crate::outside::outside;

/// `path` with its symlinks resolved, the way the core's scanner keys a file.
/// `None` when it does not exist or is not in a folder this module holds.
pub fn canonical(path: &str) -> Option<String> {
    outside().ok()?.canonical(path)
}

/// Copy `source` to `destination`, as a reflink where the filesystem has them, so
/// a large file costs neither the module's time nor the disk's.
pub fn copy(source: &std::path::Path, destination: &std::path::Path) -> Result<u64, String> {
    outside()?.copy(&source.to_string_lossy(), &destination.to_string_lossy())
}

use std::path::{Path, PathBuf};

pub(super) fn finalize(tmp: &Path, out: &Path) -> Option<PathBuf> {
    kroma_media::tmp_file::finalize(tmp, out).then(|| out.to_path_buf())
}

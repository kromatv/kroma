use std::borrow::Cow;
use std::path::PathBuf;

use crate::registry::MAX_BUNDLE_BYTES;
use crate::LOCALES_DIR;

// Keeps only `Normal` path components (dropping `..` and absolute prefixes) and
// only allow-listed bundle files: an entry path must never escape the install dir.
fn sanitized_entry(raw: &std::path::Path) -> Option<PathBuf> {
    use std::path::Component;
    let safe: PathBuf = raw
        .components()
        .filter_map(|c| match c {
            Component::Normal(p) => Some(p),
            _ => None,
        })
        .collect();
    if safe.as_os_str().is_empty() {
        return None;
    }
    let rel = safe.to_string_lossy().replace('\\', "/");
    let allowed = matches!(
        rel.as_ref(),
        "module.json" | "module" | "module.wasm" | "icon.svg" | "icon.png"
    ) || rel.starts_with("fe/")
        || is_catalog(&rel);
    allowed.then_some(safe)
}

fn is_catalog(rel: &str) -> bool {
    rel.strip_prefix(LOCALES_DIR)
        .and_then(|rest| rest.strip_prefix('/'))
        .and_then(|file| file.strip_suffix(".json"))
        .is_some_and(|code| !code.is_empty() && !code.contains('/'))
}

// `.kmod` is a zstd tar; gzip (legacy) and raw tar are also accepted,
// dispatched by magic bytes.
pub(super) fn decompressed_tar(bytes: &[u8]) -> anyhow::Result<Cow<'_, [u8]>> {
    if bytes.starts_with(&[0x28, 0xb5, 0x2f, 0xfd]) {
        let decoder = ruzstd::decoding::StreamingDecoder::new(bytes)?;
        return Ok(Cow::Owned(read_bounded(decoder, MAX_TAR_BYTES)?));
    }
    if bytes.starts_with(&[0x1f, 0x8b]) {
        let decoder = flate2::read::GzDecoder::new(bytes);
        return Ok(Cow::Owned(read_bounded(decoder, MAX_TAR_BYTES)?));
    }
    Ok(Cow::Borrowed(bytes))
}

// [`MAX_BUNDLE_BYTES`] bounds the bytes that arrive, not what they expand to: a
// few megabytes of zstd unpack to gigabytes, so the tar is bounded on its own
// axis rather than read into memory whole.
const MAX_TAR_BYTES: u64 = 4 * MAX_BUNDLE_BYTES;

fn read_bounded(reader: impl std::io::Read, max_bytes: u64) -> anyhow::Result<Vec<u8>> {
    use std::io::Read as _;
    let mut out = Vec::new();
    let read = reader.take(max_bytes + 1).read_to_end(&mut out)? as u64;
    anyhow::ensure!(
        read <= max_bytes,
        "bundle expands past {max_bytes} bytes; refusing to install"
    );
    Ok(out)
}

pub(super) fn unpack_validated(tar_bytes: &[u8], dest: &std::path::Path) -> anyhow::Result<()> {
    let mut archive = tar::Archive::new(tar_bytes);
    archive.set_preserve_mtime(false);
    for entry in archive.entries()? {
        let mut entry = entry?;
        // Only ever write regular files: `sanitized_entry` rewrites an entry's
        // own path but not a link target, so a symlink passing the allow-list
        // would redirect a later write outside `dest`.
        if !entry.header().entry_type().is_file() {
            continue;
        }
        let raw = entry.path()?.into_owned();
        let Some(safe) = sanitized_entry(&raw) else {
            continue;
        };
        let out = dest.join(&safe);
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent)?;
        }
        entry.unpack(&out)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{read_bounded, sanitized_entry};

    #[test]
    fn a_bundle_may_carry_its_catalogs_and_nothing_else_beside_them() {
        assert!(sanitized_entry(Path::new("locales/fr.json")).is_some());
        assert!(sanitized_entry(Path::new("locales/en.json")).is_some());
        assert!(sanitized_entry(Path::new("locales/fr.txt")).is_none());
        assert!(sanitized_entry(Path::new("locales/nested/fr.json")).is_none());
        assert!(sanitized_entry(Path::new("locales/.json")).is_none());
        assert!(sanitized_entry(Path::new("locales")).is_none());
    }

    #[test]
    fn a_stream_that_expands_past_the_ceiling_is_refused_rather_than_read() {
        let err = read_bounded(std::io::repeat(0u8), 1024)
            .unwrap_err()
            .to_string();

        assert!(err.contains("expands past 1024 bytes"), "{err}");
    }

    #[test]
    fn a_stream_that_fits_the_ceiling_exactly_is_read_whole() {
        let body = vec![7u8; 1024];

        let read = read_bounded(body.as_slice(), 1024).unwrap();

        assert_eq!(read, body);
    }
}

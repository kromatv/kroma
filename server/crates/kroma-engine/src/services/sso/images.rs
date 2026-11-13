//! The pictures admins upload for provider buttons, kept as the bytes they
//! sent under a name made of their hash.

use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

/// The most an uploaded image may weigh.
pub const MAX_IMAGE_BYTES: usize = 256 * 1024;

fn images_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("sign-in")
}

/// The file extension of an image this server will keep, read from its first
/// bytes and never from what the upload called itself.
fn image_kind(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some("png");
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("jpg");
    }
    if bytes.len() > 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some("webp");
    }
    let text = std::str::from_utf8(bytes).ok()?.trim_start().to_ascii_lowercase();
    let is_svg = (text.starts_with("<svg") || text.starts_with("<?xml")) && text.contains("<svg");
    (is_svg && !text.contains("<script")).then_some("svg")
}

fn content_type(name: &str) -> &'static str {
    match name.rsplit('.').next() {
        Some("png") => "image/png",
        Some("jpg") => "image/jpeg",
        Some("webp") => "image/webp",
        _ => "image/svg+xml",
    }
}

/// Keeps `bytes` under a name made of their own hash, which is what a
/// provider then records. `None` for anything that is not a PNG, a JPEG, a
/// WebP or an SVG.
pub fn store_image(data_dir: &Path, bytes: &[u8]) -> anyhow::Result<Option<String>> {
    let Some(kind) = image_kind(bytes) else {
        return Ok(None);
    };
    let digest = hex::encode(Sha256::digest(bytes));
    let name = format!("{}.{kind}", &digest[..16]);
    let dir = images_dir(data_dir);
    std::fs::create_dir_all(&dir)?;
    std::fs::write(dir.join(&name), bytes)?;
    Ok(Some(name))
}

pub fn remove_image(data_dir: &Path, name: &str) {
    if is_stored_name(name) {
        let _ = std::fs::remove_file(images_dir(data_dir).join(name));
    }
}

fn is_stored_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'.')
        && !name.starts_with('.')
}

/// The stored image `name`, with its media type.
pub fn read_image(data_dir: &Path, name: &str) -> Option<(Vec<u8>, &'static str)> {
    if !is_stored_name(name) {
        return None;
    }
    let bytes = std::fs::read(images_dir(data_dir).join(name)).ok()?;
    Some((bytes, content_type(name)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_image_is_known_by_its_first_bytes() {
        assert_eq!(image_kind(b"\x89PNG\r\n\x1a\n...."), Some("png"));
        assert_eq!(image_kind(&[0xff, 0xd8, 0xff, 0xe0]), Some("jpg"));
        assert_eq!(image_kind(b"RIFF\x00\x00\x00\x00WEBPVP8 "), Some("webp"));
        assert_eq!(image_kind(b"  <svg xmlns=\"x\"></svg>"), Some("svg"));
        assert_eq!(
            image_kind(b"<?xml version=\"1.0\"?><svg></svg>"),
            Some("svg")
        );
    }

    #[test]
    fn anything_else_is_not_an_image_and_neither_is_an_svg_with_a_script() {
        assert_eq!(image_kind(b""), None);
        assert_eq!(image_kind(b"<html><svg></svg></html>"), None);
        assert_eq!(image_kind(b"GIF89a"), None);
        assert_eq!(image_kind(b"<svg><SCRIPT>alert(1)</SCRIPT></svg>"), None);
        assert_eq!(image_kind(b"<?xml version=\"1.0\"?><root/>"), None);
    }

    #[test]
    fn a_stored_image_is_read_back_under_its_own_name_and_type() {
        let dir = kroma_testing::temp_dir("sign-in-image");
        let png = b"\x89PNG\r\n\x1a\nrest";

        let name = store_image(dir.path(), png).unwrap().unwrap();

        assert!(name.ends_with(".png"));
        assert_eq!(
            read_image(dir.path(), &name),
            Some((png.to_vec(), "image/png"))
        );
        remove_image(dir.path(), &name);
        assert_eq!(read_image(dir.path(), &name), None);
    }

    #[test]
    fn a_name_that_could_leave_the_folder_reads_nothing() {
        let dir = kroma_testing::temp_dir("sign-in-image-names");
        std::fs::write(dir.path().join("secret.txt"), b"x").unwrap();

        for name in ["../secret.txt", "..", "", ".hidden", "a/b.png"] {
            assert_eq!(read_image(dir.path(), name), None, "{name}");
        }
    }
}

//! Artwork a provider hosts, served by this server instead.
//!
//! A discover or search result names its poster by the provider's own URL, and
//! a client that renders it tells the provider its address and what it
//! browsed. [`served`] turns that URL into a path on this server, signed so
//! only art this server named can be asked for, and [`fetch`] downloads it once
//! under the `artwork` purpose.

use std::path::{Path, PathBuf};

use kroma_media::tmp_file::{finalize, unique_tmp};

use crate::infra::image::{images_dir, PUBLIC_PREFIX};

/// Where the provider serves its images from.
pub const PROVIDER: &str = "https://image.tmdb.org/t/p/";

const FOLDER: &str = "tmdb";
const SIGNATURE_LEN: usize = 16;
const MAX_FILE_LEN: usize = 80;
const MAX_TIME_SECS: u32 = 25;
const MAX_BYTES: u64 = 32 * 1024 * 1024;

/// One image as the provider names it: a rendition (`w342`, `original`) and a
/// file name.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Art<'a> {
    pub size: &'a str,
    pub file: &'a str,
}

impl<'a> Art<'a> {
    /// Reads `<size>/<file>`, refusing anything that is not a rendition and a
    /// plain file name, so a path built from it never leaves its folder.
    pub fn parse(size: &'a str, file: &'a str) -> Option<Self> {
        let sized = size == "original"
            || size.strip_prefix(['w', 'h']).is_some_and(|digits| {
                (2..=4).contains(&digits.len()) && digits.bytes().all(|b| b.is_ascii_digit())
            });
        let (stem, extension) = file.rsplit_once('.')?;
        let named = !stem.is_empty()
            && file.len() <= MAX_FILE_LEN
            && stem.bytes().all(|b| b.is_ascii_alphanumeric())
            && matches!(extension, "jpg" | "jpeg" | "png" | "webp" | "svg");
        (sized && named).then_some(Self { size, file })
    }

    fn of_url(url: &'a str) -> Option<Self> {
        let (size, file) = url.strip_prefix(PROVIDER)?.split_once('/')?;
        Self::parse(size, file)
    }

    fn signature(&self, key: &str) -> String {
        let claim = format!("art:{}/{}", self.size, self.file);
        let mac = super::auth::hmac_sha256(key.as_bytes(), claim.as_bytes());
        hex::encode(mac)[..SIGNATURE_LEN].to_string()
    }

    /// Whether `signature` is the one this server gave this image.
    pub fn signed_by(&self, key: &str, signature: &str) -> bool {
        let expected = self.signature(key);
        signature.len() == expected.len()
            && signature
                .bytes()
                .zip(expected.bytes())
                .fold(0u8, |acc, (a, b)| acc | (a ^ b))
                == 0
    }

    /// The media type the file's extension names.
    pub fn content_type(&self) -> &'static str {
        match self.file.rsplit_once('.').map(|(_, extension)| extension) {
            Some("png") => "image/png",
            Some("webp") => "image/webp",
            Some("svg") => "image/svg+xml",
            _ => "image/jpeg",
        }
    }
}

/// The path on this server that answers for the provider image at `url`, or
/// `None` when `url` is not one of the provider's images.
pub fn served(key: &str, url: &str) -> Option<String> {
    let art = Art::of_url(url)?;
    Some(format!(
        "{PUBLIC_PREFIX}{FOLDER}/{}/{}/{}",
        art.signature(key),
        art.size,
        art.file
    ))
}

/// `document` with every provider image URL in it replaced by its [`served`]
/// path, or `None` when it names none. Works on the text of a JSON document,
/// where a URL ends at the quote that closes its string.
pub fn rewrite(key: &str, document: &str) -> Option<String> {
    let mut at = document.find(PROVIDER)?;
    let mut out = String::with_capacity(document.len());
    let mut rest = document;
    loop {
        let (before, from) = rest.split_at(at);
        out.push_str(before);
        let end = from.find(['"', '\\', ' ']).unwrap_or(from.len());
        let url = &from[..end];
        match served(key, url) {
            Some(path) => out.push_str(&path),
            None => out.push_str(url),
        }
        rest = &from[end..];
        match rest.find(PROVIDER) {
            Some(next) => at = next,
            None => break,
        }
    }
    out.push_str(rest);
    Some(out)
}

/// The image on disk, downloaded from `provider` the first time it is asked
/// for. `None` when the provider could not be reached or does not have it.
pub fn fetch(data_dir: &Path, provider: &str, art: Art<'_>) -> Option<PathBuf> {
    let dir = images_dir(data_dir).join(FOLDER);
    let kept = dir.join(format!("{}-{}", art.size, art.file));
    if kept.exists() {
        return Some(kept);
    }
    std::fs::create_dir_all(&dir).ok()?;
    let tmp = unique_tmp(&kept);
    let downloaded = kroma_http::Fetch::new()
        .purpose("artwork")
        .max_time(MAX_TIME_SECS)
        .max_bytes(MAX_BYTES)
        .download(&format!("{provider}{}/{}", art.size, art.file), &tmp)
        .is_ok_and(|response| response.ensure_ok().is_ok())
        && tmp.exists();
    if !downloaded {
        let _ = std::fs::remove_file(&tmp);
        return None;
    }
    finalize(&tmp, &kept).then_some(kept)
}

#[cfg(test)]
mod tests;

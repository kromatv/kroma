//! Reading a `.torrent` an operator uploaded.

use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};

/// What one uploaded `.torrent` says about itself.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedTorrentFile {
    /// Lowercase hex of the v1 info hash.
    pub info_hash: String,
    /// The torrent's own name, which for a scene release is the release name.
    pub name: String,
    pub size_bytes: u64,
    pub trackers: Vec<String>,
    /// The magnet that stands for this file for engines that take no bytes.
    pub magnet: String,
}

fn encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char)
            }
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}

fn magnet_for(info_hash: &str, name: &str, trackers: &[String]) -> String {
    let mut magnet = format!("magnet:?xt=urn:btih:{info_hash}");
    if !name.is_empty() {
        magnet.push_str(&format!("&dn={}", encode(name)));
    }
    for tracker in trackers {
        magnet.push_str(&format!("&tr={}", encode(tracker)));
    }
    magnet
}

/// Bencode-decode an uploaded `.torrent`. Errors on anything that is not one,
/// which is the whole point: the bytes reached us over HTTP.
pub fn parse(bytes: &[u8]) -> Result<ParsedTorrentFile> {
    if bytes.is_empty() {
        bail!("the uploaded file is empty");
    }
    let meta = librqbit_core::torrent_metainfo::torrent_from_bytes(bytes)
        .map_err(|e| anyhow::anyhow!("{e}"))
        .context("this file is not a valid .torrent")?;
    let info = meta
        .info
        .data
        .clone()
        .validate()
        .map_err(|e| anyhow::anyhow!("{e}"))
        .context("this .torrent describes no files")?;
    let name = info.name().map(|n| n.to_string()).unwrap_or_default();
    let size_bytes = info.iter_file_lengths().sum();
    let trackers: Vec<String> = meta
        .iter_announce()
        .filter_map(|t| std::str::from_utf8(t.as_ref()).ok())
        .filter(|t| !t.is_empty())
        .map(str::to_string)
        .collect();
    let info_hash = meta.info_hash.as_string();
    let magnet = magnet_for(&info_hash, &name, &trackers);
    Ok(ParsedTorrentFile {
        info_hash,
        name,
        size_bytes,
        trackers,
        magnet,
    })
}

/// Where an uploaded `.torrent` is kept, keyed by info hash so re-uploading the
/// same torrent overwrites rather than accumulates.
pub fn upload_path(state_dir: &Path, info_hash: &str) -> PathBuf {
    state_dir.join("uploads").join(format!("{info_hash}.torrent"))
}

pub fn store(state_dir: &Path, info_hash: &str, bytes: &[u8]) -> Result<PathBuf> {
    let path = upload_path(state_dir, info_hash);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).context("create the .torrent upload directory")?;
    }
    std::fs::write(&path, bytes).context("save the uploaded .torrent")?;
    Ok(path)
}

/// The stored bytes for a magnet we minted from an upload, if we still hold
/// them. `None` is not an error: the engine falls back to resolving the magnet.
pub fn stored_bytes(state_dir: &Path, info_hash: Option<&str>) -> Option<Vec<u8>> {
    let hash = info_hash?;
    std::fs::read(upload_path(state_dir, hash)).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bstr(value: &str) -> String {
        format!("{}:{value}", value.len())
    }

    // A minimal single-file v1 torrent: one 16 KiB piece, one tracker. Built
    // rather than typed, because bencode counts its own bytes.
    fn sample() -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(
            format!(
                "d{}{}{}d{}i1024e{}{}{}i16384e{}20:",
                bstr("announce"),
                bstr(TRACKER),
                bstr("info"),
                bstr("length"),
                bstr("name"),
                bstr(NAME),
                bstr("piece length"),
                bstr("pieces"),
            )
            .as_bytes(),
        );
        out.extend_from_slice(&[0u8; 20]);
        out.extend_from_slice(b"ee");
        out
    }

    const TRACKER: &str = "http://tracker.test/announce";
    const NAME: &str = "Dune.2021.mkv";

    #[test]
    fn a_torrent_file_yields_its_hash_name_size_and_a_magnet_standing_for_it() {
        let parsed = parse(&sample()).unwrap();

        assert_eq!(parsed.name, NAME);
        assert_eq!(parsed.size_bytes, 1024);
        assert_eq!(parsed.trackers, [TRACKER]);
        assert_eq!(parsed.info_hash.len(), 40);
        assert!(parsed.magnet.starts_with(&format!(
            "magnet:?xt=urn:btih:{}&dn=Dune.2021.mkv&tr=http%3A%2F%2F",
            parsed.info_hash
        )));
    }

    #[test]
    fn anything_that_is_not_a_torrent_is_refused_rather_than_guessed_at() {
        assert!(parse(b"").unwrap_err().to_string().contains("empty"));
        assert!(parse(b"<html>nope</html>").is_err());
    }

    #[test]
    fn stored_bytes_come_back_by_hash_and_a_miss_is_not_an_error() {
        let dir = kroma_testing::temp_dir("torrent-upload");

        store(dir.path(), "abc123", b"payload").unwrap();

        assert_eq!(stored_bytes(dir.path(), Some("abc123")).as_deref(), Some(&b"payload"[..]));
        assert_eq!(stored_bytes(dir.path(), Some("missing")), None);
        assert_eq!(stored_bytes(dir.path(), None), None);
    }
}

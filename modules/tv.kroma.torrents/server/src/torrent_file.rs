//! Reading a `.torrent` an operator uploaded.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use sha1::{Digest, Sha1};

use crate::bencode::{self, Node};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedTorrentFile {
    pub info_hash: String,
    pub name: String,
    pub size_bytes: u64,
    pub trackers: Vec<String>,
    pub magnet: String,
}

pub(crate) fn encode(value: &str) -> String {
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

/// Bencode-decode an uploaded `.torrent`. Errors on anything that is not one:
/// the bytes reached us over HTTP.
pub fn parse(bytes: &[u8]) -> Result<ParsedTorrentFile> {
    if bytes.is_empty() {
        bail!("the uploaded file is empty");
    }
    let torrent = bencode::parse(bytes).context("this file is not a valid .torrent")?;
    let info = torrent.get(b"info").context("this file is not a valid .torrent")?;
    let files = validated_files(info).context("this .torrent describes no files")?;
    let name = text_of(info, b"name.utf-8")
        .or_else(|| text_of(info, b"name"))
        .unwrap_or_default();
    let size_bytes = files.iter().map(|file| file.length).sum();
    let trackers = trackers_of(&torrent);
    let info_hash = sha1_hex(info.raw);
    let magnet = magnet_for(&info_hash, &name, &trackers);
    Ok(ParsedTorrentFile {
        info_hash,
        name,
        size_bytes,
        trackers,
        magnet,
    })
}

struct TorrentEntry<'a> {
    components: Vec<&'a [u8]>,
    length: u64,
    padding: bool,
}

fn sha1_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha1::new();
    hasher.update(bytes);
    let digest: [u8; 20] = hasher.finalize().into();
    crate::magnet::to_hex(&digest)
}

fn text_of(node: &Node<'_>, key: &[u8]) -> Option<String> {
    let text = node.get(key)?.bytes()?;
    (!text.is_empty()).then(|| String::from_utf8_lossy(text).into_owned())
}

fn trackers_of(torrent: &Node<'_>) -> Vec<String> {
    let tiers: Vec<&Node<'_>> = torrent
        .get(b"announce-list")
        .and_then(Node::list)
        .unwrap_or_default()
        .iter()
        .flat_map(|tier| tier.list().unwrap_or_default())
        .collect();
    let chosen = if tiers.is_empty() {
        torrent.get(b"announce").into_iter().collect()
    } else {
        tiers
    };
    chosen
        .into_iter()
        .filter_map(Node::bytes)
        .filter_map(|tracker| std::str::from_utf8(tracker).ok())
        .filter(|tracker| !tracker.is_empty())
        .map(str::to_string)
        .collect()
}

fn entries_of<'a>(info: &Node<'a>) -> Result<Vec<TorrentEntry<'a>>> {
    let single = info.get(b"length");
    let many = info.get(b"files");
    match (single, many) {
        (Some(length), None) => {
            let name = info.get(b"name").and_then(Node::bytes).context("the file has no name")?;
            Ok(vec![TorrentEntry {
                components: vec![name],
                length: u64::try_from(length.int().context("a file has no length")?)?,
                padding: is_padding(info),
            }])
        }
        (None, Some(files)) => {
            let files = files.list().context("the file list is not a list")?;
            files.iter().map(entry_of).collect()
        }
        _ => bail!("a torrent is either one file or a list of them"),
    }
}

fn entry_of<'a>(file: &Node<'a>) -> Result<TorrentEntry<'a>> {
    let path = file.get(b"path").and_then(Node::list).context("a file has no path")?;
    let components = path
        .iter()
        .map(|component| component.bytes().context("a path holds something else"))
        .collect::<Result<Vec<_>>>()?;
    let length = file.get(b"length").and_then(Node::int).context("a file has no length")?;
    Ok(TorrentEntry {
        components,
        length: u64::try_from(length)?,
        padding: is_padding(file),
    })
}

fn is_padding(node: &Node<'_>) -> bool {
    node.get(b"attr")
        .and_then(Node::bytes)
        .is_some_and(|attr| attr.contains(&b'p'))
}

fn validated_files<'a>(info: &Node<'a>) -> Result<Vec<TorrentEntry<'a>>> {
    info.get(b"pieces").and_then(Node::bytes).context("the piece hashes are missing")?;
    let piece_length = info.get(b"piece length").and_then(Node::int);
    if !piece_length.is_some_and(|length| length > 0 && u32::try_from(length).is_ok()) {
        bail!("the piece length is not usable");
    }
    let files = entries_of(info)?;
    if files.is_empty() {
        bail!("the file list is empty");
    }
    if files.iter().map(|file| file.length).sum::<u64>() == 0 {
        bail!("there is nothing to download");
    }
    let mut seen = HashSet::new();
    for file in &files {
        if file.components.is_empty() || file.components.iter().all(|part| part.is_empty()) {
            bail!("a file has no name");
        }
        let hostile = |part: &&[u8]| {
            *part == b".." || part.contains(&b'/') || part.contains(&b'\\')
        };
        if file.components.iter().any(hostile) {
            bail!("a file's path leaves the torrent's folder");
        }
        if !file.padding && !seen.insert(file.components.clone()) {
            bail!("two files share one path");
        }
    }
    Ok(files)
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
mod tests;

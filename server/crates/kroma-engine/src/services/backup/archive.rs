//! The backup container: a real ZIP holding `backup.json` (the table dump,
//! deflate-compressed at max level, since repetitive text shrinks a lot),
//! `assets/<name>` for user-uploaded avatars (stored as-is, WebP is already
//! compressed) and `subtitles/<name>` for WebVTT (deflated). Also reads the
//! legacy v1 format (raw JSON with avatars hex-embedded) so old backups still
//! import.

use std::io::{Cursor, Read, Write};

use anyhow::{bail, Context, Result};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::db::BackupDoc;

/// The folder a packed file sits in, which is also where a restore puts it back.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Folder {
    Images,
    Subtitles,
}

impl Folder {
    const ALL: [Self; 2] = [Self::Images, Self::Subtitles];

    fn prefix(self) -> &'static str {
        match self {
            Self::Images => "assets/",
            Self::Subtitles => "subtitles/",
        }
    }

    fn compression(self) -> CompressionMethod {
        match self {
            Self::Images => CompressionMethod::Stored,
            Self::Subtitles => CompressionMethod::Deflated,
        }
    }
}

/// One file packed beside the rows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Asset {
    pub folder: Folder,
    pub name: String,
    pub bytes: Vec<u8>,
}

/// The files a backup packs beside its rows.
pub type Assets = Vec<Asset>;

const MANIFEST: &str = "backup.json";
// A ZIP's header states an uncompressed size it need not honour, so the bound
// has to be on what is actually inflated. Well past any real backup, and far
// short of exhausting the box the import runs on.
const MAX_INFLATED: u64 = 512 * 1024 * 1024;

/// Serialize a backup to ZIP bytes: `backup.json` plus one entry per file, in its folder.
pub fn write_zip(doc: &BackupDoc, assets: &Assets) -> Result<Vec<u8>> {
    let mut zw = ZipWriter::new(Cursor::new(Vec::new()));
    let json_opts = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .compression_level(Some(9));

    zw.start_file(MANIFEST, json_opts)?;
    zw.write_all(&serde_json::to_vec_pretty(doc)?)?;
    for asset in assets {
        let opts = SimpleFileOptions::default().compression_method(asset.folder.compression());
        zw.start_file(format!("{}{}", asset.folder.prefix(), asset.name), opts)?;
        zw.write_all(&asset.bytes)?;
    }
    Ok(zw.finish()?.into_inner())
}

/// Read a ZIP backup → the document + its asset files.
pub fn read_zip(bytes: &[u8]) -> Result<(BackupDoc, Assets)> {
    read_zip_within(bytes, MAX_INFLATED)
}

fn read_zip_within(bytes: &[u8], mut budget: u64) -> Result<(BackupDoc, Assets)> {
    let mut za = ZipArchive::new(Cursor::new(bytes)).context("open backup zip")?;
    let mut doc: Option<BackupDoc> = None;
    let mut assets = Assets::new();
    for i in 0..za.len() {
        let mut entry = za.by_index(i)?;
        let name = entry.name().to_string();
        let packed = Folder::ALL.into_iter().find_map(|folder| {
            name.strip_prefix(folder.prefix())
                .filter(|n| !n.is_empty())
                .map(|n| (folder, n.to_string()))
        });
        if name != MANIFEST && packed.is_none() {
            continue;
        }
        let mut buf = Vec::new();
        let read = Read::take(&mut entry, budget + 1).read_to_end(&mut buf)? as u64;
        if read > budget {
            bail!("backup archive inflates past what an import will read");
        }
        budget -= read;
        match packed {
            Some((folder, name)) => assets.push(Asset {
                folder,
                name,
                bytes: buf,
            }),
            None => doc = Some(serde_json::from_slice(&buf).context("parse backup.json")?),
        }
    }
    Ok((doc.context("backup.json missing from archive")?, assets))
}

/// Read a legacy v1 backup (raw JSON with avatars hex-embedded in `doc.assets`).
pub fn read_legacy_json(bytes: &[u8]) -> Result<(BackupDoc, Assets)> {
    let doc: BackupDoc = serde_json::from_slice(bytes).context("parse legacy backup json")?;
    let assets = doc
        .assets
        .iter()
        .filter_map(|(n, h)| {
            Some(Asset {
                folder: Folder::Images,
                name: n.clone(),
                bytes: hex::decode(h).ok()?,
            })
        })
        .collect();
    Ok((doc, assets))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn doc() -> BackupDoc {
        let mut tables = BTreeMap::new();
        let mut row = serde_json::Map::new();
        row.insert("id".into(), serde_json::json!("u1"));
        tables.insert("users".to_string(), vec![row]);
        BackupDoc {
            version: 1,
            exported_at: "t".into(),
            tables,
            assets: BTreeMap::new(),
            modules: BTreeMap::new(),
        }
    }

    fn asset(folder: Folder, name: &str, bytes: &[u8]) -> Asset {
        Asset {
            folder,
            name: name.to_string(),
            bytes: bytes.to_vec(),
        }
    }

    #[test]
    fn zip_round_trip_carries_doc_and_assets() {
        let assets = vec![
            asset(Folder::Images, "ab12.webp", b"WEBP"),
            asset(Folder::Subtitles, "cd34.vtt", b"WEBVTT"),
        ];
        let bytes = write_zip(&doc(), &assets).unwrap();
        assert_eq!(&bytes[..4], b"PK\x03\x04", "is a real zip");

        let (back, got) = read_zip(&bytes).unwrap();
        assert_eq!(back.tables["users"][0]["id"], serde_json::json!("u1"));
        assert_eq!(got, assets);
    }

    #[test]
    fn an_archive_that_inflates_past_the_budget_is_refused_rather_than_read() {
        let assets = vec![asset(Folder::Images, "big.webp", &[0u8; 64 * 1024])];
        let bytes = write_zip(&doc(), &assets).unwrap();

        let err = read_zip_within(&bytes, 4096).unwrap_err();

        assert!(err.to_string().contains("inflates past"), "{err}");
    }

    #[test]
    fn an_entry_that_is_neither_the_manifest_nor_an_asset_is_never_inflated() {
        let mut zw = ZipWriter::new(Cursor::new(Vec::new()));
        zw.start_file("padding.bin", SimpleFileOptions::default())
            .unwrap();
        zw.write_all(&vec![0u8; 64 * 1024]).unwrap();
        zw.start_file(MANIFEST, SimpleFileOptions::default())
            .unwrap();
        zw.write_all(&serde_json::to_vec(&doc()).unwrap()).unwrap();
        let bytes = zw.finish().unwrap().into_inner();

        let (back, assets) = read_zip_within(&bytes, 4096).unwrap();

        assert_eq!(back.tables["users"][0]["id"], serde_json::json!("u1"));
        assert!(assets.is_empty());
    }

    #[test]
    fn legacy_json_decodes_hex_assets() {
        let mut d = doc();
        d.assets.insert("ab12.webp".into(), hex::encode(b"WEBP"));
        let bytes = serde_json::to_vec(&d).unwrap();
        let (_, got) = read_legacy_json(&bytes).unwrap();
        assert_eq!(got, vec![asset(Folder::Images, "ab12.webp", b"WEBP")]);
    }
}

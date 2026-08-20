//! The backup container: a real ZIP holding `backup.json` (the table dump,
//! deflate-compressed at max level it's repetitive text that shrinks a lot) and
//! `assets/<name>` files (user-uploaded avatars, stored as-is since WebP is
//! already compressed). Also reads the legacy v1 format (raw JSON with avatars
//! hex-embedded) so old backups still import.

use std::io::{Cursor, Read, Write};

use anyhow::{bail, Context, Result};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::db::BackupDoc;

/// In-memory backup: the row document plus the asset files it references.
pub type Assets = Vec<(String, Vec<u8>)>;

const MANIFEST: &str = "backup.json";
const ASSET_DIR: &str = "assets/";
// A ZIP's header states an uncompressed size it need not honour, so the bound
// has to be on what is actually inflated. Well past any real backup, and far
// short of exhausting the box the import runs on.
const MAX_INFLATED: u64 = 512 * 1024 * 1024;

/// Serialize a backup to ZIP bytes: `backup.json` + one `assets/<name>` per file.
pub fn write_zip(doc: &BackupDoc, assets: &Assets) -> Result<Vec<u8>> {
    let mut zw = ZipWriter::new(Cursor::new(Vec::new()));
    // Max deflate (0–9 on the flate2 backend) for the JSON; avatars are already
    // compressed (WebP), so storing them avoids wasted CPU for no size win.
    let json_opts = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .compression_level(Some(9));
    let asset_opts = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);

    zw.start_file(MANIFEST, json_opts)?;
    zw.write_all(&serde_json::to_vec_pretty(doc)?)?;
    for (name, bytes) in assets {
        zw.start_file(format!("{ASSET_DIR}{name}"), asset_opts)?;
        zw.write_all(bytes)?;
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
        let asset = name.strip_prefix(ASSET_DIR).filter(|a| !a.is_empty()).map(str::to_string);
        if name != MANIFEST && asset.is_none() {
            continue;
        }
        let mut buf = Vec::new();
        let read = Read::take(&mut entry, budget + 1).read_to_end(&mut buf)? as u64;
        if read > budget {
            bail!("backup archive inflates past what an import will read");
        }
        budget -= read;
        match asset {
            Some(asset) => assets.push((asset, buf)),
            None => doc = Some(serde_json::from_slice(&buf).context("parse backup.json")?),
        }
    }
    Ok((doc.context("backup.json missing from archive")?, assets))
}

/// Read a legacy v1 backup (raw JSON with avatars hex-embedded in `doc.assets`).
pub fn read_legacy_json(bytes: &[u8]) -> Result<(BackupDoc, Assets)> {
    let doc: BackupDoc = serde_json::from_slice(bytes).context("parse legacy backup json")?;
    let assets = doc.assets.iter().filter_map(|(n, h)| Some((n.clone(), hex::decode(h).ok()?))).collect();
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

    #[test]
    fn zip_round_trip_carries_doc_and_assets() {
        let assets = vec![("ab12.webp".to_string(), b"WEBP".to_vec())];
        let bytes = write_zip(&doc(), &assets).unwrap();
        assert_eq!(&bytes[..4], b"PK\x03\x04", "is a real zip");

        let (back, got) = read_zip(&bytes).unwrap();
        assert_eq!(back.tables["users"][0]["id"], serde_json::json!("u1"));
        assert_eq!(got, assets);
    }

    #[test]
    fn an_archive_that_inflates_past_the_budget_is_refused_rather_than_read() {
        let assets = vec![("big.webp".to_string(), vec![0u8; 64 * 1024])];
        let bytes = write_zip(&doc(), &assets).unwrap();

        let err = read_zip_within(&bytes, 4096).unwrap_err();

        assert!(err.to_string().contains("inflates past"), "{err}");
    }

    #[test]
    fn an_entry_that_is_neither_the_manifest_nor_an_asset_is_never_inflated() {
        let mut zw = ZipWriter::new(Cursor::new(Vec::new()));
        zw.start_file("padding.bin", SimpleFileOptions::default()).unwrap();
        zw.write_all(&vec![0u8; 64 * 1024]).unwrap();
        zw.start_file(MANIFEST, SimpleFileOptions::default()).unwrap();
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
        assert_eq!(got, vec![("ab12.webp".to_string(), b"WEBP".to_vec())]);
    }
}

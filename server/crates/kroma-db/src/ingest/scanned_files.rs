//! The file rows a scan writes, and the probe data an unchanged file keeps.

use std::collections::HashMap;

use anyhow::Result;
use rusqlite::params;

use kroma_domain::{MediaFile, MediaItem};

pub(super) fn sync_files(
    tx: &rusqlite::Transaction,
    items: &[MediaItem],
    mtimes: &HashMap<String, Option<i64>>,
) -> Result<()> {
    let scanned: std::collections::HashSet<&str> = items
        .iter()
        .flat_map(|i| i.files.iter())
        .filter_map(|f| f.abs_path.as_deref())
        .collect();

    delete_gone_files(tx, &scanned)?;
    let prev = existing_file_sigs(tx)?;

    let mut keep_stmt = tx.prepare(
        "INSERT INTO files (id,item_id,abs_path,rel_path,container,size,mtime,edition) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8) \
         ON CONFLICT(abs_path) DO UPDATE SET \
             id=excluded.id, item_id=excluded.item_id, rel_path=excluded.rel_path, \
             container=excluded.container, size=excluded.size, mtime=excluded.mtime, \
             edition=excluded.edition",
    )?;
    let mut reset_stmt = tx.prepare(
        "INSERT INTO files (id,item_id,abs_path,rel_path,container,size,mtime,edition,probed,\
             duration_ms,v_codec,v_width,v_height,v_hdr,v_bit_depth,a_codec,a_channels,a_language,subtitles,audio_tracks) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'[]','[]') \
         ON CONFLICT(abs_path) DO UPDATE SET \
             id=excluded.id, item_id=excluded.item_id, rel_path=excluded.rel_path, \
             container=excluded.container, size=excluded.size, mtime=excluded.mtime, \
             edition=excluded.edition, probed=0, duration_ms=NULL, v_codec=NULL, v_width=NULL, \
             v_height=NULL, v_hdr=NULL, v_bit_depth=NULL, a_codec=NULL, a_channels=NULL, \
             a_language=NULL, subtitles='[]', audio_tracks='[]'",
    )?;
    // Pre-probed files (demo/seed content) skip the phase-2 probe pass.
    let mut preprobed_stmt = tx.prepare(
        "INSERT INTO files (id,item_id,abs_path,rel_path,container,size,mtime,edition,probed,\
             duration_ms,v_codec,v_width,v_height,v_hdr,v_bit_depth,a_codec,a_channels,a_language,subtitles,audio_tracks) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,1,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19) \
         ON CONFLICT(abs_path) DO UPDATE SET \
             id=excluded.id, item_id=excluded.item_id, rel_path=excluded.rel_path, \
             container=excluded.container, size=excluded.size, mtime=excluded.mtime, \
             edition=excluded.edition, probed=1, duration_ms=excluded.duration_ms, \
             v_codec=excluded.v_codec, v_width=excluded.v_width, v_height=excluded.v_height, \
             v_hdr=excluded.v_hdr, v_bit_depth=excluded.v_bit_depth, a_codec=excluded.a_codec, \
             a_channels=excluded.a_channels, a_language=excluded.a_language, subtitles=excluded.subtitles, \
             audio_tracks=excluded.audio_tracks",
    )?;

    for i in items {
        for f in &i.files {
            upsert_scanned_file(
                &mut keep_stmt,
                &mut reset_stmt,
                &mut preprobed_stmt,
                &prev,
                mtimes,
                i,
                f,
            )?;
        }
    }
    Ok(())
}

fn delete_gone_files(
    tx: &rusqlite::Transaction,
    scanned: &std::collections::HashSet<&str>,
) -> Result<()> {
    let mut existing: Vec<(String, String)> = Vec::new();
    {
        let mut q = tx.prepare("SELECT id, abs_path FROM files")?;
        let rows = q.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        for r in rows {
            existing.push(r?);
        }
    }
    let mut del = tx.prepare("DELETE FROM files WHERE id = ?1")?;
    for (id, abs) in &existing {
        if !scanned.contains(abs.as_str()) {
            del.execute(params![id])?;
        }
    }
    Ok(())
}

// What a stored file row has to still match for its probe result to be kept.
struct FileSig {
    size: Option<i64>,
    mtime: Option<i64>,
    probed: bool,
}

fn existing_file_sigs(tx: &rusqlite::Transaction) -> Result<HashMap<String, FileSig>> {
    let mut prev: HashMap<String, FileSig> = HashMap::new();
    let mut q = tx.prepare("SELECT abs_path, size, mtime, probed FROM files")?;
    let rows = q.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            FileSig {
                size: r.get(1)?,
                mtime: r.get(2)?,
                probed: r.get::<_, i64>(3)? != 0,
            },
        ))
    })?;
    for r in rows {
        let (abs, sig) = r?;
        prev.insert(abs, sig);
    }
    Ok(prev)
}

fn upsert_scanned_file<'a>(
    keep_stmt: &mut rusqlite::Statement<'a>,
    reset_stmt: &mut rusqlite::Statement<'a>,
    preprobed_stmt: &mut rusqlite::Statement<'a>,
    prev: &HashMap<String, FileSig>,
    mtimes: &HashMap<String, Option<i64>>,
    i: &MediaItem,
    f: &MediaFile,
) -> Result<()> {
    let Some(abs) = f.abs_path.as_deref() else { return Ok(()) };
    let size = f.size.map(|s| s as i64);
    let mtime = mtimes.get(&f.id).copied().flatten();

    if f.probed {
        let v = f.video.as_ref();
        let a = f.audio.as_ref();
        let subs = serde_json::to_string(&f.subtitles).unwrap_or_else(|_| "[]".into());
        let a_tracks = serde_json::to_string(&f.audio_tracks).unwrap_or_else(|_| "[]".into());
        preprobed_stmt.execute(params![
            f.id, i.id, abs, f.rel_path, f.container, size, mtime, f.edition,
            f.duration_ms.map(|d| d as i64),
            v.map(|v| v.codec.clone()),
            v.and_then(|v| v.width),
            v.and_then(|v| v.height),
            v.map(|v| v.hdr as i64),
            v.and_then(|v| v.bit_depth),
            a.map(|a| a.codec.clone()),
            a.and_then(|a| a.channels),
            a.and_then(|a| a.language.clone()),
            subs,
            a_tracks,
        ])?;
        return Ok(());
    }

    let unchanged_probed =
        prev.get(abs).is_some_and(|p| p.probed && p.size == size && p.mtime == mtime);
    let stmt = if unchanged_probed { keep_stmt } else { reset_stmt };
    stmt.execute(params![
        f.id, i.id, abs, f.rel_path, f.container, size, mtime, f.edition,
    ])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ingest::test_support::*;
    use crate::{item_has_probed_file, sync_all, unprobed_files};

    #[test]
    fn sync_preprobed_file_stores_streams_directly() {
        let p = pool();
        let items = vec![movie("m1", "Demo", "lib", vec![file("f1", "demo://m1", true)])];
        sync_all(&p, &[lib("lib")], &[], &items, &mtimes_of(&items, 100)).unwrap();
        assert!(item_has_probed_file(&p, "m1").unwrap());
        assert!(unprobed_files(&p).unwrap().is_empty());
        let got = crate::get_item(&p, "m1").unwrap().unwrap();
        assert_eq!(got.video.map(|v| v.codec), Some("hevc".to_string()));
        // demo:// paths are not streamable, so abs_path stays cleared.
        assert!(got.abs_path.is_none());
    }

    #[test]
    fn a_scan_that_cannot_write_a_file_fails_on_both_the_probed_and_unprobed_paths() {
        let p = pool();
        p.get()
            .unwrap()
            .execute_batch(
                "CREATE TRIGGER no_file_insert BEFORE INSERT ON files \
                 BEGIN SELECT RAISE(ABORT, 'refused'); END",
            )
            .unwrap();

        for probed in [false, true] {
            let items =
                vec![movie("m1", "Dune", "lib", vec![file("f1", "/media/m1.mkv", probed)])];
            assert!(
                sync_all(&p, &[lib("lib")], &[], &items, &HashMap::new()).is_err(),
                "probed = {probed}"
            );
        }
    }
}

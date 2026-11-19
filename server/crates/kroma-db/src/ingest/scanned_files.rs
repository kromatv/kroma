//! The file rows a scan writes, and the probe data an unchanged file keeps.

use std::collections::HashMap;

use anyhow::Result;
use rusqlite::{params, OptionalExtension};

use kroma_domain::{HdrFormat, MediaFile, MediaItem};

const SCANNED_COLUMNS_MOVED: &str = "files.id IS NOT excluded.id \
    OR files.item_id IS NOT excluded.item_id OR files.rel_path IS NOT excluded.rel_path \
    OR files.container IS NOT excluded.container OR files.size IS NOT excluded.size \
    OR files.mtime IS NOT excluded.mtime OR files.edition IS NOT excluded.edition";

const PROBE_COLUMNS_SET: &str = "files.probed IS NOT 0 OR files.unreadable IS NOT NULL \
    OR files.duration_ms IS NOT NULL OR files.v_codec IS NOT NULL \
    OR files.v_width IS NOT NULL OR files.v_height IS NOT NULL OR files.v_hdr IS NOT NULL \
    OR files.v_bit_depth IS NOT NULL OR files.a_codec IS NOT NULL \
    OR files.a_channels IS NOT NULL OR files.a_language IS NOT NULL \
    OR files.subtitles IS NOT '[]' OR files.audio_tracks IS NOT '[]' \
    OR files.v_hdr_format IS NOT NULL OR files.v_dv_profile IS NOT NULL \
    OR files.v_color_primaries IS NOT NULL OR files.v_color_transfer IS NOT NULL \
    OR files.v_color_matrix IS NOT NULL";

struct FileStatements<'tx> {
    probe_kept: rusqlite::Statement<'tx>,
    keep: rusqlite::Statement<'tx>,
    reset: rusqlite::Statement<'tx>,
    preprobed: rusqlite::Statement<'tx>,
}

pub(super) fn sync_files<'a>(
    tx: &rusqlite::Transaction,
    items: impl IntoIterator<Item = &'a MediaItem>,
    mtimes: &HashMap<String, Option<i64>>,
) -> Result<usize> {
    let mut statements = file_statements(tx)?;
    let mut written = 0;
    for i in items {
        for f in &i.files {
            written += upsert_scanned_file(&mut statements, mtimes, i, f)?;
        }
    }
    Ok(written)
}

fn file_statements<'tx>(tx: &'tx rusqlite::Transaction) -> Result<FileStatements<'tx>> {
    let probe_kept = tx.prepare(
        "SELECT probed != 0 AND size IS ?2 AND mtime IS ?3 FROM files WHERE abs_path = ?1",
    )?;
    let keep = tx.prepare(&format!(
        "INSERT INTO files (id,item_id,abs_path,rel_path,container,size,mtime,edition) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8) \
         ON CONFLICT(abs_path) DO UPDATE SET \
             id=excluded.id, item_id=excluded.item_id, rel_path=excluded.rel_path, \
             container=excluded.container, size=excluded.size, mtime=excluded.mtime, \
             edition=excluded.edition \
         WHERE {SCANNED_COLUMNS_MOVED}"
    ))?;
    let reset = tx.prepare(&format!(
        "INSERT INTO files (id,item_id,abs_path,rel_path,container,size,mtime,edition,probed,\
             duration_ms,v_codec,v_width,v_height,v_hdr,v_bit_depth,a_codec,a_channels,a_language,subtitles,audio_tracks) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'[]','[]') \
         ON CONFLICT(abs_path) DO UPDATE SET \
             id=excluded.id, item_id=excluded.item_id, rel_path=excluded.rel_path, \
             container=excluded.container, size=excluded.size, mtime=excluded.mtime, \
             edition=excluded.edition, probed=0, duration_ms=NULL, v_codec=NULL, v_width=NULL, \
             v_height=NULL, v_hdr=NULL, v_bit_depth=NULL, a_codec=NULL, a_channels=NULL, \
             a_language=NULL, subtitles='[]', audio_tracks='[]', unreadable=NULL, \
             v_hdr_format=NULL, v_dv_profile=NULL, v_color_primaries=NULL, \
             v_color_transfer=NULL, v_color_matrix=NULL \
         WHERE {SCANNED_COLUMNS_MOVED} OR {PROBE_COLUMNS_SET}"
    ))?;
    // Pre-probed files (demo/seed content) skip the phase-2 probe pass.
    let preprobed = tx.prepare(
        "INSERT INTO files (id,item_id,abs_path,rel_path,container,size,mtime,edition,probed,\
             duration_ms,v_codec,v_width,v_height,v_hdr,v_bit_depth,a_codec,a_channels,a_language,subtitles,audio_tracks,\
             v_hdr_format,v_dv_profile,v_color_primaries,v_color_transfer,v_color_matrix) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,1,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24) \
         ON CONFLICT(abs_path) DO UPDATE SET \
             id=excluded.id, item_id=excluded.item_id, rel_path=excluded.rel_path, \
             container=excluded.container, size=excluded.size, mtime=excluded.mtime, \
             edition=excluded.edition, probed=1, duration_ms=excluded.duration_ms, \
             v_codec=excluded.v_codec, v_width=excluded.v_width, v_height=excluded.v_height, \
             v_hdr=excluded.v_hdr, v_bit_depth=excluded.v_bit_depth, a_codec=excluded.a_codec, \
             a_channels=excluded.a_channels, a_language=excluded.a_language, subtitles=excluded.subtitles, \
             audio_tracks=excluded.audio_tracks, unreadable=NULL, \
             v_hdr_format=excluded.v_hdr_format, v_dv_profile=excluded.v_dv_profile, \
             v_color_primaries=excluded.v_color_primaries, v_color_transfer=excluded.v_color_transfer, \
             v_color_matrix=excluded.v_color_matrix",
    )?;

    Ok(FileStatements {
        probe_kept,
        keep,
        reset,
        preprobed,
    })
}

fn upsert_scanned_file(
    statements: &mut FileStatements,
    mtimes: &HashMap<String, Option<i64>>,
    i: &MediaItem,
    f: &MediaFile,
) -> Result<usize> {
    let Some(abs) = f.abs_path.as_deref() else {
        return Ok(0);
    };
    let size = f.size.map(|s| s as i64);
    let mtime = mtimes.get(&f.id).copied().flatten();

    if f.probed {
        let v = f.video.as_ref();
        let a = f.audio.as_ref();
        let color = v.and_then(|v| v.color.as_ref());
        let subs = serde_json::to_string(&f.subtitles).unwrap_or_else(|_| "[]".into());
        let a_tracks = serde_json::to_string(&f.audio_tracks).unwrap_or_else(|_| "[]".into());
        let written = statements.preprobed.execute(params![
            f.id,
            i.id,
            abs,
            f.rel_path,
            f.container,
            size,
            mtime,
            f.edition,
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
            v.and_then(|v| v.hdr_format).map(HdrFormat::as_str),
            v.and_then(|v| v.dolby_vision_profile),
            color.and_then(|c| c.primaries.clone()),
            color.and_then(|c| c.transfer.clone()),
            color.and_then(|c| c.matrix.clone()),
        ])?;
        return Ok(written);
    }

    let unchanged_probed = statements
        .probe_kept
        .query_row(params![abs, size, mtime], |r| r.get::<_, bool>(0))
        .optional()?
        .unwrap_or(false);
    let stmt = if unchanged_probed {
        &mut statements.keep
    } else {
        &mut statements.reset
    };
    let written = stmt.execute(params![
        f.id,
        i.id,
        abs,
        f.rel_path,
        f.container,
        size,
        mtime,
        f.edition,
    ])?;
    Ok(written)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ingest::test_support::*;
    use crate::{item_has_probed_file, sync_all, unprobed_files};

    #[test]
    fn sync_preprobed_file_stores_streams_directly() {
        let p = pool();
        let items = vec![movie(
            "m1",
            "Demo",
            "lib",
            vec![file("f1", "demo://m1", true)],
        )];
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
            let items = vec![movie(
                "m1",
                "Dune",
                "lib",
                vec![file("f1", "/media/m1.mkv", probed)],
            )];
            assert!(
                sync_all(&p, &[lib("lib")], &[], &items, &HashMap::new()).is_err(),
                "probed = {probed}"
            );
        }
    }
}

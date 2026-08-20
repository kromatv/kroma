//! Persisting one probe result, and the representative columns it moves.

use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension};

use kroma_domain::{AudioStream, SubtitleTrack, VideoStream};

use crate::Pool;

/// Persists one file's probe result, then recomputes the owning item's representative columns.
pub fn set_file_probe(
    pool: &Pool,
    file_id: &str,
    duration_ms: Option<u64>,
    video: Option<&VideoStream>,
    audio: Option<&AudioStream>,
    audio_tracks: &[AudioStream],
    subtitles: &[SubtitleTrack],
) -> Result<()> {
    let conn = pool.get()?;
    let subs = serde_json::to_string(subtitles).unwrap_or_else(|_| "[]".into());
    let a_tracks = serde_json::to_string(audio_tracks).unwrap_or_else(|_| "[]".into());
    conn.execute(
        "UPDATE files SET probed=1, duration_ms=?2, \
            v_codec=?3, v_width=?4, v_height=?5, v_hdr=?6, v_bit_depth=?7, \
            a_codec=?8, a_channels=?9, a_language=?10, subtitles=?11, audio_tracks=?12 \
         WHERE id = ?1",
        params![
            file_id,
            duration_ms.map(|d| d as i64),
            video.map(|v| v.codec.clone()),
            video.and_then(|v| v.width),
            video.and_then(|v| v.height),
            video.map(|v| v.hdr as i64),
            video.and_then(|v| v.bit_depth),
            audio.map(|a| a.codec.clone()),
            audio.and_then(|a| a.channels),
            audio.and_then(|a| a.language.clone()),
            subs,
            a_tracks,
        ],
    )?;

    let item_id: Option<String> = conn
        .query_row("SELECT item_id FROM files WHERE id = ?1", params![file_id], |r| r.get(0))
        .optional()?;
    if let Some(item_id) = item_id {
        recompute_item_representative(&conn, &item_id)?;
    }
    Ok(())
}

fn recompute_item_representative(conn: &Connection, item_id: &str) -> Result<()> {
    let best: Option<(String, String, Option<String>, Option<i64>)> = conn
        .query_row(
            "SELECT abs_path, container, rel_path, duration_ms FROM files \
             WHERE item_id = ?1 AND probed = 1 \
             ORDER BY v_width DESC NULLS LAST, id LIMIT 1",
            params![item_id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, Option<i64>>(3)?,
                ))
            },
        )
        .optional()?;

    if let Some((abs, container, rel, duration)) = best {
        conn.execute(
            "UPDATE items SET container=?2, abs_path=?3, rel_path=?4, duration_ms=?5 WHERE id=?1",
            params![item_id, container, abs, rel, duration],
        )?;
    }
    Ok(())
}

pub(super) fn recompute_all_representatives(pool: &Pool) -> Result<()> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT DISTINCT item_id FROM files WHERE probed = 1",
    )?;
    let ids: Vec<String> = stmt
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    for id in ids {
        recompute_item_representative(&conn, &id)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ingest::test_support::*;
    use crate::sync_all;
    use crate::testing::TempPool;
    use std::collections::HashMap;

    fn pool_with_probed_movie() -> TempPool {
        let p = pool();
        sync_all(
            &p,
            &[lib("lib")],
            &[],
            &[movie("m1", "Dune", "lib", vec![file("f1", "/media/m1.mkv", false)])],
            &HashMap::new(),
        )
        .unwrap();
        p
    }

    #[test]
    fn a_refused_file_write_fails_the_probe_rather_than_reporting_success() {
        let p = pool_with_probed_movie();
        p.get()
            .unwrap()
            .execute_batch(
                "CREATE TRIGGER no_file_update BEFORE UPDATE ON files \
                 BEGIN SELECT RAISE(ABORT, 'refused'); END",
            )
            .unwrap();

        assert!(set_file_probe(&p, "f1", Some(1), None, None, &[], &[]).is_err());
    }

    #[test]
    fn a_refused_item_write_fails_the_probe_that_triggered_the_recompute() {
        let p = pool_with_probed_movie();
        p.get()
            .unwrap()
            .execute_batch(
                "CREATE TRIGGER no_item_update BEFORE UPDATE ON items \
                 BEGIN SELECT RAISE(ABORT, 'refused'); END",
            )
            .unwrap();

        assert!(set_file_probe(&p, "f1", Some(1), None, None, &[], &[]).is_err());
    }

    #[test]
    fn a_probe_result_for_a_file_that_is_gone_is_recorded_against_no_item() {
        let p = pool_with_probed_movie();
        set_file_probe(&p, "no-such-file", Some(1), None, None, &[], &[]).unwrap();

        let container: String = p
            .get()
            .unwrap()
            .query_row("SELECT container FROM items WHERE id='m1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(container, "mkv", "no item was recomputed");
    }

    #[test]
    fn an_item_with_nothing_probed_yet_keeps_its_scanned_columns() {
        let p = pool_with_probed_movie();
        let conn = p.get().unwrap();
        recompute_item_representative(&conn, "m1").unwrap();

        let container: String =
            conn.query_row("SELECT container FROM items WHERE id='m1'", [], |r| r.get(0)).unwrap();
        assert_eq!(container, "mkv");
    }
}

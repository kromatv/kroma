//! EBU R128 loudness analysis per (file, audio track): the data behind the
//! "high dynamics / quiet dialogue" badge and the player's volume-boost
//! suggestion. One row per analyzed track; written by the `pipeline.loudness`
//! stage. Raw measured values are kept so remediation can reuse them.

use super::*;
use kroma_domain::{AudioAnalysis, AudioVerdict};

fn verdict_str(v: AudioVerdict) -> &'static str {
    match v {
        AudioVerdict::Ok => "ok",
        AudioVerdict::HighDynamics => "highDynamics",
        AudioVerdict::QuietDialog => "quietDialog",
    }
}

fn verdict_from_str(s: &str) -> Option<AudioVerdict> {
    match s {
        "ok" => Some(AudioVerdict::Ok),
        "highDynamics" => Some(AudioVerdict::HighDynamics),
        "quietDialog" => Some(AudioVerdict::QuietDialog),
        _ => None,
    }
}

fn row_to_analysis(r: &Row) -> rusqlite::Result<(String, Option<AudioAnalysis>)> {
    let file_id: String = r.get(0)?;
    let verdict: String = r.get(5)?;
    // An unknown verdict (from a future version) drops the row instead of
    // breaking older servers reading a newer DB.
    let analysis = verdict_from_str(&verdict).map(|v| AudioAnalysis {
        lufs_i: r.get(1).unwrap_or(0.0),
        lra: r.get(2).unwrap_or(0.0),
        true_peak: r.get(3).unwrap_or(0.0),
        dialog_lufs: r.get(4).ok().flatten(),
        verdict: v,
    });
    Ok((file_id, analysis))
}

/// Upsert the analysis of one audio track of one file.
pub fn set_audio_analysis(
    pool: &Pool,
    file_id: &str,
    track_index: u32,
    analysis: &AudioAnalysis,
) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO audio_analysis \
            (file_id, track_index, lufs_i, lra, true_peak, dialog_lufs, verdict, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now')) \
         ON CONFLICT(file_id, track_index) DO UPDATE SET \
           lufs_i = excluded.lufs_i, lra = excluded.lra, true_peak = excluded.true_peak, \
           dialog_lufs = excluded.dialog_lufs, verdict = excluded.verdict, \
           updated_at = excluded.updated_at",
        params![
            file_id,
            track_index,
            analysis.lufs_i,
            analysis.lra,
            analysis.true_peak,
            analysis.dialog_lufs,
            verdict_str(analysis.verdict),
        ],
    )?;
    Ok(())
}

/// The analysis of one file's analyzed track (only the default track is
/// analyzed today; lowest track index wins should several exist).
pub fn audio_analysis_for_file(
    conn: &Connection,
    file_id: &str,
) -> rusqlite::Result<Option<AudioAnalysis>> {
    let mut stmt = conn.prepare(
        "SELECT file_id, lufs_i, lra, true_peak, dialog_lufs, verdict \
         FROM audio_analysis WHERE file_id = ?1 ORDER BY track_index LIMIT 1",
    )?;
    let mut rows = stmt.query_map(params![file_id], row_to_analysis)?;
    match rows.next() {
        Some(r) => Ok(r?.1),
        None => Ok(None),
    }
}

/// [`audio_analysis_for_file`] over many files in one query per id-chunk,
/// keyed by file id (absent ids simply have no analysis yet).
pub(crate) fn audio_analysis_for_files(
    conn: &Connection,
    file_ids: &[&str],
) -> rusqlite::Result<std::collections::HashMap<String, AudioAnalysis>> {
    let mut out = std::collections::HashMap::new();
    for chunk in file_ids.chunks(super::IN_CHUNK) {
        let ph = vec!["?"; chunk.len()].join(",");
        let mut stmt = conn.prepare(&format!(
            "SELECT file_id, lufs_i, lra, true_peak, dialog_lufs, verdict \
             FROM audio_analysis WHERE file_id IN ({ph}) ORDER BY track_index",
        ))?;
        let rows = stmt.query_map(rusqlite::params_from_iter(chunk.iter()), row_to_analysis)?;
        for row in rows {
            let (file_id, analysis) = row?;
            if let Some(a) = analysis {
                // Rows arrive track-index-ascending; keep the first per file.
                out.entry(file_id).or_insert(a);
            }
        }
    }
    Ok(out)
}

/// `(id, "mtime:size")` of every **probed** file, for the `pipeline.loudness`
/// stage's enumeration: unprobed files stay out of scope (their track layout is
/// unknown) and flow in once the probe stage lands.
pub fn analyzable_file_sigs(pool: &Pool) -> Result<Vec<(String, String)>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, COALESCE(mtime,0) || ':' || COALESCE(size,0) FROM files WHERE probed = 1",
    )?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// `(abs_path, audio_tracks_json)` for one file the loudness stage's
/// per-subject lookup. `None` if the file row is gone.
pub fn loudness_target(pool: &Pool, file_id: &str) -> Result<Option<(String, String)>> {
    let conn = pool.get()?;
    let mut stmt =
        conn.prepare("SELECT abs_path, audio_tracks FROM files WHERE id = ?1 AND probed = 1")?;
    let mut rows =
        stmt.query_map(params![file_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    match rows.next() {
        Some(r) => Ok(Some(r?)),
        None => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::TempPool;

    fn pool_with_file() -> TempPool {
        let pool = crate::testing::temp_pool("loud");
        let conn = pool.get().unwrap();
        conn.execute("INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')", []).unwrap();
        conn.execute(
            "INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('m1','movie','T','mkv','lib','t')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO files (id,item_id,abs_path,container,probed,mtime,size,audio_tracks) \
             VALUES ('f1','m1','/media/m1.mkv','mkv',1,100,2000,'[{\"index\":0,\"codec\":\"eac3\"}]')",
            [],
        )
        .unwrap();
        drop(conn);
        pool
    }

    fn analysis(verdict: AudioVerdict) -> AudioAnalysis {
        AudioAnalysis { lufs_i: -18.0, lra: 12.5, true_peak: -1.2, dialog_lufs: Some(-24.0), verdict }
    }

    #[test]
    fn set_get_and_upsert_analysis() {
        let p = pool_with_file();
        set_audio_analysis(&p, "f1", 0, &analysis(AudioVerdict::HighDynamics)).unwrap();
        let conn = p.get().unwrap();
        let got = audio_analysis_for_file(&conn, "f1").unwrap().unwrap();
        assert_eq!(got.lufs_i, -18.0);
        assert_eq!(got.lra, 12.5);
        assert_eq!(got.dialog_lufs, Some(-24.0));
        assert_eq!(got.verdict, AudioVerdict::HighDynamics);
        assert!(audio_analysis_for_file(&conn, "ghost").unwrap().is_none());
        drop(conn);

        // Upsert the same (file, track) replaces the verdict.
        set_audio_analysis(&p, "f1", 0, &analysis(AudioVerdict::Ok)).unwrap();
        let conn = p.get().unwrap();
        assert_eq!(audio_analysis_for_file(&conn, "f1").unwrap().unwrap().verdict, AudioVerdict::Ok);
    }

    #[test]
    fn lowest_track_wins_and_batch_lookup() {
        let p = pool_with_file();
        set_audio_analysis(&p, "f1", 1, &analysis(AudioVerdict::QuietDialog)).unwrap();
        set_audio_analysis(&p, "f1", 0, &analysis(AudioVerdict::Ok)).unwrap();
        let conn = p.get().unwrap();
        // The default (lowest index) track's analysis is the representative one.
        assert_eq!(audio_analysis_for_file(&conn, "f1").unwrap().unwrap().verdict, AudioVerdict::Ok);
        let batch = audio_analysis_for_files(&conn, &["f1", "ghost"]).unwrap();
        assert_eq!(batch.len(), 1);
        assert_eq!(batch["f1"].verdict, AudioVerdict::Ok);
    }

    #[test]
    fn enumeration_and_target_lookups() {
        let p = pool_with_file();
        let sigs: std::collections::HashMap<String, String> =
            analyzable_file_sigs(&p).unwrap().into_iter().collect();
        assert_eq!(sigs.get("f1").map(String::as_str), Some("100:2000"));

        let (abs, tracks) = loudness_target(&p, "f1").unwrap().unwrap();
        assert_eq!(abs, "/media/m1.mkv");
        assert!(tracks.contains("eac3"));
        assert!(loudness_target(&p, "ghost").unwrap().is_none());
    }

    #[test]
    fn a_verdict_written_by_a_newer_server_reads_as_no_analysis() {
        let p = pool_with_file();
        set_audio_analysis(&p, "f1", 0, &analysis(AudioVerdict::QuietDialog)).unwrap();
        let conn = p.get().unwrap();
        conn.execute("UPDATE audio_analysis SET verdict='clipping' WHERE file_id='f1'", []).unwrap();

        assert!(audio_analysis_for_file(&conn, "f1").unwrap().is_none());
        assert!(audio_analysis_for_files(&conn, &["f1"]).unwrap().is_empty());
    }
}

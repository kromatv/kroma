//! Hydrating items: their files, markers and audio analysis.

mod representative;

use rusqlite::{params, Connection};

use kroma_domain::{Kind, MediaFile, MediaItem};

use self::representative::apply_files;
use crate::{audio_analysis, markers, row_to_file, row_to_item, FILE_COLS, IN_CHUNK, ITEM_COLS};

// The one order every file read uses: a broken file last, then probed before
// unprobed, then widest first.
const FILE_ORDER: &str = "ORDER BY (unreadable IS NULL) DESC, (probed=1) DESC, \
     v_width DESC NULLS LAST, id";

fn files_for_item(conn: &Connection, item_id: &str) -> rusqlite::Result<Vec<MediaFile>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {FILE_COLS} FROM files WHERE item_id = ?1 {FILE_ORDER}"
    ))?;
    let files = stmt
        .query_map(params![item_id], row_to_file)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(files)
}

/// Attach `files[]` to an item and mirror its representative file into the
/// top-level fields (video/audio/duration/container/subtitles/abs_path) for
/// backward compatibility. The representative is the highest-resolution probed
/// file; if none is probed yet, the first file (streams stay null).
pub(crate) fn attach_files(conn: &Connection, item: &mut MediaItem) -> rusqlite::Result<()> {
    let files = files_for_item(conn, &item.id)?;
    apply_files(item, files);
    // Episodes carry intro/credits markers (skip-intro + next-up-at-credits).
    if item.kind == Kind::Episode {
        item.markers = markers::markers_for_item(conn, &item.id)?;
    }
    if let Some(fid) = item.default_file_id.clone() {
        item.audio_analysis = audio_analysis::audio_analysis_for_file(conn, &fid)?;
    }
    Ok(())
}

/// [`attach_files`] over a whole slice in a fixed number of queries: one files
/// query + one markers query per id-chunk, instead of 1-2 queries *per item*.
/// Every multi-item read path (listings, home rows, continue watching, search
/// and recommendation hydration) goes through this; on an HDD-backed NAS the
/// per-query overhead of the N+1 pattern dominated those endpoints.
pub(crate) fn attach_files_batch(
    conn: &Connection,
    items: &mut [MediaItem],
) -> rusqlite::Result<()> {
    if items.is_empty() {
        return Ok(());
    }
    use std::collections::HashMap;

    let ids: Vec<&str> = items.iter().map(|i| i.id.as_str()).collect();
    let mut files_by_item: HashMap<String, Vec<MediaFile>> = HashMap::new();
    for chunk in ids.chunks(IN_CHUNK) {
        let ph = vec!["?"; chunk.len()].join(",");
        // Appending item_id after FILE_COLS keeps row_to_file's indices stable.
        let mut stmt = conn.prepare(&format!(
            "SELECT {FILE_COLS},item_id FROM files WHERE item_id IN ({ph}) {FILE_ORDER}",
        ))?;
        let item_id_index = FILE_COLS.split(',').count();
        let rows = stmt.query_map(rusqlite::params_from_iter(chunk.iter()), |r| {
            Ok((r.get::<_, String>(item_id_index)?, row_to_file(r)?))
        })?;
        for row in rows {
            let (item_id, file) = row?;
            files_by_item.entry(item_id).or_default().push(file);
        }
    }

    let episode_ids: Vec<&str> = items
        .iter()
        .filter(|i| i.kind == Kind::Episode)
        .map(|i| i.id.as_str())
        .collect();
    let mut markers_by_item = markers::markers_for_items(conn, &episode_ids)?;

    for item in items.iter_mut() {
        let files = files_by_item.remove(&item.id).unwrap_or_default();
        apply_files(item, files);
        if item.kind == Kind::Episode {
            item.markers = markers_by_item.remove(&item.id).unwrap_or_default();
        }
    }

    // Loudness analysis of each item's representative file, batched like files.
    let rep_ids: Vec<&str> = items
        .iter()
        .filter_map(|i| i.default_file_id.as_deref())
        .collect();
    let mut analysis_by_file = audio_analysis::audio_analysis_for_files(conn, &rep_ids)?;
    for item in items.iter_mut() {
        if let Some(fid) = item.default_file_id.as_deref() {
            item.audio_analysis = analysis_by_file.remove(fid);
        }
    }
    Ok(())
}

/// Hydrate ids into full [`MediaItem`]s (files + markers batched), preserving
/// the input order and silently dropping unknown ids.
pub(crate) fn items_by_ids_ordered(
    conn: &Connection,
    ids: &[&str],
) -> rusqlite::Result<Vec<MediaItem>> {
    use std::collections::HashMap;
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let mut by_id: HashMap<String, MediaItem> = HashMap::with_capacity(ids.len());
    for chunk in ids.chunks(IN_CHUNK) {
        let ph = vec!["?"; chunk.len()].join(",");
        let mut stmt =
            conn.prepare(&format!("SELECT {ITEM_COLS} FROM items WHERE id IN ({ph})"))?;
        let rows = stmt.query_map(rusqlite::params_from_iter(chunk.iter()), row_to_item)?;
        for item in rows {
            let item = item?;
            by_id.insert(item.id.clone(), item);
        }
    }
    let mut items: Vec<MediaItem> = ids.iter().filter_map(|id| by_id.remove(*id)).collect();
    attach_files_batch(conn, &mut items)?;
    Ok(items)
}

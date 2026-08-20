//! Hydrating items: their files, markers and audio analysis.

use rusqlite::{params, Connection};

use kroma_domain::{Kind, MediaFile, MediaItem};

use super::{audio_analysis, markers, row_to_file, row_to_item, FILE_COLS, IN_CHUNK, ITEM_COLS};

// Load every file for one item, ordered best-first (highest resolution).
fn files_for_item(conn: &Connection, item_id: &str) -> rusqlite::Result<Vec<MediaFile>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {FILE_COLS} FROM files WHERE item_id = ?1 \
         ORDER BY (probed=1) DESC, v_width DESC NULLS LAST, id",
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
pub(crate) fn attach_files_batch(conn: &Connection, items: &mut [MediaItem]) -> rusqlite::Result<()> {
    if items.is_empty() {
        return Ok(());
    }
    use std::collections::HashMap;

    let ids: Vec<&str> = items.iter().map(|i| i.id.as_str()).collect();
    let mut files_by_item: HashMap<String, Vec<MediaFile>> = HashMap::new();
    for chunk in ids.chunks(IN_CHUNK) {
        let ph = vec!["?"; chunk.len()].join(",");
        // Appending item_id after FILE_COLS keeps row_to_file's indices stable.
        // The ORDER BY matches files_for_item, so each per-item group arrives
        // best-first and pushing preserves that order.
        let mut stmt = conn.prepare(&format!(
            "SELECT {FILE_COLS},item_id FROM files WHERE item_id IN ({ph}) \
             ORDER BY (probed=1) DESC, v_width DESC NULLS LAST, id",
        ))?;
        let rows = stmt.query_map(rusqlite::params_from_iter(chunk.iter()), |r| {
            Ok((r.get::<_, String>(18)?, row_to_file(r)?))
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
    let rep_ids: Vec<&str> =
        items.iter().filter_map(|i| i.default_file_id.as_deref()).collect();
    let mut analysis_by_file = audio_analysis::audio_analysis_for_files(conn, &rep_ids)?;
    for item in items.iter_mut() {
        if let Some(fid) = item.default_file_id.as_deref() {
            item.audio_analysis = analysis_by_file.remove(fid);
        }
    }
    Ok(())
}

// Mirror the representative file into the item's top-level fields (the shared
// tail of [`attach_files`] / [`attach_files_batch`]).
fn apply_files(item: &mut MediaItem, files: Vec<MediaFile>) {
    // Representative = first probed file (files are ordered probed-first,
    // highest-res-first), else the first file.
    let rep = files
        .iter()
        .find(|f| f.probed)
        .or_else(|| files.first());
    if let Some(rep) = rep {
        item.default_file_id = Some(rep.id.clone());
        // Demo files carry a synthetic `demo://` path and aren't streamable; keep
        // `abs_path` None for them so `/stream` returns the demo error.
        item.abs_path = rep
            .abs_path
            .clone()
            .filter(|p| !p.starts_with("demo://"));
        if rep.probed {
            item.container = rep.container.clone();
            item.duration_ms = rep.duration_ms;
            item.video = rep.video.clone();
            item.audio = rep.audio.clone();
            item.audio_tracks = rep.audio_tracks.clone();
            item.subtitles = rep.subtitles.clone();
            item.rel_path = rep.rel_path.clone();
        } else {
            // Unprobed: keep streams null but expose container/rel for browsing.
            item.container = rep.container.clone();
            item.rel_path = rep.rel_path.clone();
        }
    }
    item.files = files;
}

/// Hydrate ids into full [`MediaItem`]s (files + markers batched), preserving
/// the input order and silently dropping unknown ids.
pub(crate) fn items_by_ids_ordered(conn: &Connection, ids: &[&str]) -> rusqlite::Result<Vec<MediaItem>> {
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

#[cfg(test)]
mod apply_files_tests {
    use super::*;
    use kroma_domain::VideoStream;

    fn video() -> VideoStream {
        VideoStream { codec: "hevc".into(), width: Some(3840), height: Some(2160), hdr: false, bit_depth: Some(10) }
    }

    fn file(id: &str, abs: &str, probed: bool) -> MediaFile {
        MediaFile {
            id: id.into(),
            rel_path: Some(format!("{id}.mkv")),
            container: "mkv".into(),
            duration_ms: if probed { Some(7_200_000) } else { None },
            video: if probed { Some(video()) } else { None },
            audio: None,
            audio_tracks: Vec::new(),
            subtitles: Vec::new(),
            size: Some(1000),
            edition: None,
            probed,
            abs_path: Some(abs.into()),
        }
    }

    // An item as it comes off the row, before its files are applied.
    fn bare_item() -> MediaItem {
        MediaItem {
            id: "itm".into(),
            title: "T".into(),
            kind: Kind::Movie,
            year: None,
            duration_ms: None,
            container: String::new(),
            video: None,
            audio: None,
            audio_tracks: Vec::new(),
            subtitles: Vec::new(),
            library: "lib".into(),
            show_id: None,
            show_title: None,
            season: None,
            episode: None,
            episode_end: None,
            episode_title: None,
            rel_path: None,
            added_at: "t".into(),
            metadata: None,
            abs_path: None,
            files: Vec::new(),
            default_file_id: None,
            markers: Vec::new(),
            audio_analysis: None,
        }
    }

    #[test]
    fn an_item_with_no_files_is_left_alone() {
        let mut item = bare_item();
        apply_files(&mut item, Vec::new());
        // Nothing to represent it, so no default file and nothing streamable.
        assert!(item.default_file_id.is_none());
        assert!(item.abs_path.is_none());
        assert!(item.files.is_empty());
    }

    #[test]
    fn the_representative_is_the_first_probed_file() {
        let mut item = bare_item();
        // Files arrive probed-first, highest-res-first - but an unprobed one can
        // still lead if it was added later, so the choice is explicit.
        apply_files(&mut item, vec![file("b", "/m/b.mkv", false), file("a", "/m/a.mkv", true)]);

        assert_eq!(item.default_file_id.as_deref(), Some("a"));
        // A probed rep publishes the stream fields clients read directly.
        assert_eq!(item.duration_ms, Some(7_200_000));
        assert!(item.video.is_some());
    }

    #[test]
    fn falls_back_to_the_first_file_when_none_is_probed() {
        let mut item = bare_item();
        apply_files(&mut item, vec![file("a", "/m/a.mkv", false), file("b", "/m/b.mkv", false)]);

        assert_eq!(item.default_file_id.as_deref(), Some("a"));
        // Browsable - container and path - but no stream data invented for it.
        assert_eq!(item.container, "mkv");
        assert_eq!(item.rel_path.as_deref(), Some("a.mkv"));
        assert!(item.video.is_none());
        assert!(item.duration_ms.is_none());
    }

    #[test]
    fn a_demo_file_is_never_streamable() {
        let mut item = bare_item();
        apply_files(&mut item, vec![file("d", "demo://sample", true)]);

        // The synthetic path must NOT reach `abs_path`, so `/stream` answers the
        // demo error instead of trying to open a file that does not exist.
        assert!(item.abs_path.is_none());
        // It is still the representative file, so the item is browsable.
        assert_eq!(item.default_file_id.as_deref(), Some("d"));
        assert_eq!(item.duration_ms, Some(7_200_000));
    }

    #[test]
    fn a_real_path_is_exposed_for_streaming() {
        let mut item = bare_item();
        apply_files(&mut item, vec![file("a", "/media/a.mkv", true)]);
        assert_eq!(item.abs_path.as_deref(), Some("/media/a.mkv"));
    }

    #[test]
    fn every_file_is_kept_whichever_one_represents_the_item() {
        let mut item = bare_item();
        apply_files(
            &mut item,
            vec![file("a", "/m/a.mkv", false), file("b", "/m/b.mkv", true), file("c", "/m/c.mkv", false)],
        );
        // The picker offers all of them (Director's Cut + Theatrical, 1080p + 4K);
        // only the representative fills the legacy top-level fields.
        assert_eq!(item.files.len(), 3);
        assert_eq!(item.default_file_id.as_deref(), Some("b"));
    }
}

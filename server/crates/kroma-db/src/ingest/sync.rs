//! The scan diff-sync: libraries, shows and items, then the orphans left behind.

use std::collections::{BTreeSet, HashMap, HashSet};

use anyhow::Result;
use rusqlite::params;

use kroma_domain::{Kind, Library, LibraryKind, MediaItem, Show};

use crate::vectors::prune_orphan_vectors;
use crate::{now_or_blank, Pool};

use super::probe_result::recompute_all_representatives;
use super::prune::{delete_gone_files, delete_unlisted_libraries, prune_orphans};
use super::scanned_files::sync_files;
use super::unsettled::{forget_unsettled, note_unsettled, settle_shows};

/// The episode ids each show holds right now, for a scan that wants to know
/// which shows its walk changed. Read BEFORE a sync writes over them.
pub fn episode_ids_by_show(pool: &Pool) -> Result<HashMap<String, HashSet<String>>> {
    let conn = pool.get()?;
    let mut stmt =
        conn.prepare("SELECT show_id, id FROM items WHERE kind='episode' AND show_id IS NOT NULL")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    let mut held: HashMap<String, HashSet<String>> = HashMap::new();
    for row in rows {
        let (show_id, item_id) = row?;
        held.entry(show_id).or_default().insert(item_id);
    }
    Ok(held)
}

/// Diff-syncs the scanned index into the DB in one transaction: preserves
/// `items.metadata`/`shows.metadata` and a file's probed data when its
/// `size`+`mtime` are unchanged, unlike a blunt DELETE-all + INSERT.
pub fn sync_all(
    pool: &Pool,
    libraries: &[Library],
    shows: &[Show],
    items: &[MediaItem],
    mtimes: &HashMap<String, Option<i64>>,
) -> Result<()> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;

    sync_libraries(&tx, libraries, &HashSet::new())?;
    sync_shows(&tx, shows)?;
    sync_items(&tx, items)?;
    delete_gone_files(&tx, items, &HashSet::new())?;
    sync_files(&tx, items, mtimes)?;
    crate::imports::release_held_states(&tx)?;
    prune_orphans(&tx)?;
    forget_unsettled(&tx)?;

    tx.commit()?;
    settle(pool)
}

/// What a walk still in progress found since its last batch, all of it in one
/// library. A title arrives whole as far as the walk has read it, so a later
/// batch may bring the same title again with one more file.
pub struct ScanBatch<'a> {
    pub library: &'a Library,
    pub shows: &'a [&'a Show],
    pub items: &'a [&'a MediaItem],
    pub mtimes: &'a HashMap<String, Option<i64>>,
}

/// Writes one batch in one transaction and removes nothing, so a walk that
/// stops after it leaves a catalogue that is only short. Returns how many rows
/// it wrote: zero when the database already held everything in the batch.
/// [`finish_sync`] ends the walk.
pub fn sync_batch(pool: &Pool, batch: &ScanBatch) -> Result<usize> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;

    let outside_items = write_library(&tx, KEEP_STORED_LIBRARY, batch.library)?
        + sync_shows(&tx, batch.shows.iter().copied())?;
    let items = sync_items(&tx, batch.items.iter().copied())?;
    let files = sync_files(&tx, batch.items.iter().copied(), batch.mtimes)?;
    crate::imports::release_held_states(&tx)?;
    note_unsettled(&tx, &items.shows_with_episodes_written)?;

    tx.commit()?;
    Ok(outside_items + items.written + files)
}

/// What a walk that reached every folder found, for [`finish_sync`]. `unread`
/// names the libraries whose folders it could not read whole: they keep every
/// file. The shows in `settled` leave the unsettled list.
pub struct WalkEnd<'a> {
    pub libraries: &'a [Library],
    pub items: &'a [MediaItem],
    pub unread: &'a HashSet<String>,
    pub settled: &'a HashSet<String>,
}

/// Ends a sync that [`sync_batch`] wrote, for a walk that reached EVERY folder:
/// the libraries take their final rows, and whatever the walk did not find is
/// removed. A walk that stopped early must not call it. A show that joined the
/// unsettled list while the walk ran stays for the next walk.
pub fn finish_sync(pool: &Pool, walk: &WalkEnd) -> Result<()> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;

    sync_libraries(&tx, walk.libraries, walk.unread)?;
    delete_gone_files(&tx, walk.items, walk.unread)?;
    prune_orphans(&tx)?;
    settle_shows(&tx, walk.settled)?;

    tx.commit()?;
    settle(pool)
}

fn settle(pool: &Pool) -> Result<()> {
    recompute_all_representatives(pool)?;
    let _ = prune_orphan_vectors(pool);
    Ok(())
}

const KEEP_STORED_LIBRARY: &str = "NOTHING";
const TAKE_SCANNED_LIBRARY: &str =
    "UPDATE SET name=excluded.name, kind=excluded.kind, path=excluded.path";
const KEEP_STORED_KIND: &str = "UPDATE SET name=excluded.name, path=excluded.path";

fn write_library(tx: &rusqlite::Transaction, on_conflict: &str, l: &Library) -> Result<usize> {
    let mut stmt = tx.prepare_cached(&format!(
        "INSERT INTO libraries (id,name,kind,path,added_at) VALUES (?1,?2,?3,?4,?5) \
         ON CONFLICT(id) DO {on_conflict}"
    ))?;
    Ok(stmt.execute(params![
        l.id,
        l.name,
        library_kind_str(&l.kind),
        l.path,
        now_or_blank()
    ])?)
}

fn sync_libraries(
    tx: &rusqlite::Transaction,
    libraries: &[Library],
    unread: &HashSet<String>,
) -> Result<()> {
    for l in libraries {
        let on_conflict = if unread.contains(&l.id) {
            KEEP_STORED_KIND
        } else {
            TAKE_SCANNED_LIBRARY
        };
        write_library(tx, on_conflict, l)?;
    }
    let keep: Vec<&str> = libraries.iter().map(|l| l.id.as_str()).collect();
    delete_unlisted_libraries(tx, &keep)?;
    Ok(())
}

fn sync_shows<'a>(
    tx: &rusqlite::Transaction,
    shows: impl IntoIterator<Item = &'a Show>,
) -> Result<usize> {
    let mut show_stmt = tx.prepare(
        "INSERT INTO shows (id,library,title,year,added_at) VALUES (?1,?2,?3,?4,?5) \
         ON CONFLICT(id) DO UPDATE SET library=excluded.library, title=excluded.title, \
             year=COALESCE(excluded.year, shows.year) \
         WHERE shows.library IS NOT excluded.library OR shows.title IS NOT excluded.title \
             OR shows.year IS NOT COALESCE(excluded.year, shows.year)",
    )?;
    let mut written = 0;
    for s in shows {
        written += show_stmt.execute(params![s.id, s.library, s.title, s.year, s.added_at])?;
    }
    Ok(written)
}

struct ItemRows<'a> {
    written: usize,
    shows_with_episodes_written: BTreeSet<&'a str>,
}

fn sync_items<'a>(
    tx: &rusqlite::Transaction,
    items: impl IntoIterator<Item = &'a MediaItem>,
) -> Result<ItemRows<'a>> {
    let mut item_stmt = tx.prepare(
        "INSERT INTO items \
            (id,kind,title,year,container,library,show_id,show_title,\
             season,episode,episode_end,episode_title,rel_path,abs_path,added_at) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15) \
         ON CONFLICT(id) DO UPDATE SET \
             kind=excluded.kind, title=excluded.title, year=excluded.year, \
             library=excluded.library, show_id=excluded.show_id, \
             show_title=excluded.show_title, season=excluded.season, \
             episode=excluded.episode, episode_end=excluded.episode_end, \
             episode_title=excluded.episode_title, absent_since=NULL \
         WHERE items.absent_since IS NOT NULL OR items.kind IS NOT excluded.kind OR items.title IS NOT excluded.title \
             OR items.year IS NOT excluded.year OR items.library IS NOT excluded.library \
             OR items.show_id IS NOT excluded.show_id \
             OR items.show_title IS NOT excluded.show_title \
             OR items.season IS NOT excluded.season OR items.episode IS NOT excluded.episode \
             OR items.episode_end IS NOT excluded.episode_end \
             OR items.episode_title IS NOT excluded.episode_title",
    )?;
    let mut rows = ItemRows {
        written: 0,
        shows_with_episodes_written: BTreeSet::new(),
    };
    for i in items {
        // Seed representative columns from the first file; probing recomputes them.
        let seed = i.files.first();
        let container = seed.map(|f| f.container.clone()).unwrap_or_default();
        let rel_path = seed.and_then(|f| f.rel_path.clone());
        let abs_path = seed.and_then(|f| f.abs_path.clone());
        let written = item_stmt.execute(params![
            i.id,
            kind_str(&i.kind),
            i.title,
            i.year,
            container,
            i.library,
            i.show_id,
            i.show_title,
            i.season,
            i.episode,
            i.episode_end,
            i.episode_title,
            rel_path,
            abs_path,
            i.added_at,
        ])?;
        rows.written += written;
        if written > 0 {
            rows.shows_with_episodes_written
                .extend(i.show_id.as_deref());
        }
    }
    Ok(rows)
}

fn kind_str(k: &Kind) -> &'static str {
    match k {
        Kind::Movie => "movie",
        Kind::Episode => "episode",
        Kind::Video => "video",
    }
}

fn library_kind_str(k: &LibraryKind) -> &'static str {
    match k {
        LibraryKind::Movies => "movies",
        LibraryKind::Shows => "shows",
        LibraryKind::Mixed => "mixed",
    }
}

#[cfg(test)]
mod tests;

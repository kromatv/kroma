//! The scan diff-sync: libraries, shows and items, then the orphans left behind.

use std::collections::HashMap;

use anyhow::Result;
use rusqlite::params;

use kroma_domain::{Kind, Library, LibraryKind, MediaItem, Show};

use crate::vectors::prune_orphan_vectors;
use crate::{now_or_blank, Pool};

use super::probe_result::recompute_all_representatives;
use super::scanned_files::sync_files;

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

    sync_libraries(&tx, libraries)?;
    sync_shows(&tx, shows)?;
    sync_items(&tx, items)?;
    sync_files(&tx, items, mtimes)?;
    prune_orphans(&tx)?;

    tx.commit()?;

    recompute_all_representatives(pool)?;
    let _ = prune_orphan_vectors(pool);
    Ok(())
}

// Upserts by id, then deletes only libraries no longer scanned: a wholesale
// DELETE FROM libraries would cascade to items/files and wipe what this sync preserves.
fn sync_libraries(tx: &rusqlite::Transaction, libraries: &[Library]) -> Result<()> {
    let mut lib_stmt = tx.prepare(
        "INSERT INTO libraries (id,name,kind,path,added_at) VALUES (?1,?2,?3,?4,?5) \
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind, path=excluded.path",
    )?;
    for l in libraries {
        lib_stmt.execute(params![l.id, l.name, library_kind_str(&l.kind), l.path, now_or_blank()])?;
    }
    let keep: Vec<String> = libraries.iter().map(|l| l.id.clone()).collect();
    let mut existing: Vec<String> = Vec::new();
    {
        let mut q = tx.prepare("SELECT id FROM libraries")?;
        let rows = q.query_map([], |r| r.get::<_, String>(0))?;
        for r in rows {
            existing.push(r?);
        }
    }
    let mut del = tx.prepare("DELETE FROM libraries WHERE id = ?1")?;
    for id in &existing {
        if !keep.contains(id) {
            del.execute(params![id])?;
        }
    }
    Ok(())
}

fn sync_shows(tx: &rusqlite::Transaction, shows: &[Show]) -> Result<()> {
    let mut show_stmt = tx.prepare(
        "INSERT INTO shows (id,library,title,year,added_at) VALUES (?1,?2,?3,?4,?5) \
         ON CONFLICT(id) DO UPDATE SET library=excluded.library, title=excluded.title, \
             year=COALESCE(excluded.year, shows.year)",
    )?;
    for s in shows {
        show_stmt.execute(params![s.id, s.library, s.title, s.year, s.added_at])?;
    }
    Ok(())
}

fn sync_items(tx: &rusqlite::Transaction, items: &[MediaItem]) -> Result<()> {
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
             episode_title=excluded.episode_title",
    )?;
    for i in items {
        // Seed representative columns from the first file; probing recomputes them.
        let seed = i.files.first();
        let container = seed.map(|f| f.container.clone()).unwrap_or_default();
        let rel_path = seed.and_then(|f| f.rel_path.clone());
        let abs_path = seed.and_then(|f| f.abs_path.clone());
        item_stmt.execute(params![
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
    }
    Ok(())
}

// Prunes items/shows with no backing files, then the language-cache rows for
// vanished titles (no FK on those tables, so the item/show cascade misses them).
fn prune_orphans(tx: &rusqlite::Transaction) -> Result<()> {
    tx.execute("DELETE FROM items WHERE id NOT IN (SELECT DISTINCT item_id FROM files)", [])?;
    tx.execute("DELETE FROM shows WHERE id NOT IN (SELECT DISTINCT show_id FROM items WHERE show_id IS NOT NULL)", [])?;

    tx.execute(
        "DELETE FROM metadata_core WHERE \
            (subject_kind='item' AND subject_id NOT IN (SELECT id FROM items)) OR \
            (subject_kind='show' AND subject_id NOT IN (SELECT id FROM shows))",
        [],
    )?;
    tx.execute(
        "DELETE FROM translations WHERE subject_kind IN ('item','episode') \
            AND subject_id NOT IN (SELECT id FROM items)",
        [],
    )?;
    tx.execute(
        "DELETE FROM translations WHERE subject_kind='show' \
            AND subject_id NOT IN (SELECT id FROM shows)",
        [],
    )?;
    tx.execute(
        "DELETE FROM translations WHERE subject_kind='season_cast' \
            AND substr(subject_id, 1, instr(subject_id, ':') - 1) NOT IN (SELECT id FROM shows)",
        [],
    )?;
    Ok(())
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
mod tests {
    use super::*;
    use crate::ingest::test_support::*;
    use crate::{
        item_has_probed_file, item_probed, set_file_probe, set_item_metadata, unprobed_files,
    };

    #[test]
    fn sync_all_creates_updates_and_prunes() {
        let p = pool();
        let items = vec![
            movie("m1", "Dune", "lib", vec![file("f1", "/media/m1.mkv", false)]),
            movie("m2", "Arrival", "lib", vec![file("f2", "/media/m2.mkv", false)]),
        ];
        sync_all(&p, &[lib("lib")], &[], &items, &mtimes_of(&items, 100)).unwrap();
        assert_eq!(crate::counts(&p).unwrap(), (1, 2, 0));
        let got = crate::get_item(&p, "m1").unwrap().unwrap();
        assert_eq!(got.files.len(), 1);
        assert_eq!(got.container, "mkv"); // seeded from the file until a probe recomputes

        let mut unprobed = unprobed_files(&p).unwrap();
        unprobed.sort();
        assert_eq!(unprobed.len(), 2);
        assert!(unprobed.iter().any(|(id, abs, item)| id == "f1" && abs == "/media/m1.mkv" && item == "m1"));

        let items = vec![movie("m1", "Dune", "lib", vec![file("f1", "/media/m1.mkv", false)])];
        sync_all(&p, &[lib("lib")], &[], &items, &mtimes_of(&items, 100)).unwrap();
        assert_eq!(crate::counts(&p).unwrap(), (1, 1, 0));
        assert!(crate::get_item(&p, "m2").unwrap().is_none());
    }

    #[test]
    fn sync_preserves_metadata_and_probe_across_rescans() {
        let p = pool();
        let items = vec![movie("m1", "Dune", "lib", vec![file("f1", "/media/m1.mkv", false)])];
        sync_all(&p, &[lib("lib")], &[], &items, &mtimes_of(&items, 100)).unwrap();

        set_file_probe(&p, "f1", Some(7_200_000), Some(&video()), None, &[], &[]).unwrap();
        set_item_metadata(&p, "m1", &meta(603, "Dune")).unwrap();
        assert!(item_has_probed_file(&p, "m1").unwrap());

        sync_all(&p, &[lib("lib")], &[], &items, &mtimes_of(&items, 100)).unwrap();
        assert!(item_probed(&p, "m1").unwrap(), "unchanged file keeps probed=1");
        let got = crate::get_item(&p, "m1").unwrap().unwrap();
        assert_eq!(got.metadata.as_ref().map(|m| m.tmdb_id), Some(603));

        sync_all(&p, &[lib("lib")], &[], &items, &mtimes_of(&items, 999)).unwrap();
        assert!(!item_probed(&p, "m1").unwrap(), "changed file resets probed=0");
        assert!(crate::get_item(&p, "m1").unwrap().unwrap().metadata.is_some());
    }

    #[test]
    fn a_scan_that_cannot_write_an_item_fails_whole_rather_than_half() {
        let p = pool();
        p.get()
            .unwrap()
            .execute_batch(
                "CREATE TRIGGER no_item_insert BEFORE INSERT ON items \
                 BEGIN SELECT RAISE(ABORT, 'refused'); END",
            )
            .unwrap();

        let items = vec![movie("m1", "Dune", "lib", vec![file("f1", "/media/m1.mkv", false)])];
        assert!(sync_all(&p, &[lib("lib")], &[], &items, &HashMap::new()).is_err());
    }

    #[test]
    fn every_kind_is_stored_under_the_spelling_the_queries_filter_on() {
        assert_eq!(kind_str(&Kind::Movie), "movie");
        assert_eq!(kind_str(&Kind::Episode), "episode");
        assert_eq!(kind_str(&Kind::Video), "video");

        assert_eq!(library_kind_str(&LibraryKind::Movies), "movies");
        assert_eq!(library_kind_str(&LibraryKind::Shows), "shows");
        assert_eq!(library_kind_str(&LibraryKind::Mixed), "mixed");
    }
}

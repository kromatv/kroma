use serde_json::json;

use super::super::test_support::{fresh, user_count};
use super::super::{Backup, ImportError, export, import, preview};
use super::*;
use crate::db::{self, Pool};
use crate::services::settings::HeldLibrary;

fn library(id: &str, folder: &str) -> LibraryDef {
    LibraryDef {
        id: id.into(),
        name: id.into(),
        kind: "movies".into(),
        folders: vec![folder.into()],
        auto_scan: true,
    }
}

fn a_backup_of(libraries: Option<&[LibraryDef]>) -> Vec<u8> {
    let (source, dir) = fresh("lib-src");
    if let Some(libraries) = libraries {
        db::settings_set(&source, "libraries", &json!(libraries)).unwrap();
    }
    db::settings_set(&source, "serverName", &json!("Server A")).unwrap();
    export(&source, dir.path(), None).unwrap()
}

fn unlocked(bytes: &[u8]) -> Backup<'_> {
    Backup {
        bytes,
        password: None,
    }
}

fn holding(pool: &Pool, libraries: &[LibraryDef]) {
    db::settings_set(pool, "libraries", &json!(libraries)).unwrap();
    for def in libraries {
        pool.get()
            .unwrap()
            .execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES (?1,?1,'movies','',  't')",
                [&def.id],
            )
            .unwrap();
    }
}

fn saved_libraries(pool: &Pool) -> Vec<String> {
    let stored: String = pool
        .get()
        .unwrap()
        .query_row(
            "SELECT value FROM settings WHERE key = 'libraries'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let defs: Vec<LibraryDef> = serde_json::from_str(&stored).unwrap();
    defs.into_iter().map(|def| def.id).collect()
}

fn merging(now: &[LibraryDef]) -> Plan {
    Plan {
        reset: false,
        now: Ok(now.to_vec()),
        seed: Vec::new(),
    }
}

fn resetting(seed: &[LibraryDef]) -> Plan {
    Plan {
        reset: true,
        now: Ok(Vec::new()),
        seed: seed.to_vec(),
    }
}

#[test]
fn a_restore_without_reset_keeps_this_servers_libraries_and_adds_the_backups() {
    let backup = a_backup_of(Some(&[library("films", "/a/films")]));
    let (target, dir) = fresh("lib-merge");
    let series = [library("series", "/b/series")];
    holding(&target, &series);

    import(&target, dir.path(), &backup, None, &merging(&series)).unwrap();

    assert_eq!(saved_libraries(&target), ["series", "films"]);
}

#[test]
fn a_backup_library_this_server_has_by_id_or_by_folder_is_not_added_again() {
    let backup = a_backup_of(Some(&[
        library("series", "/elsewhere/series"),
        library("old-series", "/b/series/"),
        library("four-k", "/b/series/4k"),
        library("films", "/a/films"),
    ]));
    let (target, dir) = fresh("lib-known");
    let series = [library("series", "/b/series")];
    holding(&target, &series);

    import(&target, dir.path(), &backup, None, &merging(&series)).unwrap();

    assert_eq!(saved_libraries(&target), ["series", "films"]);
}

#[test]
fn a_restore_without_reset_says_it_removes_no_library() {
    let backup = a_backup_of(Some(&[library("films", "/a/films")]));
    let (target, _dir) = fresh("lib-preview-merge");
    let series = [library("series", "/b/series")];
    holding(&target, &series);

    let removed = preview(&target, &unlocked(&backup), &merging(&series)).unwrap();

    assert_eq!(removed, Vec::<HeldLibrary>::new());
}

#[test]
fn a_restore_with_reset_names_the_libraries_it_will_remove_before_it_runs() {
    let backup = a_backup_of(Some(&[library("films", "/a/films")]));
    let (target, _dir) = fresh("lib-preview-reset");
    holding(&target, &[library("series", "/b/series")]);

    let removed = preview(&target, &unlocked(&backup), &resetting(&[])).unwrap();

    assert_eq!(
        removed,
        [HeldLibrary {
            id: "series".into(),
            name: "series".into(),
        }]
    );
    assert_eq!(saved_libraries(&target), ["series"]);
}

#[test]
fn a_reset_from_a_backup_with_no_saved_list_removes_only_what_the_seed_leaves_out() {
    let backup = a_backup_of(None);
    let (target, _dir) = fresh("lib-preview-seed");
    holding(
        &target,
        &[library("series", "/b/series"), library("films", "/a/films")],
    );

    let removed = preview(
        &target,
        &unlocked(&backup),
        &resetting(&[library("series", "/b/series")]),
    )
    .unwrap();

    assert_eq!(
        removed.iter().map(|l| l.id.as_str()).collect::<Vec<_>>(),
        ["films"]
    );
}

#[test]
fn a_restore_without_reset_onto_a_list_that_cannot_be_read_restores_nothing() {
    let backup = a_backup_of(Some(&[library("films", "/a/films")]));
    let (target, dir) = fresh("lib-unreadable");
    let plan = Plan {
        reset: false,
        now: Err(crate::services::settings::UnreadableLibraryList),
        seed: Vec::new(),
    };

    let restored = import(&target, dir.path(), &backup, None, &plan);

    assert!(matches!(restored, Err(ImportError::LibraryListUnreadable)));
    assert_eq!(user_count(&target), 0);
    let named: i64 = target
        .get()
        .unwrap()
        .query_row(
            "SELECT COUNT(*) FROM settings WHERE key = 'serverName'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(named, 0);
}

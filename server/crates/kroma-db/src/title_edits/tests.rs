use std::collections::HashSet;

use super::*;
use crate::testing::{temp_pool, TempPool};
use crate::text_beside::{self, Nfo, Text};

fn renamed(title: &str) -> TitleEdit {
    TitleEdit {
        title: Some(title.into()),
        year: Some(1987),
        ..Default::default()
    }
}

fn catalog() -> TempPool {
    let pool = temp_pool("title-edits");
    let conn = pool.get().unwrap();
    conn.execute_batch(
        "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t');
         INSERT INTO items (id,kind,title,year,container,library,added_at) \
             VALUES ('m1','movie','tape.03','2004','mkv','lib','t');
         INSERT INTO shows (id,library,title,added_at) VALUES ('s1','lib','Show','t');",
    )
    .unwrap();
    pool
}

#[test]
fn an_edit_reads_back_and_an_empty_one_hands_the_title_back() {
    let pool = temp_pool("title-edits");

    write(
        &pool,
        Title {
            kind: ITEM,
            id: "m1",
        },
        &renamed("Home movies"),
    )
    .unwrap();
    let kept = written(
        &pool,
        Title {
            kind: ITEM,
            id: "m1",
        },
    )
    .unwrap();
    write(
        &pool,
        Title {
            kind: ITEM,
            id: "m1",
        },
        &TitleEdit::default(),
    )
    .unwrap();
    let after = written(
        &pool,
        Title {
            kind: ITEM,
            id: "m1",
        },
    )
    .unwrap();

    assert_eq!(kept, renamed("Home movies"));
    assert!(after.is_empty());
}

#[test]
fn an_edit_is_kept_for_one_kind_of_title_only() {
    let pool = temp_pool("title-edits");

    write(
        &pool,
        Title {
            kind: SHOW,
            id: "x1",
        },
        &renamed("Our show"),
    )
    .unwrap();

    assert!(written(
        &pool,
        Title {
            kind: ITEM,
            id: "x1"
        }
    )
    .unwrap()
    .is_empty());
    assert_eq!(
        written(
            &pool,
            Title {
                kind: SHOW,
                id: "x1"
            }
        )
        .unwrap(),
        renamed("Our show")
    );
}

#[test]
fn the_catalog_search_reads_wears_what_was_written_by_hand() {
    let pool = catalog();
    write(
        &pool,
        Title {
            kind: ITEM,
            id: "m1",
        },
        &renamed("Home movies"),
    )
    .unwrap();
    write(
        &pool,
        Title {
            kind: SHOW,
            id: "s1",
        },
        &renamed("Our show"),
    )
    .unwrap();

    let (items, shows) = crate::index_snapshot(&pool).unwrap();

    assert_eq!(items[0].title, "Home movies");
    assert_eq!(items[0].year, Some(1987));
    assert_eq!(shows[0].title, "Our show");
}

fn read_beside(pool: &TempPool, kind: &'static str, id: &str, edit: TitleEdit) {
    let text = Text {
        nfo: Nfo {
            subject_kind: kind,
            subject_id: id.into(),
            library: "lib".into(),
            path: format!("/media/{id}.nfo"),
            modified: None,
        },
        edit,
        tmdb: None,
    };
    text_beside::replace(pool, &[text], &HashSet::new()).unwrap();
}

fn in_file() -> TitleEdit {
    TitleEdit {
        title: Some("Tape three".into()),
        overview: Some("Found in the attic.".into()),
        year: Some(2004),
        genres: Some(vec!["Family".into()]),
    }
}

#[test]
fn what_was_written_by_hand_comes_before_the_file_beside_an_unmatched_title() {
    let pool = catalog();
    read_beside(&pool, ITEM, "m1", in_file());
    let title = Title {
        kind: ITEM,
        id: "m1",
    };
    write(&pool, title, &renamed("Home movies")).unwrap();

    let conn = pool.get().unwrap();
    let shown = shown(&conn, ITEM, &["m1"]).unwrap();

    let edit = shown.get("m1").expect("a text for the film");
    assert_eq!(edit.title.as_deref(), Some("Home movies"));
    assert_eq!(edit.year, Some(1987));
    assert_eq!(edit.overview.as_deref(), Some("Found in the attic."));
    assert_eq!(written(&pool, title).unwrap(), renamed("Home movies"));
}

#[test]
fn the_file_beside_a_title_the_provider_matched_is_not_shown() {
    let pool = catalog();
    read_beside(&pool, ITEM, "m1", in_file());
    read_beside(&pool, SHOW, "s1", renamed("Our show"));
    let conn = pool.get().unwrap();
    conn.execute(
        "INSERT INTO metadata_core (subject_kind, subject_id, tmdb_id, updated_at) \
         VALUES ('item', 'm1', 949, 0), ('show', 's1', NULL, 0)",
        [],
    )
    .unwrap();

    let (items, shows) = crate::index_snapshot(&pool).unwrap();

    assert_eq!(items[0].title, "tape.03");
    assert_eq!(shows[0].title, "Our show");
}

#[test]
fn a_stored_edit_that_cannot_be_read_is_passed_over() {
    let pool = catalog();
    let conn = pool.get().unwrap();
    conn.execute(
        "INSERT INTO title_edits VALUES ('item', 'm1', 'not json', 0)",
        [],
    )
    .unwrap();

    let (items, _) = crate::index_snapshot(&pool).unwrap();

    assert_eq!(items[0].title, "tape.03");
    assert!(written(
        &pool,
        Title {
            kind: ITEM,
            id: "m1"
        }
    )
    .unwrap()
    .is_empty());
}

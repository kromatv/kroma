use kroma_domain::imports::{Origin, Selection};
use kroma_domain::{Permission, PlayEntry};

use super::test_support::{count, data_dir, fresh_pool};
use super::{export_portable, import_portable};
use crate::imports::{add_plays, queue, server_key, NewImport, NewPlay, Place};
use crate::{create_user, PlayFilter, Pool};

const IMPORTER: &str = "tv.x.import";
const LAST_WEEK: i64 = 1_700_000_000;
const RONIN: &str = "/films/Ronin (1998)/Ronin.mkv";

fn a_film(pool: &Pool, id: &str) {
    let seeded = format!(
        "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('films','Films','movies','/films','t'); \
         INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('{id}','movie','{id}','mkv','films','t');"
    );
    pool.get().unwrap().execute_batch(&seeded).unwrap();
}

fn played<'a>(id: &'a str, account: &'a str, place: Place<'a>) -> NewPlay<'a> {
    NewPlay {
        id,
        account,
        place,
        played_at: LAST_WEEK,
        duration_ms: None,
    }
}

fn a_scan_writes(pool: &Pool, path: &str, item: &str) {
    let conn = pool.get().unwrap();
    conn.execute(
        "INSERT INTO files (id,item_id,abs_path) VALUES (?1,?2,?1)",
        [path, item],
    )
    .unwrap();
    crate::imports::release_held_states(&conn).unwrap();
}

fn a_server_that_brought_one_play_and_holds_another(pool: &Pool) -> String {
    let living_room = Origin {
        id: "srv".into(),
        name: "Living room".into(),
    };
    let import = NewImport {
        id: "i1",
        importer: IMPORTER,
        server: &living_room,
        sign_in: "s-1",
        selection: &Selection::default(),
        started_by: None,
        created_ms: 1,
    };
    assert!(queue(pool, &import).unwrap());
    let ana = create_user(pool, "ana@example.test", "ana", "", &[Permission::Playback]).unwrap();
    a_film(pool, "heat");
    let plays = [
        played("p1", &ana.id, Place::Title("heat")),
        played("p2", &ana.id, Place::File(RONIN)),
    ];
    add_plays(pool, &server_key(IMPORTER, "srv"), &plays).unwrap();
    ana.id
}

fn logged(pool: &Pool) -> Vec<PlayEntry> {
    crate::plays(pool, &PlayFilter::default(), 50, 0).unwrap()
}

fn restored_from(src: &Pool, tag: &str) -> crate::testing::TempPool {
    let doc = export_portable(src, &data_dir(src)).unwrap();
    let dst = fresh_pool(tag);
    import_portable(&dst, &data_dir(&dst), &doc, true).unwrap();
    dst
}

#[test]
fn an_imported_play_comes_back_with_its_account_its_time_and_the_server_it_came_from() {
    let src = fresh_pool("imported-src");
    let ana = a_server_that_brought_one_play_and_holds_another(&src);

    let dst = restored_from(&src, "imported-dst");

    let log = logged(&dst);
    assert_eq!(log.len(), 1);
    assert_eq!(log[0].user_id.as_deref(), Some(ana.as_str()));
    assert_eq!(
        (log[0].title.as_str(), log[0].ended_at),
        ("heat", LAST_WEEK)
    );
    assert_eq!(
        log[0].imported_from.as_ref().map(|from| from.name.as_str()),
        Some("Living room")
    );
    assert!(log[0].watched_is_runtime);
}

#[test]
fn a_play_an_import_still_holds_comes_back_held_and_joins_the_log_at_the_scan() {
    let src = fresh_pool("held-src");
    a_server_that_brought_one_play_and_holds_another(&src);
    let dst = restored_from(&src, "held-dst");
    let held = count(&dst, "import_held_plays");
    a_film(&dst, "ronin");

    a_scan_writes(&dst, RONIN, "ronin");

    assert_eq!(held, 1);
    assert_eq!(count(&dst, "import_held_plays"), 0);
    assert_eq!(logged(&dst).len(), 2);
}

#[test]
fn an_imported_play_restored_twice_is_one_row() {
    let src = fresh_pool("twice-src");
    a_server_that_brought_one_play_and_holds_another(&src);
    let doc = export_portable(&src, &data_dir(&src)).unwrap();
    let dst = fresh_pool("twice-dst");
    import_portable(&dst, &data_dir(&dst), &doc, false).unwrap();

    import_portable(&dst, &data_dir(&dst), &doc, false).unwrap();

    assert_eq!(count(&dst, "play_history"), 1);
    assert_eq!(count(&dst, "import_held_plays"), 1);
}

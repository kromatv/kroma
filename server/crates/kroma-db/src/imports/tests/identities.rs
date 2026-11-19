use std::collections::HashMap;

use super::*;

const HEAT: &str = "/films/Heat (1995)/Heat.mkv";
const PILOT: &str = "/shows/The Wire/S01E01.mkv";
const BUYS: &str = "/shows/The Wire/S01E03.mkv";

fn a_server(pool: &Pool) -> String {
    assert!(queue_from(pool, "i1", &living_room()));
    server_key(IMPORTER, "srv")
}

fn held(tmdb: Option<u64>, imdb: Option<&str>, tvdb: Option<u64>) -> HeldIds {
    HeldIds {
        tmdb,
        elsewhere: Elsewhere {
            imdb: imdb.map(str::to_string),
            tvdb,
        },
    }
}

fn of(path: &str, subject: Subject, ids: HeldIds) -> FileIdentity {
    FileIdentity {
        path: path.into(),
        subject,
        ids,
    }
}

fn known_by_imdb(imdb: &str) -> Elsewhere {
    Elsewhere {
        imdb: Some(imdb.into()),
        tvdb: None,
    }
}

fn a_library(pool: &Pool) {
    pool.get()
        .unwrap()
        .execute(
            "INSERT OR IGNORE INTO libraries (id, name, kind, path, added_at) \
             VALUES ('lib', 'Lib', 'mixed', '/lib', 't')",
            [],
        )
        .unwrap();
}

fn a_file(pool: &Pool, item: &str, path: &str) {
    pool.get()
        .unwrap()
        .execute(
            "INSERT INTO files (id, item_id, abs_path) VALUES (?1, ?2, ?3)",
            params![format!("f-{item}"), item, path],
        )
        .unwrap();
}

fn a_scanned_film(pool: &Pool, item: &str, path: &str) {
    a_library(pool);
    pool.get()
        .unwrap()
        .execute(
            "INSERT INTO items (id, title, kind, container, library, added_at) \
             VALUES (?1, 'X', 'movie', 'mkv', 'lib', 't')",
            [item],
        )
        .unwrap();
    a_file(pool, item, path);
}

fn a_scanned_episode(pool: &Pool, show: &str, item: &str, path: &str) {
    a_library(pool);
    let conn = pool.get().unwrap();
    conn.execute(
        "INSERT OR IGNORE INTO shows (id, library, title, added_at) VALUES (?1, 'lib', 'S', 't')",
        [show],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO items (id, title, kind, container, library, show_id, season, episode, added_at) \
         VALUES (?1, 'E', 'episode', 'mkv', 'lib', ?2, 1, 1, 't')",
        [item, show],
    )
    .unwrap();
    a_file(pool, item, path);
}

fn rows(pool: &Pool) -> i64 {
    pool.get()
        .unwrap()
        .query_row("SELECT COUNT(*) FROM import_identities", [], |r| r.get(0))
        .unwrap()
}

#[test]
fn an_identity_leads_to_the_film_the_scan_made_of_its_file() {
    let p = pool();
    let server_id = a_server(&p);
    a_scanned_film(&p, "film-1", HEAT);
    let heat = of(HEAT, Subject::Movie, held(Some(949), None, None));

    let written = keep_identities(&p, &server_id, &[heat]).unwrap();

    let films = identity_leads(&p, Subject::Movie).unwrap();
    assert_eq!(written, vec![true]);
    assert_eq!(
        films,
        HashMap::from([("film-1".to_string(), Lead::Tmdb(949))])
    );
}

#[test]
fn an_identity_kept_again_as_it_is_writes_nothing_and_leaves_one_copy() {
    let p = pool();
    let server_id = a_server(&p);
    let heat = of(
        HEAT,
        Subject::Movie,
        held(Some(949), Some("tt0113277"), None),
    );
    keep_identities(&p, &server_id, std::slice::from_ref(&heat)).unwrap();

    let written = keep_identities(&p, &server_id, &[heat]).unwrap();

    assert_eq!(written, vec![false]);
    assert_eq!(rows(&p), 1);
}

#[test]
fn an_identity_that_changed_takes_the_newer_ids_and_is_asked_about_again() {
    let p = pool();
    let server_id = a_server(&p);
    a_scanned_film(&p, "film-1", HEAT);
    let first = of(HEAT, Subject::Movie, held(None, Some("tt0000001"), None));
    keep_identities(&p, &server_id, &[first]).unwrap();
    answer_identities(&p, Subject::Movie, &known_by_imdb("tt0000001"), Some(11)).unwrap();
    let corrected = of(HEAT, Subject::Movie, held(None, Some("tt0113277"), None));

    let written = keep_identities(&p, &server_id, &[corrected]).unwrap();

    let films = identity_leads(&p, Subject::Movie).unwrap();
    assert_eq!(written, vec![true]);
    assert_eq!(films["film-1"], Lead::Ask(known_by_imdb("tt0113277")));
    assert_eq!(rows(&p), 1);
}

#[test]
fn the_identity_of_an_episode_leads_to_its_show() {
    let p = pool();
    let server_id = a_server(&p);
    a_scanned_episode(&p, "show-1", "ep-1", PILOT);
    let the_wire = of(PILOT, Subject::Show, held(Some(1438), None, None));

    keep_identities(&p, &server_id, &[the_wire]).unwrap();

    let shows = identity_leads(&p, Subject::Show).unwrap();
    let films = identity_leads(&p, Subject::Movie).unwrap();
    assert_eq!(
        shows,
        HashMap::from([("show-1".to_string(), Lead::Tmdb(1438))])
    );
    assert!(films.is_empty());
}

#[test]
fn a_film_s_identity_leads_nowhere_for_a_file_this_server_reads_as_an_episode() {
    let p = pool();
    let server_id = a_server(&p);
    a_scanned_episode(&p, "show-1", "ep-1", PILOT);
    let a_film = of(PILOT, Subject::Movie, held(Some(949), None, None));

    keep_identities(&p, &server_id, &[a_film]).unwrap();

    assert!(identity_leads(&p, Subject::Show).unwrap().is_empty());
    assert!(identity_leads(&p, Subject::Movie).unwrap().is_empty());
}

#[test]
fn an_identity_for_a_file_no_scan_reached_leads_nowhere_yet() {
    let p = pool();
    let server_id = a_server(&p);
    let heat = of(HEAT, Subject::Movie, held(Some(949), None, None));

    keep_identities(&p, &server_id, &[heat]).unwrap();

    assert!(identity_leads(&p, Subject::Movie).unwrap().is_empty());
}

#[test]
fn an_identity_with_no_tmdb_id_is_to_ask_about_until_tmdb_answers() {
    let p = pool();
    let server_id = a_server(&p);
    a_scanned_film(&p, "film-1", HEAT);
    let heat = of(HEAT, Subject::Movie, held(None, Some("tt0113277"), None));
    keep_identities(&p, &server_id, &[heat]).unwrap();
    let asked = known_by_imdb("tt0113277");

    let before = identity_leads(&p, Subject::Movie).unwrap();
    answer_identities(&p, Subject::Movie, &asked, Some(949)).unwrap();
    let after = identity_leads(&p, Subject::Movie).unwrap();

    assert_eq!(before["film-1"], Lead::Ask(asked));
    assert_eq!(after["film-1"], Lead::Tmdb(949));
}

#[test]
fn an_identity_tmdb_knows_no_title_for_leads_nowhere() {
    let p = pool();
    let server_id = a_server(&p);
    a_scanned_film(&p, "film-1", HEAT);
    let heat = of(HEAT, Subject::Movie, held(None, Some("tt0113277"), None));
    keep_identities(&p, &server_id, &[heat]).unwrap();

    answer_identities(&p, Subject::Movie, &known_by_imdb("tt0113277"), None).unwrap();

    assert!(identity_leads(&p, Subject::Movie).unwrap().is_empty());
}

#[test]
fn an_answer_for_a_film_is_none_for_a_show_known_by_the_same_ids() {
    let p = pool();
    let server_id = a_server(&p);
    a_scanned_episode(&p, "show-1", "ep-1", PILOT);
    let the_wire = of(PILOT, Subject::Show, held(None, Some("tt0306414"), None));
    keep_identities(&p, &server_id, &[the_wire]).unwrap();
    let asked = known_by_imdb("tt0306414");

    answer_identities(&p, Subject::Movie, &asked, Some(949)).unwrap();

    let shows = identity_leads(&p, Subject::Show).unwrap();
    assert_eq!(shows["show-1"], Lead::Ask(asked));
}

#[test]
fn among_the_files_of_a_show_one_that_names_a_tmdb_id_leads() {
    let p = pool();
    let server_id = a_server(&p);
    a_scanned_episode(&p, "show-1", "ep-1", PILOT);
    a_scanned_episode(&p, "show-1", "ep-3", BUYS);
    let by_imdb = of(PILOT, Subject::Show, held(None, Some("tt0306414"), None));
    let by_tmdb = of(BUYS, Subject::Show, held(Some(1438), None, None));

    keep_identities(&p, &server_id, &[by_imdb, by_tmdb]).unwrap();

    let shows = identity_leads(&p, Subject::Show).unwrap();
    assert_eq!(shows["show-1"], Lead::Tmdb(1438));
}

#[test]
fn one_film_or_one_show_is_asked_for_by_its_own_id() {
    let p = pool();
    let server_id = a_server(&p);
    a_scanned_film(&p, "film-1", HEAT);
    a_scanned_episode(&p, "show-1", "ep-1", PILOT);
    let kept = [
        of(HEAT, Subject::Movie, held(Some(949), None, None)),
        of(PILOT, Subject::Show, held(None, None, Some(79126))),
    ];
    keep_identities(&p, &server_id, &kept).unwrap();
    let conn = p.get().unwrap();

    let film = identity_lead(&conn, Subject::Movie, "film-1").unwrap();
    let show = identity_lead(&conn, Subject::Show, "show-1").unwrap();
    let nobody = identity_lead(&conn, Subject::Movie, "show-1").unwrap();

    assert_eq!(film, Some(Lead::Tmdb(949)));
    assert_eq!(
        show,
        Some(Lead::Ask(Elsewhere {
            imdb: None,
            tvdb: Some(79126),
        }))
    );
    assert_eq!(nobody, None);
}

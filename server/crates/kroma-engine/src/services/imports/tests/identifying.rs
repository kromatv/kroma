use kroma_testing::TempDir;

use super::super::stages::Core;
use super::this_machine::{at, films_at, this_machine};
use super::*;
use crate::model::imports::Tally;

const IDENTITIES: &str = "SELECT abs_path || '|' || subject || '|' || COALESCE(tmdb_id, '') \
    || '|' || COALESCE(imdb_id, '') FROM import_identities ORDER BY 1";

fn known(id: &str, name: &str, ids: Value) -> Value {
    let mut title = film(id, name);
    title["ids"] = ids;
    title
}

fn a_server_that_matched_two_films_of_three() -> OtherServer {
    let server = household();
    server.change(|household| {
        household.titles = vec![
            ("1", known("t1", "Heat", json!({ "tmdb": "949" }))),
            ("1", known("t2", "Ronin", json!({ "imdb": "tt0122690" }))),
            ("1", film("t3", "Thief")),
        ];
    });
    server
}

fn the_two_identities(disk: &TempDir) -> Vec<String> {
    let films = disk.path().canonicalize().unwrap().join("films");
    vec![
        format!("{}|movie|949|", films.join("Heat/Heat.mkv").display()),
        format!(
            "{}|movie||tt0122690",
            films.join("Ronin/Ronin.mkv").display()
        ),
    ]
}

fn titles(read: u64, brought: u64) -> Tally {
    Tally {
        read,
        brought,
        unmatched: 0,
    }
}

fn forget_the_titles_recorded(state: &SharedState) {
    state
        .db
        .get()
        .unwrap()
        .execute("DELETE FROM import_records WHERE kind = 'title'", [])
        .unwrap();
}

#[tokio::test]
async fn an_import_keeps_the_identity_of_each_film_under_its_file_on_this_machine() {
    let disk = this_machine(&["films"]);
    let state = importing_from(&a_server_that_matched_two_films_of_three());

    let ran = import(&state, &Core, &films_at(&at(&disk, "films")));

    assert_eq!(lines(&state, IDENTITIES), the_two_identities(&disk));
    assert_eq!(ran.import.report.titles, titles(3, 2));
}

#[tokio::test]
async fn a_second_import_with_nothing_changed_keeps_no_identity_again() {
    let disk = this_machine(&["films"]);
    let state = importing_from(&a_server_that_matched_two_films_of_three());
    import(&state, &Core, &films_at(&at(&disk, "films")));

    let again = import(&state, &Core, &kept(&["1"], &[]));

    assert_eq!(lines(&state, IDENTITIES), the_two_identities(&disk));
    assert_eq!(again.import.report.titles, titles(3, 0));
}

#[tokio::test]
async fn a_film_offered_again_before_it_was_recorded_keeps_one_identity() {
    let disk = this_machine(&["films"]);
    let state = importing_from(&a_server_that_matched_two_films_of_three());
    import(&state, &Core, &films_at(&at(&disk, "films")));
    let recorded = records(&state);
    forget_the_titles_recorded(&state);

    let again = import(&state, &Core, &kept(&["1"], &[]));

    assert_eq!(lines(&state, IDENTITIES), the_two_identities(&disk));
    assert_eq!(again.import.report.titles, titles(3, 0));
    assert_eq!(records(&state).len(), recorded.len());
}

#[tokio::test]
async fn a_film_under_a_folder_the_owner_confirms_later_is_kept_by_that_import() {
    let disk = this_machine(&["films"]);
    let state = importing_from(&a_server_that_matched_two_films_of_three());
    let unanswered = import(&state, &Core, &kept(&["1"], &[]));
    let kept_at_first = lines(&state, IDENTITIES);

    let answered = import(&state, &Core, &films_at(&at(&disk, "films")));

    assert_eq!(unanswered.import.report.titles, titles(3, 0));
    assert_eq!(kept_at_first, Vec::<String>::new());
    assert_eq!(answered.import.report.titles, titles(3, 2));
    assert_eq!(lines(&state, IDENTITIES), the_two_identities(&disk));
}

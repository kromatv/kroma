use super::super::paths::Translation;
use super::super::stages::Core;
use super::super::{FoldersAsk, folders_here};
use super::this_machine::{
    answered, at, became, films_at, libraries, review, sources, this_machine,
};
use super::*;

fn kept_folders(state: &SharedState) -> Translation {
    let server_id = db::imports::server_key(IMPORTER, "srv");
    Translation::kept(&state.db, &server_id).unwrap()
}

fn asked_about(state: &SharedState, folders: &[&str]) -> Vec<Option<String>> {
    let ask = FoldersAsk {
        importer: IMPORTER.into(),
        server: "srv".into(),
        folders: folders.iter().map(|folder| (*folder).into()).collect(),
    };
    folders_here(state, &ask).unwrap()
}

#[test]
fn a_folder_the_owner_did_not_confirm_becomes_no_source_though_this_machine_has_it() {
    let disk = this_machine(&["films"]);
    let server = household();
    server.change(|household| {
        household.survey["libraries"][0]["folders"] = json!([at(&disk, "films")]);
    });
    let state = importing_from(&server);

    let ran = import(&state, &Core, &kept(&["1"], &[]));

    assert!(sources(&state).is_empty());
    assert!(became(&state).is_empty());
    assert_eq!(ran.import.report.libraries, libraries(1, 0));
}

#[tokio::test]
async fn a_folder_the_other_server_adds_after_the_review_is_left_out_of_the_source() {
    let disk = this_machine(&["films", "private"]);
    let server = household();
    server.change(|household| {
        household.survey["libraries"][0]["folders"] = json!(["/data/movies", at(&disk, "private")]);
    });
    let state = importing_from(&server);

    import(&state, &Core, &films_at(&at(&disk, "films")));

    assert_eq!(
        sources(&state),
        vec![("Films".into(), "movies".into(), vec![at(&disk, "films")])]
    );
}

#[test]
fn an_answer_that_is_no_folder_of_this_machine_places_nothing_and_is_not_kept() {
    let disk = this_machine(&[]);
    let state = importing_from(&household());
    let nowhere = review(vec![answered(
        "1",
        &[
            ("/data/movies", &at(&disk, "gone")),
            ("/data/movies", "films"),
        ],
    )]);

    let ran = import(&state, &Core, &nowhere);

    assert!(sources(&state).is_empty());
    assert_eq!(kept_folders(&state), Translation::default());
    assert_eq!(ran.import.report.libraries, libraries(1, 0));
}

#[tokio::test]
async fn one_answer_places_every_folder_below_it_and_is_kept_for_the_paths_of_its_titles() {
    let disk = this_machine(&["movies", "shows"]);
    let state = importing_from(&household());
    let kept = review(vec![
        answered("1", &[("/data", &at(&disk, ""))]),
        answered("2", &[]),
    ]);

    import(&state, &Core, &kept);

    assert_eq!(
        sources(&state),
        vec![
            ("Films".into(), "movies".into(), vec![at(&disk, "movies")]),
            ("Shows".into(), "shows".into(), vec![at(&disk, "shows")]),
        ]
    );
    assert_eq!(
        kept_folders(&state).here("/data/movies/Heat/Heat.mkv"),
        Some(at(&disk, "movies/Heat/Heat.mkv"))
    );
}

#[test]
fn a_review_reads_a_folder_this_machine_has_under_the_same_name_and_asks_for_the_others() {
    let disk = this_machine(&["films"]);
    let state = importing_from(&household());
    let films = at(&disk, "films");
    let climbing = format!("{films}/../films");

    let here = asked_about(&state, &[&films, "/data/movies", &climbing]);

    assert_eq!(here, vec![Some(films), None, None]);
}

#[tokio::test]
async fn a_review_after_an_import_reads_the_folders_the_owner_answered_and_asks_nothing() {
    let disk = this_machine(&["films/kids"]);
    let state = importing_from(&household());
    import(&state, &Core, &films_at(&at(&disk, "films")));

    let here = asked_about(&state, &["/data/movies", "/data/movies/kids"]);

    assert_eq!(
        here,
        vec![Some(at(&disk, "films")), Some(at(&disk, "films/kids"))]
    );
}

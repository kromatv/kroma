use std::collections::HashMap;

use tokio::sync::broadcast::Receiver;

use super::super::stages::Core;
use super::this_machine::{
    answered, at, became, films_at, libraries, review, source_ids, sources, this_machine,
};
use super::*;
use crate::infra::events::Envelope;
use crate::model::imports::Status;
use crate::services::settings::{self, LibraryDef};

fn a_source(state: &SharedState, name: &str, folder: &str) -> String {
    let def = LibraryDef {
        id: format!("source-{name}"),
        name: name.into(),
        kind: "movies".into(),
        folders: vec![folder.into()],
        auto_scan: true,
    };
    settings::set_library_defs(&state.settings, &state.db, std::slice::from_ref(&def));
    def.id
}

fn scans_asked_for(events: &mut Receiver<Envelope>) -> usize {
    let mut asked = 0;
    while let Ok(envelope) = events.try_recv() {
        let event: Value = serde_json::from_str(envelope.payload_unrouted()).unwrap();
        if event["type"] == "job.started" && event["key"] == "library.scan" {
            asked += 1;
        }
    }
    asked
}

fn films_gain_a_second_folder(server: &OtherServer) {
    server.change(|household| {
        household.survey["libraries"][0]["folders"] = json!(["/data/movies", "/data/movies-4k"]);
    });
}

#[tokio::test]
async fn a_kept_library_becomes_a_source_over_its_folders_with_its_kind() {
    let disk = this_machine(&["films", "shows"]);
    let state = importing_from(&household());
    let kept = review(vec![
        answered("1", &[("/data/movies", &at(&disk, "films"))]),
        answered("2", &[("/data/shows", &at(&disk, "shows"))]),
    ]);

    let ran = import(&state, &Core, &kept);

    let ids = source_ids(&state);
    assert_eq!(
        sources(&state),
        vec![
            ("Films".into(), "movies".into(), vec![at(&disk, "films")]),
            ("Shows".into(), "shows".into(), vec![at(&disk, "shows")]),
        ]
    );
    assert_eq!(ran.import.report.libraries, libraries(2, 2));
    assert_eq!(
        became(&state),
        HashMap::from([("1".into(), ids[0].clone()), ("2".into(), ids[1].clone())])
    );
}

#[tokio::test]
async fn a_library_over_the_folders_of_a_source_this_server_has_uses_it_and_adds_none() {
    let disk = this_machine(&["films"]);
    let state = importing_from(&household());
    let movies = a_source(&state, "Movies", &at(&disk, "films"));
    let mut events = state.events.subscribe();

    let ran = import(&state, &Core, &films_at(&at(&disk, "films")));

    assert_eq!(source_ids(&state), vec![movies.clone()]);
    assert_eq!(became(&state), HashMap::from([("1".into(), movies)]));
    assert_eq!(ran.import.report.libraries, libraries(1, 1));
    assert_eq!(scans_asked_for(&mut events), 0);
}

#[tokio::test]
async fn a_library_below_a_folder_of_a_source_uses_that_source() {
    let disk = this_machine(&["video/films"]);
    let state = importing_from(&household());
    let media = a_source(&state, "Media", &at(&disk, "video"));

    import(&state, &Core, &films_at(&at(&disk, "video/films")));

    assert_eq!(source_ids(&state), vec![media.clone()]);
    assert_eq!(became(&state), HashMap::from([("1".into(), media)]));
}

#[tokio::test]
async fn a_library_partly_under_a_source_gives_that_source_its_other_folders() {
    let disk = this_machine(&["films", "films-4k"]);
    let server = household();
    films_gain_a_second_folder(&server);
    let state = importing_from(&server);
    let movies = a_source(&state, "Movies", &at(&disk, "films"));
    let both = review(vec![answered(
        "1",
        &[
            ("/data/movies", &at(&disk, "films")),
            ("/data/movies-4k", &at(&disk, "films-4k")),
        ],
    )]);

    import(&state, &Core, &both);

    assert_eq!(source_ids(&state), vec![movies]);
    assert_eq!(
        sources(&state)[0].2,
        vec![at(&disk, "films"), at(&disk, "films-4k")]
    );
}

#[tokio::test]
async fn a_second_import_asks_for_no_folder_again_and_adds_no_second_source() {
    let disk = this_machine(&["films"]);
    let state = importing_from(&household());
    import(&state, &Core, &films_at(&at(&disk, "films")));
    let first = (source_ids(&state), became(&state));

    let again = import(&state, &Core, &kept(&["1"], &[]));

    assert_eq!((source_ids(&state), became(&state)), first);
    assert_eq!(first.0.len(), 1);
    assert_eq!(again.import.report.libraries, libraries(1, 0));
}

#[tokio::test]
async fn a_library_offered_again_before_it_was_recorded_makes_no_second_source() {
    let disk = this_machine(&["films"]);
    let state = importing_from(&household());
    import(&state, &Core, &films_at(&at(&disk, "films")));
    let made = source_ids(&state);
    state
        .db
        .get()
        .unwrap()
        .execute("DELETE FROM import_records", [])
        .unwrap();

    import(&state, &Core, &films_at(&at(&disk, "films")));

    assert_eq!(source_ids(&state), made);
    assert_eq!(
        became(&state),
        HashMap::from([("1".into(), made[0].clone())])
    );
}

#[tokio::test]
async fn a_folder_a_library_gains_later_is_added_to_the_source_it_became() {
    let disk = this_machine(&["films", "films-4k"]);
    let server = household();
    let state = importing_from(&server);
    import(&state, &Core, &films_at(&at(&disk, "films")));
    let made = source_ids(&state);
    films_gain_a_second_folder(&server);
    let grown = review(vec![answered(
        "1",
        &[("/data/movies-4k", &at(&disk, "films-4k"))],
    )]);

    let again = import(&state, &Core, &grown);

    assert_eq!(source_ids(&state), made);
    assert_eq!(
        sources(&state)[0].2,
        vec![at(&disk, "films"), at(&disk, "films-4k")]
    );
    assert_eq!(again.import.report.libraries, libraries(1, 1));
}

#[tokio::test]
async fn a_scan_is_asked_for_once_after_an_import_added_sources() {
    let disk = this_machine(&["films", "shows"]);
    let state = importing_from(&household());
    let mut events = state.events.subscribe();
    let kept = review(vec![
        answered("1", &[("/data/movies", &at(&disk, "films"))]),
        answered("2", &[("/data/shows", &at(&disk, "shows"))]),
    ]);

    import(&state, &Core, &kept);

    assert_eq!(scans_asked_for(&mut events), 1);
}

#[tokio::test]
async fn an_import_makes_no_source_while_the_saved_library_list_cannot_be_read() {
    let disk = this_machine(&["films"]);
    let state = importing_from(&household());
    let unreadable = json!([{ "name": "Films" }]);
    let saved = std::collections::BTreeMap::from([("libraries".to_string(), unreadable.clone())]);
    state.settings.set_patch(&state.db, saved);

    let ran = import(&state, &Core, &films_at(&at(&disk, "films")));

    assert_eq!(ran.import.status, Status::Failed);
    assert_eq!(state.settings.get("libraries"), unreadable);
    assert!(became(&state).is_empty());
}

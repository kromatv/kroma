use serde_json::json;

use super::*;

use crate::store;
use crate::test_support::{get, Household, ACCOUNT, LOCAL, MACHINE};
use crate::wire::{LibraryKind, User};

fn ask(sign_in: &str) -> SurveyAsk {
    SurveyAsk {
        sign_in: sign_in.to_string(),
        server: MACHINE.to_string(),
    }
}

fn surveyed() -> (Household, String, Survey) {
    let (home, sign_in) = Household::signed_in();
    let survey = home.plex.survey(&ask(&sign_in)).unwrap();
    (home, sign_in, survey)
}

fn user<'a>(survey: &'a Survey, name: &str) -> &'a User {
    survey
        .users
        .iter()
        .find(|user| user.name == name)
        .unwrap_or_else(|| panic!("{name} is in the survey"))
}

fn owner(home: &Household, path: &str) -> crate::test_support::When {
    get(&format!("{LOCAL}{path}")).with("X-Plex-Token", &home.owner_token)
}

#[test]
fn the_survey_of_a_household_is_this_json() {
    let (_home, _sign_in, survey) = surveyed();

    let wire = serde_json::to_value(&survey).unwrap();

    assert_eq!(
        wire,
        json!({
            "libraries": [
                { "id": "1", "name": "Films", "kind": "movies", "folders": ["/data/movies", "/data/films-4k"] },
                { "id": "2", "name": "Séries", "kind": "shows", "folders": ["/data/shows"] },
                { "id": "3", "name": "Musique", "kind": "other", "folders": ["/data/music"] },
            ],
            "users": [
                { "id": "7001", "name": "Ana", "email": "ana@example.org", "signedIn": true,
                  "allLibraries": true, "libraries": [], "finerLimits": [], "stateLocked": false },
                { "id": "7002", "name": "Ben", "email": "ben@example.org", "signedIn": false,
                  "allLibraries": false, "libraries": ["1", "3"], "finerLimits": [], "stateLocked": false },
                { "id": "7003", "name": "Chloé", "signedIn": false,
                  "allLibraries": true, "libraries": [], "finerLimits": ["rating", "label"], "stateLocked": false },
                { "id": "7004", "name": "Dan", "email": "dan@example.org", "signedIn": false,
                  "allLibraries": true, "libraries": [], "finerLimits": [], "stateLocked": true, "stateNeeds": "pin" },
                { "id": "7005", "name": "Eve", "signedIn": false,
                  "allLibraries": true, "libraries": [], "finerLimits": [], "stateLocked": true },
            ],
            "counts": { "titles": 5, "plays": 4 },
            "leftBehind": ["playlists", "collections", "liveTv", "watchlist"],
        })
    );
}

#[test]
fn a_library_plex_holds_and_kroma_does_not_play_is_of_another_kind() {
    let (_home, _sign_in, survey) = surveyed();

    let kinds: Vec<LibraryKind> = survey
        .libraries
        .iter()
        .map(|library| library.kind)
        .collect();

    assert_eq!(
        kinds,
        [LibraryKind::Movies, LibraryKind::Shows, LibraryKind::Other]
    );
}

#[test]
fn a_home_user_protected_by_a_pin_is_reported_as_needing_it() {
    let (home, sign_in, survey) = surveyed();

    let dan = user(&survey, "Dan");

    assert!(dan.state_locked);
    assert_eq!(dan.state_needs, Some("pin"));
    assert_eq!(
        store::reader_token(&home.pool, home.key(&sign_in), "7004").unwrap(),
        None
    );
}

#[test]
fn a_home_user_plex_lists_no_token_for_has_a_locked_state_and_nothing_to_open_it() {
    let (home, sign_in, survey) = surveyed();

    let eve = user(&survey, "Eve");

    assert!(eve.state_locked);
    assert_eq!(eve.state_needs, None);
    assert_eq!(
        store::reader_token(&home.pool, home.key(&sign_in), "7005").unwrap(),
        None
    );
}

#[test]
fn the_owners_sign_in_alone_opens_the_watch_state_of_every_shared_user() {
    let (home, sign_in, survey) = surveyed();

    let ben = store::reader_token(&home.pool, home.key(&sign_in), "7002").unwrap();
    let chloe = store::reader_token(&home.pool, home.key(&sign_in), "7003").unwrap();

    assert_eq!(ben, Some(home.ben_token.clone()));
    assert_eq!(chloe, Some(home.chloe_token.clone()));
    assert!(!user(&survey, "Ben").state_locked);
    assert!(!user(&survey, "Chloé").state_locked);
}

#[test]
fn someone_the_server_is_not_shared_with_or_who_has_not_accepted_is_not_listed() {
    let (_home, _sign_in, survey) = surveyed();

    let names: Vec<&str> = survey.users.iter().map(|user| user.name.as_str()).collect();

    assert_eq!(names, ["Ana", "Ben", "Chloé", "Dan", "Eve"]);
}

#[test]
fn names_only_what_the_server_holds_among_what_stays_behind() {
    let (home, sign_in) = Household::signed_in();
    home.web.answers(
        owner(&home, "/playlists"),
        200,
        r#"<MediaContainer size="0"/>"#,
    );
    home.web
        .answers(owner(&home, "/livetv/dvrs"), 404, "Not Found");
    home.web.answers(
        owner(&home, "/library/sections/1/all").with("type", "18"),
        200,
        r#"<MediaContainer size="0" totalSize="0"/>"#,
    );

    let survey = home.plex.survey(&ask(&sign_in)).unwrap();

    assert_eq!(survey.left_behind, ["watchlist"]);
}

#[test]
fn a_count_the_server_does_not_give_is_left_out() {
    let (home, sign_in) = Household::signed_in();
    home.web.answers(
        owner(&home, "/status/sessions/history/all").with("X-Plex-Container-Size", "0"),
        500,
        "Internal Server Error",
    );
    home.web.answers(
        owner(&home, "/library/sections/2/all")
            .with("type", "4")
            .with("X-Plex-Container-Size", "0"),
        200,
        r#"<MediaContainer size="0"/>"#,
    );

    let survey = home.plex.survey(&ask(&sign_in)).unwrap();

    assert_eq!(survey.counts.plays, None);
    assert_eq!(survey.counts.titles, None);
}

#[test]
fn a_sign_in_plex_no_longer_accepts_fails_and_says_to_sign_in_again() {
    let (home, sign_in) = Household::signed_in();
    home.web.answers(
        get(&format!("{ACCOUNT}/api/users")).with("X-Plex-Token", &home.account_token),
        401,
        "<errors/>",
    );

    let error = home.plex.survey(&ask(&sign_in)).unwrap_err();

    assert_eq!(
        error.to_string(),
        "plex.tv refused the sign-in: sign in to Plex again"
    );
}

#[test]
fn a_server_that_does_not_answer_fails_the_survey_and_is_looked_for_again() {
    let (home, sign_in) = Household::signed_in();
    home.web.is_silent(owner(&home, "/library/sections"));

    let error = home.plex.survey(&ask(&sign_in)).unwrap_err();

    let kept = store::server(&home.pool, home.key(&sign_in))
        .unwrap()
        .unwrap();
    assert_eq!(error.to_string(), "the Plex server did not answer");
    assert_eq!(kept.route, None);
}

#[test]
fn a_sign_in_the_importer_does_not_hold_is_an_error_and_asks_nobody() {
    let home = Household::new();

    let surveyed = home.plex.survey(&ask("never-kept"));

    assert!(surveyed.is_err());
    assert!(home.web.seen().is_empty());
}

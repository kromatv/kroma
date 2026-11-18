use serde_json::json;

use super::*;

use crate::dialect::JELLYFIN;
use crate::test_support::{Recorded, World, ANA, FILMS, LEO, OLD, SAM, SERVER, SHOWS};

fn total(count: u64) -> serde_json::Value {
    json!({ "Items": [], "TotalRecordCount": count, "StartIndex": 0 })
}

fn surveyed(world: &World) -> Survey {
    let ask = SurveyAsk {
        sign_in: world.signed_in(),
        server: SERVER.to_string(),
    };
    world.importer.survey(&ask).unwrap()
}

fn named<'a>(survey: &'a Survey, id: &str) -> &'a User {
    survey.users.iter().find(|user| user.id == id).unwrap()
}

#[test]
fn each_library_comes_with_its_folders_and_its_kind() {
    let world = World::over(Recorded::jellyfin());

    let survey = surveyed(&world);

    let libraries: Vec<(&str, LibraryKind, usize)> = survey
        .libraries
        .iter()
        .map(|library| (library.name.as_str(), library.kind, library.folders.len()))
        .collect();
    assert_eq!(
        libraries,
        vec![
            ("Films", LibraryKind::Movies, 2),
            ("Shows", LibraryKind::Shows, 1),
            ("Everything", LibraryKind::Mixed, 1),
            ("Music", LibraryKind::Other, 1),
            ("Collections", LibraryKind::Other, 1),
        ]
    );
    assert_eq!(survey.libraries[0].id, FILMS);
    assert_eq!(
        survey.libraries[0].folders,
        vec!["/data/movies", "/data/movies-4k"]
    );
}

#[test]
fn a_library_the_server_gives_no_id_for_is_left_out() {
    let world = World::over(Recorded::jellyfin());

    let survey = surveyed(&world);

    assert!(survey
        .libraries
        .iter()
        .all(|library| library.name != "Unscanned"));
}

#[test]
fn the_user_who_signed_in_is_marked_and_sees_every_library() {
    let world = World::over(Recorded::jellyfin());

    let survey = surveyed(&world);

    assert_eq!(
        named(&survey, SAM),
        &User {
            id: SAM.to_string(),
            name: "sam".to_string(),
            signed_in: true,
            all_libraries: true,
            libraries: Vec::new(),
            finer_limits: Vec::new(),
        }
    );
}

#[test]
fn a_user_of_some_libraries_lists_them_and_is_not_marked() {
    let world = World::over(Recorded::jellyfin());

    let survey = surveyed(&world);

    let ana = named(&survey, ANA);
    assert_eq!((ana.signed_in, ana.all_libraries), (false, false));
    assert_eq!(ana.libraries, vec![FILMS]);
    assert!(ana.finer_limits.is_empty());
}

#[test]
fn a_user_limited_by_rating_tag_and_hours_names_each_limit() {
    let world = World::over(Recorded::jellyfin());

    let survey = surveyed(&world);

    assert_eq!(
        named(&survey, LEO).finer_limits,
        vec!["rating", "tag", "schedule"]
    );
}

#[test]
fn a_disabled_user_and_one_with_blocked_folders_are_named_as_limited() {
    let world = World::over(Recorded::jellyfin());

    let survey = surveyed(&world);

    assert_eq!(
        named(&survey, OLD).finer_limits,
        vec!["blockedFolders", "disabled"]
    );
}

#[test]
fn the_titles_are_the_films_and_the_episodes_the_server_counts() {
    let world = World::over(Recorded::jellyfin());

    let survey = surveyed(&world);

    assert_eq!(survey.counts.titles, Some(1204 + 3890));
}

#[test]
fn watch_state_and_plays_count_what_each_user_watched_or_started() {
    let jellyfin = Recorded::jellyfin()
        .on(
            JELLYFIN.items.path,
            &[("userId", ANA), ("filters", PLAYED)],
            total(40),
        )
        .on(
            JELLYFIN.items.path,
            &[("userId", ANA), ("filters", STARTED)],
            total(2),
        )
        .on(
            JELLYFIN.items.path,
            &[("userId", SAM), ("filters", PLAYED)],
            total(300),
        );
    let world = World::over(jellyfin);

    let survey = surveyed(&world);

    assert_eq!(survey.counts.states, Some(342));
    assert_eq!(survey.counts.plays, Some(342));
}

#[test]
fn a_count_asks_for_no_row() {
    let world = World::over(Recorded::jellyfin());

    surveyed(&world);

    let limits: Vec<Option<String>> = world.jellyfin.seen(|seen| {
        seen.iter()
            .filter(|call| call.path == JELLYFIN.items.path)
            .map(|call| call.param("limit").map(str::to_string))
            .collect()
    });
    assert_eq!(limits.len(), 9);
    assert!(limits.iter().all(|limit| limit.as_deref() == Some("0")));
}

#[test]
fn what_stays_behind_names_only_what_the_server_holds() {
    let playlists = [("includeItemTypes", "Playlist"), ("userId", SAM)];
    let world = World::over(Recorded::jellyfin().on(JELLYFIN.items.path, &playlists, total(3)));

    let survey = surveyed(&world);

    assert_eq!(survey.left_behind, vec!["playlists", "collections"]);
}

#[test]
fn a_server_with_a_television_guide_leaves_live_tv_behind() {
    let counts = json!({ "MovieCount": 1, "ProgramCount": 800 });
    let world = World::over(Recorded::jellyfin().on(JELLYFIN.counts.path, &[], counts));

    let survey = surveyed(&world);

    assert_eq!(survey.left_behind, vec!["liveTv"]);
}

#[test]
fn a_sign_in_the_server_took_back_fails_and_says_to_sign_in_again() {
    let world = World::over(Recorded::jellyfin());
    let ask = SurveyAsk {
        sign_in: world.signed_in(),
        server: SERVER.to_string(),
    };
    world.jellyfin.revoke();

    let failure = world.importer.survey(&ask).unwrap_err();

    assert_eq!(
        failure.to_string(),
        "Jellyfin refused the sign-in it gave. Sign in again."
    );
}

#[test]
fn a_sign_in_this_importer_does_not_keep_fails_before_any_call() {
    let world = World::over(Recorded::jellyfin());
    let ask = SurveyAsk {
        sign_in: "s-unknown".to_string(),
        server: SERVER.to_string(),
    };

    let failure = world.importer.survey(&ask).unwrap_err();

    assert!(failure.to_string().contains("Sign in again"));
    assert!(world.jellyfin.paths().is_empty());
}

#[test]
fn a_sign_in_does_not_open_a_server_it_was_not_made_for() {
    let world = World::over(Recorded::jellyfin());
    let ask = SurveyAsk {
        sign_in: world.signed_in(),
        server: SHOWS.to_string(),
    };

    let failure = world.importer.survey(&ask).unwrap_err();

    assert_eq!(
        failure.to_string(),
        "this sign-in does not reach that server"
    );
}

#[test]
fn every_call_after_the_sign_in_carries_the_token_in_the_one_header() {
    let world = World::over(Recorded::jellyfin());

    surveyed(&world);

    let token = format!(", Token=\"{}\"", world.jellyfin.token());
    let headers: Vec<String> = world.jellyfin.seen(|seen| {
        seen.iter()
            .skip(2)
            .map(|call| call.authorization.clone().unwrap_or_default())
            .collect()
    });
    assert_eq!(headers.len(), 12);
    assert!(headers
        .iter()
        .all(|header| header.starts_with("MediaBrowser ") && header.ends_with(&token)));
}

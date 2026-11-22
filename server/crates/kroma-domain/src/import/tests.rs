mod unlocking;

use serde_json::json;

use super::*;

fn read<T: serde::de::DeserializeOwned>(wire: serde_json::Value) -> T {
    serde_json::from_value(wire).expect("the contract's JSON reads")
}

#[test]
fn a_ready_sign_in_names_its_reference_and_the_servers_it_reaches() {
    let wire = json!({
        "status": "ready",
        "signIn": "s-1",
        "servers": [{ "id": "srv", "name": "Living room", "address": "http://nas:32400" }],
    });

    let answer: Connected = read(wire.clone());

    assert_eq!(
        answer,
        Connected::Ready {
            sign_in: "s-1".into(),
            servers: vec![Server {
                id: "srv".into(),
                name: "Living room".into(),
                address: Some("http://nas:32400".into()),
            }],
        }
    );
    assert_eq!(serde_json::to_value(&answer).unwrap(), wire);
}

#[test]
fn a_pending_sign_in_gives_the_page_to_open_and_the_id_to_ask_again_with() {
    let wire = json!({
        "status": "pending",
        "pending": "p-7",
        "url": "https://account.example/link?code=ABCD",
        "expiresAt": 1_700_000_900,
    });

    let answer: Connected = read(wire.clone());

    assert_eq!(
        answer,
        Connected::Pending {
            pending: "p-7".into(),
            url: "https://account.example/link?code=ABCD".into(),
            expires_at: Some(1_700_000_900),
        }
    );
    assert_eq!(serde_json::to_value(&answer).unwrap(), wire);
}

#[test]
fn a_refusal_for_a_reason_this_build_does_not_know_reads_as_other() {
    let known: Connected = read(json!({ "status": "refused", "reason": "notAdministrator" }));
    let newer: Connected = read(json!({ "status": "refused", "reason": "twoFactor" }));
    let bare: Connected = read(json!({ "status": "refused" }));

    assert_eq!(
        known,
        Connected::Refused {
            reason: RefusalReason::NotAdministrator,
            message: None,
        }
    );
    assert_eq!(
        newer,
        Connected::Refused {
            reason: RefusalReason::Other,
            message: None,
        }
    );
    assert_eq!(bare, newer);
}

#[test]
fn a_status_this_build_does_not_know_is_not_read_as_one_it_does() {
    let answer = serde_json::from_value::<Connected>(json!({ "status": "halfway" }));

    assert!(answer.is_err());
}

#[test]
fn a_survey_reads_libraries_users_counts_and_what_stays_behind() {
    let wire = json!({
        "libraries": [
            { "id": "1", "name": "Films", "kind": "movies", "folders": ["/data/movies"] },
        ],
        "users": [{
            "id": "42",
            "name": "Ana",
            "email": "ana@example.org",
            "signedIn": true,
            "allLibraries": false,
            "libraries": ["1"],
            "finerLimits": ["rating"],
            "stateLocked": true,
            "stateNeeds": "pin",
        }],
        "counts": { "titles": 1204, "states": 311, "plays": 5020 },
        "leftBehind": ["playlists", "collections"],
    });

    let survey: Survey = read(wire.clone());

    assert_eq!(survey.libraries[0].kind, LibraryKind::Movies);
    assert_eq!(survey.users[0].state_needs.as_deref(), Some("pin"));
    assert_eq!(survey.counts.plays, Some(5020));
    assert_eq!(serde_json::to_value(&survey).unwrap(), wire);
}

#[test]
fn a_user_named_by_an_id_alone_sees_no_library_and_has_a_readable_state() {
    let survey: Survey = read(json!({ "users": [{ "id": "42" }] }));

    assert_eq!(
        survey.users,
        vec![User {
            id: "42".into(),
            name: String::new(),
            email: None,
            signed_in: false,
            all_libraries: false,
            libraries: Vec::new(),
            finer_limits: Vec::new(),
            state_locked: false,
            state_needs: None,
        }]
    );
    assert_eq!(survey.counts, Counts::default());
}

#[test]
fn a_library_of_a_kind_this_build_does_not_know_reads_as_other() {
    let survey: Survey = read(json!({
        "libraries": [{ "id": "1", "kind": "music" }, { "id": "2" }, { "id": "3", "kind": "mixed" }],
    }));

    let kinds: Vec<LibraryKind> = survey.libraries.iter().map(|l| l.kind).collect();

    assert_eq!(
        kinds,
        vec![LibraryKind::Other, LibraryKind::Other, LibraryKind::Mixed]
    );
}

#[test]
fn a_page_of_titles_reads_a_film_and_an_episode_with_its_series() {
    let wire = json!({
        "titles": [
            {
                "id": "t1",
                "kind": "movie",
                "paths": ["/data/movies/Heat (1995)/Heat.mkv"],
                "title": "Heat",
                "year": 1995,
                "ids": { "tmdb": "949", "imdb": "tt0113277" },
            },
            {
                "id": "t2",
                "kind": "episode",
                "paths": ["/data/shows/The Wire/S01E03.mkv"],
                "title": "The Buys",
                "ids": { "tvdb": "127396" },
                "series": { "title": "The Wire", "year": 2002, "ids": { "tmdb": "1438" } },
                "season": 1,
                "episode": 3,
            },
        ],
        "next": "cursor-2",
    });

    let page: TitlePage = read(wire.clone());

    assert_eq!(page.titles[0].kind, TitleKind::Movie);
    assert_eq!(page.titles[0].ids.tmdb.as_deref(), Some("949"));
    assert_eq!(
        page.titles[1].series,
        Some(Series {
            title: Some("The Wire".into()),
            year: Some(2002),
            ids: ExternalIds {
                tmdb: Some("1438".into()),
                ..Default::default()
            },
        })
    );
    assert_eq!(page.next.as_deref(), Some("cursor-2"));
    assert_eq!(serde_json::to_value(&page).unwrap(), wire);
}

#[test]
fn a_title_of_a_kind_this_build_does_not_know_does_not_break_its_page() {
    let page: TitlePage = read(json!({
        "titles": [{ "id": "t9", "kind": "track", "album": "Kind of Blue" }],
    }));

    assert_eq!(page.titles[0].kind, TitleKind::Other);
    assert_eq!(page.next, None);
}

#[test]
fn a_whole_show_is_a_title_of_its_own_kind() {
    let wire = json!({
        "titles": [{ "id": "s1", "kind": "series", "title": "Dark", "year": 2017 }],
    });

    let page: TitlePage = read(wire.clone());

    assert_eq!(page.titles[0].kind, TitleKind::Series);
    assert_eq!(
        serde_json::to_value(&page).unwrap()["titles"][0]["kind"],
        "series"
    );
}

#[test]
fn a_page_of_watch_state_reads_every_field_in_its_unit() {
    let wire = json!({
        "states": [{
            "title": "t1",
            "watched": true,
            "playCount": 3,
            "positionMs": 1_234_000,
            "durationMs": 10_200_000,
            "lastPlayedAt": 1_700_000_000,
            "favourite": true,
        }],
    });

    let page: StatePage = read(wire.clone());

    assert_eq!(
        page.states,
        vec![WatchState {
            title: "t1".into(),
            watched: true,
            play_count: Some(3),
            position_ms: Some(1_234_000),
            duration_ms: Some(10_200_000),
            last_played_at: Some(1_700_000_000),
            favourite: true,
        }]
    );
    assert_eq!(serde_json::to_value(&page).unwrap(), wire);
}

#[test]
fn a_watch_state_named_by_its_title_alone_is_unwatched_and_unplaced() {
    let page: StatePage = read(json!({ "states": [{ "title": "t1" }] }));

    assert_eq!(
        page.states,
        vec![WatchState {
            title: "t1".into(),
            watched: false,
            play_count: None,
            position_ms: None,
            duration_ms: None,
            last_played_at: None,
            favourite: false,
        }]
    );
}

#[test]
fn a_page_of_plays_reads_a_play_with_and_without_its_duration() {
    let wire = json!({
        "plays": [
            { "id": "p1", "user": "42", "title": "t1", "playedAt": 1_700_000_000, "durationMs": 9_000_000 },
            { "id": "p2", "user": "42", "title": "t2", "playedAt": 1_700_086_400 },
        ],
        "next": "after-p2",
    });

    let page: PlayPage = read(wire.clone());

    assert_eq!(page.plays[0].duration_ms, Some(9_000_000));
    assert_eq!(page.plays[1].duration_ms, None);
    assert_eq!(serde_json::to_value(&page).unwrap(), wire);
}

#[test]
fn a_play_that_does_not_say_when_it_was_played_is_not_a_play() {
    let page = serde_json::from_value::<PlayPage>(json!({
        "plays": [{ "id": "p1", "user": "42", "title": "t1" }],
    }));

    assert!(page.is_err());
}

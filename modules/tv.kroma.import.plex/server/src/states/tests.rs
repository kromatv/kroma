use serde_json::json;

use super::*;

use crate::test_support::{get, Household, ACCOUNT, LOCAL, MACHINE, OWNER};

fn ask(sign_in: &str, user: &str, library: &str) -> StatesAsk {
    StatesAsk {
        sign_in: sign_in.to_string(),
        server: MACHINE.to_string(),
        user: user.to_string(),
        library: library.to_string(),
        cursor: None,
        changed_since: None,
        limit: Some(500),
    }
}

fn titles(page: &StatePage) -> Vec<&str> {
    page.states
        .iter()
        .map(|state| state.title.as_str())
        .collect()
}

#[test]
fn the_owners_watch_state_of_a_film_library_is_this_json() {
    let (home, sign_in) = Household::signed_in();

    let page = home.plex.states(&ask(&sign_in, OWNER, "1")).unwrap();

    assert_eq!(
        serde_json::to_value(&page).unwrap(),
        json!({
            "states": [
                { "title": "101", "watched": true, "playCount": 2,
                  "durationMs": 10_200_000, "lastPlayedAt": 1_700_000_000 },
                { "title": "102", "watched": false, "positionMs": 1_234_000,
                  "durationMs": 7_020_000, "lastPlayedAt": 1_700_086_400 },
            ],
        })
    );
}

#[test]
fn a_shared_users_watch_state_is_read_with_that_users_own_token() {
    let (home, sign_in) = Household::signed_in();
    home.plex
        .survey(&crate::wire::SurveyAsk {
            sign_in: sign_in.clone(),
            server: MACHINE.to_string(),
        })
        .unwrap();

    let page = home.plex.states(&ask(&sign_in, "7002", "1")).unwrap();

    let read = home.web.asked(&format!("{LOCAL}/library/sections/1/all"));
    assert_eq!(titles(&page), ["102", "103"]);
    assert!(page.states[0].watched);
    assert_eq!(page.states[1].position_ms, Some(600_000));
    assert_eq!(
        read.last().unwrap().value("X-Plex-Token"),
        Some(home.ben_token.as_str())
    );
}

#[test]
fn a_user_no_survey_has_read_yet_is_looked_up_at_plex_once() {
    let (home, sign_in) = Household::signed_in();

    let first = home.plex.states(&ask(&sign_in, "7002", "1")).unwrap();
    let second = home.plex.states(&ask(&sign_in, "7002", "1")).unwrap();

    let looked_up = home
        .web
        .asked(&format!("{ACCOUNT}/api/servers/{MACHINE}/shared_servers"));
    assert_eq!(titles(&first), ["102", "103"]);
    assert_eq!(second, first);
    assert_eq!(looked_up.len(), 1);
}

#[test]
fn the_watch_state_of_a_user_who_needs_a_pin_is_not_read() {
    let (home, sign_in) = Household::signed_in();

    let page = home.plex.states(&ask(&sign_in, "7004", "1"));

    let with_dans_token = home
        .web
        .seen()
        .into_iter()
        .filter(|call| call.value("X-Plex-Token") == Some(home.dan_token.as_str()))
        .count();
    assert!(page.is_err());
    assert_eq!(with_dans_token, 0);
}

#[test]
fn a_user_the_server_does_not_have_is_an_error() {
    let (home, sign_in) = Household::signed_in();

    let page = home.plex.states(&ask(&sign_in, "9999", "1"));

    assert!(page.is_err());
}

#[test]
fn a_user_of_a_server_the_sign_in_does_not_reach_is_an_error_and_asks_nobody() {
    let (home, sign_in) = Household::signed_in();
    let elsewhere = StatesAsk {
        server: "friend-machine".to_string(),
        ..ask(&sign_in, "7002", "1")
    };

    let page = home.plex.states(&elsewhere);

    assert!(page.is_err());
    assert!(home.web.seen().is_empty());
}

#[test]
fn only_what_changed_at_or_after_a_time_is_answered_when_one_is_given() {
    let (home, sign_in) = Household::signed_in();
    let since = StatesAsk {
        changed_since: Some(1_700_200_000),
        ..ask(&sign_in, "7002", "1")
    };

    let page = home.plex.states(&since).unwrap();

    assert_eq!(titles(&page), ["102"]);
}

#[test]
fn a_state_with_no_time_is_answered_whatever_the_time_asked_for() {
    let (home, sign_in) = Household::signed_in();
    home.web.answers(
        get(&format!("{LOCAL}/library/sections/1/all"))
            .with("X-Plex-Token", &home.owner_token)
            .with("type", "1"),
        200,
        r#"<MediaContainer size="1" totalSize="1"><Video ratingKey="101" type="movie" viewCount="1"/></MediaContainer>"#,
    );
    let since = StatesAsk {
        changed_since: Some(1_800_000_000),
        ..ask(&sign_in, OWNER, "1")
    };

    let page = home.plex.states(&since).unwrap();

    assert_eq!(titles(&page), ["101"]);
}

#[test]
fn the_watch_state_of_episodes_names_each_episode() {
    let (home, sign_in) = Household::signed_in();

    let page = home.plex.states(&ask(&sign_in, OWNER, "2")).unwrap();

    assert_eq!(titles(&page), ["211", "212"]);
    assert_eq!(page.states[0].play_count, Some(1));
    assert_eq!(page.states[1].position_ms, Some(600_000));
}

#[test]
fn a_page_with_no_state_in_it_still_leads_to_the_next_one() {
    let (home, sign_in) = Household::signed_in();
    home.web.answers(
        get(&format!("{LOCAL}/library/sections/1/all"))
            .with("X-Plex-Token", &home.owner_token)
            .with("type", "1"),
        200,
        r#"<MediaContainer size="2" totalSize="5"><Video ratingKey="103" type="movie"/><Video ratingKey="104" type="movie" viewOffset="0"/></MediaContainer>"#,
    );
    let small = StatesAsk {
        limit: Some(2),
        ..ask(&sign_in, OWNER, "1")
    };

    let page = home.plex.states(&small).unwrap();

    assert!(page.states.is_empty());
    assert_eq!(page.next.as_deref(), Some("2"));
}

#[test]
fn a_library_of_a_kind_kroma_does_not_play_has_no_state() {
    let (home, sign_in) = Household::signed_in();

    let page = home.plex.states(&ask(&sign_in, OWNER, "3")).unwrap();

    assert_eq!(page, StatePage::default());
}

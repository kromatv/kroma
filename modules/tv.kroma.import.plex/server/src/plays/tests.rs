use serde_json::json;

use super::*;

use crate::test_support::{get, Household, LOCAL, MACHINE};

const HISTORY: &str = "/status/sessions/history/all";

fn ask(sign_in: &str) -> PlaysAsk {
    PlaysAsk {
        sign_in: sign_in.to_string(),
        server: MACHINE.to_string(),
        cursor: None,
        changed_since: None,
        limit: Some(500),
    }
}

#[test]
fn a_page_of_plays_is_this_json() {
    let (home, sign_in) = Household::signed_in();

    let page = home.plex.plays(&ask(&sign_in)).unwrap();

    assert_eq!(
        serde_json::to_value(&page).unwrap(),
        json!({
            "plays": [
                { "id": "/status/sessions/history/9004", "user": "7002", "title": "212",
                  "playedAt": 1_700_300_000 },
                { "id": "/status/sessions/history/9001", "user": "7001", "title": "101",
                  "playedAt": 1_700_000_000 },
            ],
        })
    );
}

#[test]
fn the_plays_are_asked_for_newest_first() {
    let (home, sign_in) = Household::signed_in();

    home.plex.plays(&ask(&sign_in)).unwrap();

    let asked = &home.web.asked(&format!("{LOCAL}{HISTORY}"))[0];
    assert_eq!(asked.value("sort"), Some("viewedAt:desc"));
    assert_eq!(asked.value("viewedAt>"), None);
}

#[test]
fn only_the_plays_at_or_after_a_time_are_asked_for_when_one_is_given() {
    let (home, sign_in) = Household::signed_in();
    let since = PlaysAsk {
        changed_since: Some(1_700_100_000),
        ..ask(&sign_in)
    };

    home.plex.plays(&since).unwrap();

    let asked = &home.web.asked(&format!("{LOCAL}{HISTORY}"))[0];
    assert_eq!(asked.value("viewedAt>"), Some("1700100000"));
}

#[test]
fn a_page_of_plays_leads_to_the_next_one_by_what_the_server_sent() {
    let (home, sign_in) = Household::signed_in();
    home.web.answers(
        get(&format!("{LOCAL}{HISTORY}"))
            .with("X-Plex-Token", &home.owner_token)
            .with("X-Plex-Container-Start", "4")
            .with("X-Plex-Container-Size", "2"),
        200,
        r#"<MediaContainer size="2" totalSize="9">
             <Track historyKey="/status/sessions/history/8002" ratingKey="900" type="track" viewedAt="1699000200" accountID="1"/>
             <Video historyKey="/status/sessions/history/8001" ratingKey="103" type="movie" viewedAt="1699000100" accountID="7003"/>
           </MediaContainer>"#,
    );
    let later = PlaysAsk {
        cursor: Some("4".to_string()),
        limit: Some(2),
        ..ask(&sign_in)
    };

    let page = home.plex.plays(&later).unwrap();

    assert_eq!(page.plays.len(), 1);
    assert_eq!(page.plays[0].user, "7003");
    assert_eq!(page.next.as_deref(), Some("6"));
}

#[test]
fn a_play_that_does_not_say_who_or_when_is_left_out() {
    let (home, sign_in) = Household::signed_in();
    home.web.answers(
        get(&format!("{LOCAL}{HISTORY}")).with("X-Plex-Token", &home.owner_token),
        200,
        r#"<MediaContainer size="3" totalSize="3">
             <Video historyKey="/status/sessions/history/1" ratingKey="101" type="movie" accountID="1"/>
             <Video historyKey="/status/sessions/history/2" ratingKey="101" type="movie" viewedAt="1700000000"/>
             <Video ratingKey="101" type="movie" viewedAt="1700000000" accountID="1"/>
           </MediaContainer>"#,
    );

    let page = home.plex.plays(&ask(&sign_in)).unwrap();

    assert_eq!(page, PlayPage::default());
}

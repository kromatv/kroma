use serde_json::json;

use super::*;
use crate::model::{Audience, NotificationEvent, RequestKind};
use crate::services::requests::test_fixtures::{episodes, movie_detail, param, show_detail};
use crate::services::requests::test_support::{
    insert_req, insert_req_by, seed_movie_item, status_of_req, test_host,
};
use crate::test_support::FakeTmdb;

#[test]
fn deny_request_marks_denied_and_publishes() {
    let host = test_host();
    insert_req(
        &host,
        "r1",
        RequestKind::Movie,
        603,
        RequestStatus::Approved,
    );
    let denied = deny_request(&host, "r1", "mod", Some("nope")).unwrap();
    assert_eq!(denied.status, RequestStatus::Denied);
    assert_eq!(status_of_req(&host, "r1"), RequestStatus::Denied);
    assert!(host.published().len() >= 1);
}

#[test]
fn deny_request_unknown_request_errors() {
    let host = test_host();
    assert!(deny_request(&host, "ghost", "mod", None).is_err());
}

#[test]
fn approve_request_on_denied_bails_without_network() {
    let host = test_host();
    insert_req(&host, "r1", RequestKind::Movie, 603, RequestStatus::Denied);
    let err = approve_request(&host, "r1", Some("mod")).unwrap_err();
    assert!(
        err.to_string().contains("denied"),
        "unexpected error: {err}"
    );
    assert_eq!(status_of_req(&host, "r1"), RequestStatus::Denied);
}

#[test]
fn approve_request_unknown_request_errors() {
    let host = test_host();
    assert!(approve_request(&host, "ghost", None).is_err());
}

#[test]
fn denying_a_request_tells_its_author_where_to_look() {
    let host = test_host();
    insert_req_by(
        &host,
        "r-deny",
        RequestKind::Movie,
        42,
        RequestStatus::Pending,
        Some("u1"),
    );
    seed_movie_item(&host, "item-42", 42);

    let before = host.published().len();
    let denied = deny_request(&host, "r-deny", "mod-1", Some("duplicate")).unwrap();
    assert_eq!(denied.status, RequestStatus::Denied);
    assert_eq!(denied.note.as_deref(), Some("duplicate"));
    assert_eq!(host.published().len(), before + 1);

    let sent = host.notifications();
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].0, Audience::user("u1"));
    assert_eq!(sent[0].1.event, NotificationEvent::RequestDenied);
    assert_eq!(
        param(&sent[0].1.params, "note").as_deref(),
        Some("duplicate")
    );
    assert_eq!(sent[0].1.link.as_deref(), Some("/movies/item-42"));
}

#[test]
fn denying_a_request_that_is_not_there_fails_instead_of_inventing_one() {
    let host = test_host();
    let err = deny_request(&host, "nope", "mod-1", None)
        .unwrap_err()
        .to_string();
    assert!(err.contains("not found"), "{err}");
    assert!(host.notifications().is_empty());
}

#[test]
fn approving_a_denied_request_is_refused_rather_than_silently_reopened() {
    let host = test_host();
    insert_req(&host, "r-x", RequestKind::Movie, 42, RequestStatus::Denied);
    let err = approve_request(&host, "r-x", Some("mod-1"))
        .unwrap_err()
        .to_string();
    assert!(err.contains("denied"), "{err}");

    let err = approve_request(&host, "ghost", Some("mod-1"))
        .unwrap_err()
        .to_string();
    assert!(err.contains("not found"), "{err}");
}

#[test]
fn approving_a_show_builds_one_wanted_row_per_episode_of_every_season() {
    let host = test_host();
    let _tmdb = FakeTmdb::start(|path| match path {
        "/tv/1396" => (200, show_detail("Breaking Bad", &[1, 2])),
        "/tv/1396/season/1" => (200, episodes(&[1, 2, 3], "2008-01-20")),
        "/tv/1396/season/2" => (200, episodes(&[1, 2], "2009-03-08")),
        _ => (404, json!({})),
    });
    insert_req(
        &host,
        "r-show",
        RequestKind::Show,
        1396,
        RequestStatus::Pending,
    );

    approve_request(&host, "r-show", Some("mod-1")).unwrap();

    let conn = host.db().get().unwrap();
    let wanted = db::wanted_for_request(&conn, "r-show").unwrap();
    assert_eq!(wanted.len(), 5, "3 + 2 episodes");
    assert!(wanted.iter().all(|w| w.kind == "episode"));
    let pairs: Vec<(u32, u32)> = wanted
        .iter()
        .filter_map(|w| Some((w.season?, w.episode?)))
        .collect();
    assert!(
        pairs.contains(&(1, 3)) && pairs.contains(&(2, 2)),
        "{pairs:?}"
    );
}

#[test]
fn a_season_subset_only_materialises_the_seasons_that_were_asked_for() {
    let host = test_host();
    let tmdb = FakeTmdb::start(|path| match path {
        "/tv/1396" => (200, show_detail("Breaking Bad", &[1, 2])),
        "/tv/1396/season/2" => (200, episodes(&[1, 2], "2009-03-08")),
        _ => (404, json!({})),
    });
    db::insert_request(
        host.db(),
        &db::NewRequest {
            id: "r-s2".into(),
            kind: RequestKind::Show,
            tmdb_id: 1396,
            title: "Breaking Bad".into(),
            year: Some(2008),
            poster_url: None,
            seasons: Some(vec![2]),
            episodes: None,
            status: RequestStatus::Pending,
            requested_by: None,
        },
        now_ms(),
    )
    .unwrap();

    approve_request(&host, "r-s2", Some("mod-1")).unwrap();

    let conn = host.db().get().unwrap();
    let wanted = db::wanted_for_request(&conn, "r-s2").unwrap();
    assert_eq!(wanted.len(), 2);
    assert!(wanted.iter().all(|w| w.season == Some(2)));
    drop(conn);

    assert!(
        !tmdb.requests().iter().any(|r| r.contains("/season/1")),
        "season 1 was fetched for a season-2 request: {:?}",
        tmdb.requests()
    );
}

#[test]
fn a_show_tmdb_lists_no_episodes_for_is_refused_rather_than_approved_empty() {
    let host = test_host();
    let _tmdb = FakeTmdb::start(|path| match path {
        "/tv/1396" => (200, show_detail("Breaking Bad", &[1])),
        _ => (200, json!({ "episodes": [] })),
    });
    insert_req(
        &host,
        "r-empty",
        RequestKind::Show,
        1396,
        RequestStatus::Pending,
    );

    let err = approve_request(&host, "r-empty", Some("mod-1"))
        .unwrap_err()
        .to_string();
    assert!(err.contains("no episodes"), "{err}");
}

#[test]
fn approving_tells_the_requester_and_kicks_the_search() {
    let host = test_host();
    let _tmdb = FakeTmdb::start(|_| (200, movie_detail("The Matrix", "1999-03-31")));
    insert_req_by(
        &host,
        "r-1",
        RequestKind::Movie,
        603,
        RequestStatus::Pending,
        Some("u1"),
    );

    let approved = approve_request(&host, "r-1", Some("mod-1")).unwrap();
    assert_eq!(approved.status, RequestStatus::Approved);
    assert_eq!(approved.reviewed_by.as_deref(), Some("mod-1"));

    let sent = host.notifications();
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].0, Audience::user("u1"));
    assert_eq!(sent[0].1.event, NotificationEvent::RequestApproved);
}

use serde_json::json;

use super::*;
use crate::model::Audience;
use crate::services::requests::test_fixtures::{
    body, breaking_bad, ep, movie_detail, show_body, user,
};
use crate::services::requests::test_support::{
    host_without_tmdb, seed_user, test_host, wanted_pairs,
};
use crate::test_support::FakeTmdb;

#[test]
fn merge_show_request_widens_pending_seasons_without_materializing() {
    let host = test_host();
    db::insert_request(
        host.db(),
        &db::NewRequest {
            id: "r1".into(),
            kind: RequestKind::Show,
            tmdb_id: 100,
            title: "T".into(),
            year: None,
            poster_url: None,
            seasons: Some(vec![1]),
            episodes: None,
            status: RequestStatus::Pending,
            requested_by: None,
        },
        now_ms(),
    )
    .unwrap();
    let conn = host.db().get().unwrap();
    let existing = db::get_request(&conn, "r1").unwrap().unwrap();
    drop(conn);

    merge_show_request(&host, &existing, Some(vec![2]), None).unwrap();

    let conn = host.db().get().unwrap();
    let updated = db::get_request(&conn, "r1").unwrap().unwrap();
    assert_eq!(updated.seasons, Some(vec![1, 2]));
    assert!(host.published().len() >= 1, "a widened request publishes an update");
}

#[test]
fn merge_show_request_no_change_does_not_publish() {
    let host = test_host();
    db::insert_request(
        host.db(),
        &db::NewRequest {
            id: "r1".into(),
            kind: RequestKind::Show,
            tmdb_id: 100,
            title: "T".into(),
            year: None,
            poster_url: None,
            seasons: Some(vec![1, 2]),
            episodes: None,
            status: RequestStatus::Pending,
            requested_by: None,
        },
        now_ms(),
    )
    .unwrap();
    let conn = host.db().get().unwrap();
    let existing = db::get_request(&conn, "r1").unwrap().unwrap();
    drop(conn);

    merge_show_request(&host, &existing, Some(vec![1]), None).unwrap();
    assert_eq!(host.published().len(), 0);
}

#[test]
fn creating_a_request_without_tmdb_configured_says_so() {
    let host = host_without_tmdb();
    let err = create_request(
        &host,
        &user("u1", vec![Permission::Playback]),
        &CreateRequestBody {
            kind: RequestKind::Movie,
            tmdb_id: 42,
            seasons: None,
            episodes: None,
        },
    )
    .unwrap_err()
    .to_string();
    assert!(err.contains("TMDB is not configured"), "{err}");
}

#[test]
fn creating_a_movie_request_takes_its_title_from_tmdb() {
    let host = test_host();
    let _tmdb = FakeTmdb::start(|path| match path {
        "/movie/603" => (200, movie_detail("The Matrix", "1999-03-31")),
        _ => (404, json!({ "status_message": "Not Found" })),
    });
    seed_user(&host, "u1");

    let req = create_request(&host, &user("u1", vec![Permission::Playback]), &body("u1")).unwrap();
    assert_eq!(req.title, "The Matrix");
    assert_eq!(req.year, Some(1999));
    assert_eq!(req.status, RequestStatus::Pending);
    assert_eq!(req.requested_by.as_deref(), Some("u1"));
    let sent = host.notifications();
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].0, Audience::permission(Permission::RequestsManage));
}

#[test]
fn a_tmdb_id_that_does_not_resolve_is_refused_two_different_ways() {
    seed_user_and_fail(
        // curl -f turns a 404 into a transport failure, indistinguishable from
        // a dead network at this layer.
        |_| (404, json!({ "status_message": "Not Found" })),
        "TMDB lookup failed",
    );
    seed_user_and_fail(
        |_| (200, json!({ "overview": "no title field" })),
        "title not found",
    );
}

#[test]
fn asking_twice_folds_into_the_open_request_rather_than_duplicating() {
    let host = test_host();
    let _tmdb = FakeTmdb::start(|_| (200, movie_detail("The Matrix", "1999-03-31")));
    seed_user(&host, "u1");
    seed_user(&host, "u2");

    let first = create_request(&host, &user("u1", vec![Permission::Playback]), &body("u1")).unwrap();
    let second = create_request(&host, &user("u2", vec![Permission::Playback]), &body("u2")).unwrap();
    assert_eq!(first.id, second.id);
    assert_eq!(second.requested_by.as_deref(), Some("u1"));
}

#[test]
fn a_requester_who_may_self_approve_skips_the_queue() {
    let host = test_host();
    let _tmdb = FakeTmdb::start(|_| (200, movie_detail("The Matrix", "1999-03-31")));
    seed_user(&host, "owner");

    let req = create_request(
        &host,
        &user("owner", vec![Permission::Playback, Permission::RequestsAuto]),
        &body("owner"),
    )
    .unwrap();
    assert_eq!(req.status, RequestStatus::Approved);

    let conn = host.db().get().unwrap();
    let wanted = db::wanted_for_request(&conn, &req.id).unwrap();
    assert_eq!(wanted.len(), 1);
    assert_eq!(wanted[0].kind, "movie");
    assert_eq!(wanted[0].imdb_id.as_deref(), Some("tt0000001"));
    drop(conn);

    assert!(
        host.notifications().iter().all(|(a, _)| a != &Audience::permission(Permission::RequestsManage)),
        "a self-approved request should not page the moderators"
    );
}

#[test]
fn a_season_list_is_sorted_and_deduped_before_it_is_stored() {
    let host = test_host();
    let _tmdb = breaking_bad();
    seed_user(&host, "owner");

    let req = create_request(
        &host,
        &user("owner", vec![Permission::Playback]),
        &show_body(Some(vec![2, 1, 2]), None),
    )
    .unwrap();
    assert_eq!(req.seasons, Some(vec![1, 2]));
}

#[test]
fn asking_for_another_season_widens_the_request_already_open_and_its_ledger() {
    let host = test_host();
    let _tmdb = breaking_bad();
    seed_user(&host, "owner");
    seed_user(&host, "u2");

    let first = create_request(
        &host,
        &user("owner", vec![Permission::Playback, Permission::RequestsAuto]),
        &show_body(Some(vec![1]), None),
    )
    .unwrap();
    assert_eq!(first.status, RequestStatus::Approved);
    assert_eq!(wanted_pairs(&host, &first.id), [(1, 1), (1, 2), (1, 3)]);

    let widened = create_request(
        &host,
        &user("u2", vec![Permission::Playback]),
        &show_body(Some(vec![2]), Some(vec![ep(1, 1)])),
    )
    .unwrap();

    assert_eq!(widened.id, first.id, "one open request, not two");
    assert_eq!(widened.seasons, Some(vec![1, 2]));
    assert_eq!(widened.episodes, Some(vec![ep(1, 1)]));
    assert_eq!(
        wanted_pairs(&host, &first.id),
        [(1, 1), (1, 2), (1, 3), (2, 1), (2, 2)],
        "an approved request rebuilds its ledger on the spot"
    );
}

#[test]
fn a_request_for_single_episodes_materialises_only_those() {
    let host = test_host();
    let _tmdb = breaking_bad();
    seed_user(&host, "owner");

    let req = create_request(
        &host,
        &user("owner", vec![Permission::Playback, Permission::RequestsAuto]),
        &show_body(None, Some(vec![ep(1, 2)])),
    )
    .unwrap();

    assert!(req.seasons.is_none(), "no season was asked for, and none is implied");
    assert_eq!(wanted_pairs(&host, &req.id), [(1, 2)]);
}

#[test]
fn the_api_key_and_language_reach_tmdb_on_every_call() {
    let host = test_host();
    let tmdb = FakeTmdb::start(|_| (200, movie_detail("The Matrix", "1999-03-31")));
    seed_user(&host, "u1");

    create_request(&host, &user("u1", vec![Permission::Playback]), &body("u1")).unwrap();
    let asked = tmdb.requests();
    assert!(!asked.is_empty());
    assert!(asked[0].contains("api_key=test-key"), "{}", asked[0]);
    assert!(asked[0].contains("language=en-US"), "{}", asked[0]);
}

fn seed_user_and_fail(
    route: impl Fn(&str) -> (u16, serde_json::Value) + Send + 'static,
    expected: &str,
) {
    let host = test_host();
    let _tmdb = FakeTmdb::start(route);
    seed_user(&host, "u1");
    let err = create_request(&host, &user("u1", vec![Permission::Playback]), &body("u1"))
        .unwrap_err()
        .to_string();
    assert!(err.contains(expected), "wanted {expected:?}, got {err:?}");
}

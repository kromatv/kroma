use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{
    demo_item_id, demo_library_ids, demo_show_id, get, grant_libraries, seed_session, send,
    test_app, TestApp,
};
use crate::model::Permission;

const NOT_IN_LIBRARY: &str = "tmdb:1300968";

fn member(t: &TestApp, email: &str) -> (String, String) {
    seed_session(&t.state, email, "member", &[Permission::Playback])
}

async fn put(t: &TestApp, token: &str, uri: &str) -> StatusCode {
    send(&t.app, "PUT", uri, Some(token), None).await.0
}

#[tokio::test]
async fn a_member_saves_a_title_that_is_not_in_the_library_yet() {
    let t = test_app();
    let (_id, token) = member(&t, "member@test.dev");

    let listed = put(&t, &token, &format!("/api/my-list/{NOT_IN_LIBRARY}")).await;
    let watched = put(&t, &token, &format!("/api/watched/{NOT_IN_LIBRARY}")).await;

    assert_eq!(listed, StatusCode::NO_CONTENT);
    assert_eq!(watched, StatusCode::NO_CONTENT);
    let (_, list) = get(&t.app, "/api/my-list", Some(&token)).await;
    let (_, seen) = get(&t.app, "/api/watched", Some(&token)).await;
    assert_eq!(list, json!([NOT_IN_LIBRARY]));
    assert_eq!(seen, json!([NOT_IN_LIBRARY]));
}

#[tokio::test]
async fn a_member_saves_a_whole_show() {
    let t = test_app();
    let (_id, token) = member(&t, "member@test.dev");
    let show = demo_show_id("Planet Earth II");

    let listed = put(&t, &token, &format!("/api/my-list/{show}")).await;
    let watched = put(&t, &token, &format!("/api/watched/{show}")).await;

    assert_eq!(listed, StatusCode::NO_CONTENT);
    assert_eq!(watched, StatusCode::NO_CONTENT);
    let (_, list) = get(&t.app, "/api/my-list", Some(&token)).await;
    let (_, seen) = get(&t.app, "/api/watched", Some(&token)).await;
    assert_eq!(list, json!([show]));
    assert_eq!(seen, json!([show]));
}

#[tokio::test]
async fn a_restricted_member_saves_a_tmdb_title_but_not_a_show_outside_the_grant() {
    let t = test_app();
    let (viewer_id, token) = member(&t, "viewer@test.dev");
    let (movies_lib, _shows_lib) = demo_library_ids();
    grant_libraries(&t.state, &viewer_id, &[movies_lib]);
    let hidden_show = demo_show_id("Planet Earth II");

    let tmdb = put(&t, &token, &format!("/api/my-list/{NOT_IN_LIBRARY}")).await;
    let show = put(&t, &token, &format!("/api/my-list/{hidden_show}")).await;
    let watched_show = put(&t, &token, &format!("/api/watched/{hidden_show}")).await;

    assert_eq!(tmdb, StatusCode::NO_CONTENT);
    assert_eq!(show, StatusCode::NOT_FOUND);
    assert_eq!(watched_show, StatusCode::NOT_FOUND);
    let (_, list) = get(&t.app, "/api/my-list", Some(&token)).await;
    assert_eq!(list, json!([NOT_IN_LIBRARY]));
}

#[tokio::test]
async fn a_show_saved_before_the_grant_narrowed_drops_out_of_the_list() {
    let t = test_app();
    let (viewer_id, token) = member(&t, "viewer@test.dev");
    let (movies_lib, _shows_lib) = demo_library_ids();
    let show = demo_show_id("Planet Earth II");
    let movie = demo_item_id("Blade Runner 2049");
    put(&t, &token, &format!("/api/my-list/{show}")).await;
    put(&t, &token, &format!("/api/my-list/{movie}")).await;
    let (_, before) = get(&t.app, "/api/my-list", Some(&token)).await;

    grant_libraries(&t.state, &viewer_id, &[movies_lib]);
    let (_, after) = get(&t.app, "/api/my-list", Some(&token)).await;

    assert_eq!(before.as_array().map(Vec::len), Some(2));
    assert_eq!(after, json!([movie]));
}

#[tokio::test]
async fn an_id_that_names_nothing_is_still_refused() {
    let t = test_app();
    let (_id, token) = member(&t, "member@test.dev");

    for id in ["ghost", "tmdb:", "tmdb:abc", "tmdb:-4"] {
        let status = put(&t, &token, &format!("/api/my-list/{id}")).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{id}");
    }
}

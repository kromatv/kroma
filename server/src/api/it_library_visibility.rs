use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{
    demo_item_id, demo_library_ids, demo_show_id, get, grant_libraries, raw, seed_session, send,
    test_app,
};
use crate::model::Permission;

struct Household {
    app: crate::api::test_support::TestApp,
    viewer: String,
    movie: String,
    episode: String,
    show: String,
}

fn household_where_the_viewer_only_sees_films() -> Household {
    let app = test_app();
    let (viewer_id, viewer) = seed_session(
        &app.state,
        "viewer@test.dev",
        "viewer",
        &[Permission::Playback],
    );
    let (movies_lib, _shows_lib) = demo_library_ids();
    grant_libraries(&app.state, &viewer_id, &[movies_lib]);

    Household {
        app,
        viewer,
        movie: demo_item_id("Blade Runner 2049"),
        episode: demo_item_id("Islands"),
        show: demo_show_id("Planet Earth II"),
    }
}

#[tokio::test]
async fn an_account_with_no_grant_on_record_still_sees_the_whole_catalogue() {
    let t = test_app();
    let (_id, plain) = seed_session(&t.state, "plain@test.dev", "plain", &[Permission::Playback]);

    let (status, libs) = get(&t.app, "/api/libraries", Some(&plain)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(libs.as_array().map(Vec::len), Some(2));

    let (status, shows) = get(&t.app, "/api/shows", Some(&plain)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(shows.as_array().map(Vec::len), Some(2));

    let (status, _) = get(
        &t.app,
        &format!("/api/items/{}", demo_item_id("Islands")),
        Some(&plain),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn a_granted_account_browses_only_the_libraries_it_was_given() {
    let h = household_where_the_viewer_only_sees_films();

    let (status, libs) = get(&h.app.app, "/api/libraries", Some(&h.viewer)).await;
    assert_eq!(status, StatusCode::OK);
    let libs = libs.as_array().expect("libraries array");
    assert_eq!(libs.len(), 1);
    assert_eq!(libs[0]["kind"], json!("movies"));

    let (status, shows) = get(&h.app.app, "/api/shows", Some(&h.viewer)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(shows.as_array().map(Vec::len), Some(0));

    let (status, movies) = get(&h.app.app, "/api/movies", Some(&h.viewer)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(movies.as_array().map(Vec::len), Some(6));

    let (status, items) = get(&h.app.app, "/api/items", Some(&h.viewer)).await;
    assert_eq!(status, StatusCode::OK);
    let items = items.as_array().expect("items array");
    assert!(items.iter().all(|i| i["showId"].is_null()), "{items:?}");
}

#[tokio::test]
async fn naming_an_ungranted_library_outright_lists_nothing_rather_than_everything() {
    let h = household_where_the_viewer_only_sees_films();
    let (_movies_lib, shows_lib) = demo_library_ids();

    let (status, items) = get(
        &h.app.app,
        &format!("/api/items?library={shows_lib}"),
        Some(&h.viewer),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(items.as_array().map(Vec::len), Some(0));
}

#[tokio::test]
async fn a_title_outside_the_grant_is_not_reachable_by_its_id() {
    let h = household_where_the_viewer_only_sees_films();

    for uri in [
        format!("/api/items/{}", h.episode),
        format!("/api/shows/{}", h.show),
        format!("/api/items/{}/metadata", h.episode),
        format!("/api/shows/{}/metadata", h.show),
        format!("/api/items/{}/download", h.episode),
        format!("/api/items/{}/similar", h.episode),
    ] {
        let (status, _) = get(&h.app.app, &uri, Some(&h.viewer)).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{uri} should refuse");
    }

    let (status, _) = get(
        &h.app.app,
        &format!("/api/items/{}", h.movie),
        Some(&h.viewer),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn the_byte_routes_refuse_a_session_without_the_grant() {
    let h = household_where_the_viewer_only_sees_films();

    for uri in [
        format!("/api/items/{}/stream", h.episode),
        format!("/api/items/{}/hls/copy/0/0/index.m3u8", h.episode),
        format!("/api/items/{}/hls/copy/0/0/init.mp4", h.episode),
        format!("/api/items/{}/storyboard", h.episode),
        format!("/api/items/{}/storyboard.img", h.episode),
        format!("/api/items/{}/subtitles/0", h.episode),
    ] {
        let (status, _headers, _) = raw(&h.app.app, "GET", &uri, Some(&h.viewer), None, &[]).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{uri} should refuse");
    }
}

#[tokio::test]
async fn the_playback_endpoints_refuse_a_title_outside_the_grant() {
    let h = household_where_the_viewer_only_sees_films();
    let viewer = Some(h.viewer.as_str());

    let refusals: Vec<(&str, String, Option<serde_json::Value>)> = vec![
        ("GET", format!("/api/progress/{}", h.episode), None),
        (
            "PUT",
            format!("/api/progress/{}", h.episode),
            Some(json!({ "positionMs": 1000, "durationMs": 9000 })),
        ),
        ("DELETE", format!("/api/progress/{}", h.episode), None),
        ("PUT", format!("/api/watched/{}", h.episode), None),
        ("DELETE", format!("/api/watched/{}", h.episode), None),
        ("PUT", format!("/api/my-list/{}", h.episode), None),
        ("DELETE", format!("/api/my-list/{}", h.episode), None),
        ("GET", format!("/api/items/{}/next", h.episode), None),
        ("GET", format!("/api/items/{}/following", h.episode), None),
        ("GET", format!("/api/shows/{}/up-next", h.show), None),
        (
            "POST",
            "/api/playback/ping".to_string(),
            Some(json!({
                "sessionId": "s1",
                "itemId": h.episode,
                "positionMs": 0,
            })),
        ),
    ];

    for (method, uri, body) in refusals {
        let (status, _) = send(&h.app.app, method, &uri, viewer, body).await;
        assert_eq!(
            status,
            StatusCode::NOT_FOUND,
            "{method} {uri} should refuse"
        );
    }
}

#[tokio::test]
async fn search_does_not_find_a_title_outside_the_grant() {
    let h = household_where_the_viewer_only_sees_films();

    let (status, hidden) = get(&h.app.app, "/api/search?q=Planet", Some(&h.viewer)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(hidden["results"].as_array().map(Vec::len), Some(0));

    let (status, found) = get(&h.app.app, "/api/search?q=Blade", Some(&h.viewer)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        found["results"].as_array().is_some_and(|r| !r.is_empty()),
        "{found}"
    );
}

#[tokio::test]
async fn no_home_row_carries_a_title_outside_the_grant() {
    let h = household_where_the_viewer_only_sees_films();
    let (_movies_lib, shows_lib) = demo_library_ids();

    let (status, sections) = get(&h.app.app, "/api/home", Some(&h.viewer)).await;

    assert_eq!(status, StatusCode::OK);
    let sections = sections.as_array().expect("sections array");
    for section in sections {
        let items = section["items"].as_array().expect("section items");
        assert!(!items.is_empty(), "an emptied rail must be dropped");
        for entry in items {
            let library = entry["item"]["library"]
                .as_str()
                .or_else(|| entry["show"]["library"].as_str())
                .expect("entry library");
            assert_ne!(library, shows_lib, "{section}");
        }
    }
}

#[tokio::test]
async fn another_accounts_watch_state_does_not_leak_a_hidden_title() {
    let h = household_where_the_viewer_only_sees_films();
    let owner = Some(h.app.token.as_str());
    let viewer = Some(h.viewer.as_str());

    for (method, uri, body) in [
        (
            "PUT",
            format!("/api/progress/{}", h.episode),
            Some(json!({ "positionMs": 5000, "durationMs": 60000 })),
        ),
        ("PUT", format!("/api/watched/{}", h.movie), None),
        ("PUT", format!("/api/my-list/{}", h.episode), None),
    ] {
        let (status, _) = send(&h.app.app, method, &uri, owner, body).await;
        assert_eq!(status, StatusCode::NO_CONTENT, "{uri}");
    }

    let (_status, owner_progress) = get(&h.app.app, "/api/progress", owner).await;
    assert_eq!(owner_progress.as_array().map(Vec::len), Some(1));

    for uri in [
        "/api/progress",
        "/api/watched",
        "/api/my-list",
        "/api/continue",
    ] {
        let (status, body) = get(&h.app.app, uri, viewer).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            body.as_array().map(Vec::len),
            Some(0),
            "{uri} leaked {body}"
        );
    }
}

#[tokio::test]
async fn a_viewers_own_watch_state_survives_the_filter_for_a_granted_title() {
    let h = household_where_the_viewer_only_sees_films();
    let viewer = Some(h.viewer.as_str());

    let (status, _) = send(
        &h.app.app,
        "PUT",
        &format!("/api/my-list/{}", h.movie),
        viewer,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (status, list) = get(&h.app.app, "/api/my-list", viewer).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(list, json!([h.movie]));
}

#[tokio::test]
async fn an_admin_narrows_a_grant_and_lifts_it_again_through_the_members_api() {
    let t = test_app();
    let (viewer_id, viewer) = seed_session(
        &t.state,
        "viewer@test.dev",
        "viewer",
        &[Permission::Playback],
    );
    let (movies_lib, _shows_lib) = demo_library_ids();
    let owner = Some(t.token.as_str());

    let (status, _) = send(
        &t.app,
        "PATCH",
        &format!("/api/admin/users/{viewer_id}"),
        owner,
        Some(json!({ "libraries": [movies_lib] })),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_status, shows) = get(&t.app, "/api/shows", Some(&viewer)).await;
    assert_eq!(shows.as_array().map(Vec::len), Some(0));

    let (_status, members) = get(&t.app, "/api/admin/users", owner).await;
    let listed = members["users"]
        .as_array()
        .expect("members")
        .iter()
        .find(|u| u["id"] == json!(viewer_id))
        .expect("the viewer's row");
    assert_eq!(listed["libraries"], json!([movies_lib]));

    let (status, _) = send(
        &t.app,
        "PATCH",
        &format!("/api/admin/users/{viewer_id}"),
        owner,
        Some(json!({ "libraries": null })),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_status, shows) = get(&t.app, "/api/shows", Some(&viewer)).await;
    assert_eq!(shows.as_array().map(Vec::len), Some(2));
}

#[tokio::test]
async fn a_grant_left_out_of_the_patch_is_not_disturbed_by_a_rename() {
    let t = test_app();
    let (viewer_id, viewer) = seed_session(
        &t.state,
        "viewer@test.dev",
        "viewer",
        &[Permission::Playback],
    );
    let (movies_lib, _shows_lib) = demo_library_ids();
    grant_libraries(&t.state, &viewer_id, &[movies_lib]);

    let (status, _) = send(
        &t.app,
        "PATCH",
        &format!("/api/admin/users/{viewer_id}"),
        Some(&t.token),
        Some(json!({ "username": "renamed" })),
    )
    .await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_status, shows) = get(&t.app, "/api/shows", Some(&viewer)).await;
    assert_eq!(shows.as_array().map(Vec::len), Some(0));
}

#[tokio::test]
async fn an_account_that_runs_the_server_is_not_held_to_its_own_grant() {
    let t = test_app();
    let (_movies_lib, _shows_lib) = demo_library_ids();
    grant_libraries(&t.state, &t.user_id, &[]);

    let (status, shows) = get(&t.app, "/api/shows", Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(shows.as_array().map(Vec::len), Some(2));
}

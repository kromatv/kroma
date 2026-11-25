use axum::http::StatusCode;
use serde_json::{json, Value};

use crate::api::test_support::{get, seed_playable_item, seed_session, send, test_app, TestApp};
use crate::db;
use crate::model::Permission;

fn heat() -> Value {
    json!({
        "title": " Heat (director's cut) ",
        "originalTitle": "Heat",
        "sortTitle": "Heat 2",
        "tagline": "A Los Angeles crime saga",
        "overview": "A thief and a detective.",
        "released": "1995-12-15",
        "genres": ["Crime", " "],
    })
}

async fn edit(t: &TestApp, uri: &str, token: &str, body: Value) -> (StatusCode, Value) {
    send(&t.app, "PUT", uri, Some(token), Some(body)).await
}

#[tokio::test]
async fn what_an_admin_writes_about_a_film_is_what_its_page_shows_after_a_refresh() {
    let t = test_app();
    let film = seed_playable_item(&t.state, "heat.1995", b"film");
    let uri = format!("/api/edits/item/{film}");

    let (status, kept) = edit(&t, &uri, &t.token, heat()).await;
    let fetched = json!({ "tmdbId": 949, "genres": ["Drama"], "tmdbUrl": "", "title": "Heat" });
    let meta = serde_json::from_value(fetched).expect("metadata literal");
    db::set_item_metadata(&t.state.db, &film, &meta).expect("refresh the metadata");
    let (_, shown) = get(&t.app, &format!("/api/items/{film}"), Some(&t.token)).await;
    let (_, read) = get(&t.app, &uri, Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(kept["title"], json!("Heat (director's cut)"));
    assert_eq!(kept["genres"], json!(["Crime"]));
    assert_eq!(kept["year"], json!(1995));
    assert_eq!(read, kept);
    assert_eq!(shown["title"], json!("Heat (director's cut)"));
    assert_eq!(shown["year"], json!(1995));
    assert_eq!(shown["metadata"]["releaseDate"], json!("1995-12-15"));
    assert_eq!(shown["metadata"]["originalTitle"], json!("Heat"));
    assert_eq!(shown["metadata"]["sortTitle"], json!("Heat 2"));
    assert_eq!(
        shown["metadata"]["tagline"],
        json!("A Los Angeles crime saga")
    );
    assert_eq!(
        shown["metadata"]["overview"],
        json!("A thief and a detective.")
    );
    assert_eq!(shown["metadata"]["genres"], json!(["Crime"]));
}

#[tokio::test]
async fn an_edit_that_does_not_fit_a_title_is_refused() {
    let t = test_app();
    let film = seed_playable_item(&t.state, "Heat", b"film");
    let uri = format!("/api/edits/item/{film}");
    let long = json!({ "title": "a".repeat(301) });
    let no_day = json!({ "released": "1995-02-30" });

    let (status, body) = edit(&t, &uri, &t.token, long).await;
    let (undated, _) = edit(&t, &uri, &t.token, no_day).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["code"], json!("error.titleEditTooLong"));
    assert_eq!(undated, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn a_member_who_cannot_manage_the_library_cannot_edit_a_title() {
    let t = test_app();
    let film = seed_playable_item(&t.state, "Heat", b"film");
    let (_, member) = seed_session(&t.state, "ana@test.dev", "ana", &[Permission::Playback]);
    let uri = format!("/api/edits/item/{film}");

    let (wrote, _) = edit(&t, &uri, &member, heat()).await;
    let (read, _) = get(&t.app, &uri, Some(&member)).await;

    assert_eq!(wrote, StatusCode::FORBIDDEN);
    assert_eq!(read, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn an_edit_for_no_known_title_is_not_found() {
    let t = test_app();
    let film = seed_playable_item(&t.state, "Heat", b"film");

    let (ghost, _) = edit(&t, "/api/edits/show/ghost", &t.token, heat()).await;
    let (person, _) = edit(&t, &format!("/api/edits/person/{film}"), &t.token, heat()).await;

    assert_eq!(ghost, StatusCode::NOT_FOUND);
    assert_eq!(person, StatusCode::NOT_FOUND);
}

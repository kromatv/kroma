use axum::http::StatusCode;
use kroma_module_sdk::engine::model::RequestKind;
use kroma_module_sdk::host::testing::StubHost;
use kroma_module_sdk::host::HostStorage;
use serde_json::{json, Value};

mod world;

use super::routes;
use crate::http::test_support::{admin, call, signed_in, LIBRARIAN};
use crate::search::best::test_world::{
    hold_file, host, monitor, monitored, want, wanted_row, Fakes,
};

const LOW: &str = "/lib/Movie.2020.480p.DVDRip.x264-GRP.mkv";

async fn world(fakes: &Fakes) -> StubHost {
    signed_in(host(fakes).await)
}

async fn send(
    host: &StubHost,
    method: &str,
    path: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    admin(routes::<StubHost>(), host, method, path, body).await
}

fn watch(host: &StubHost, tmdb_id: u64) {
    let title = monitored(RequestKind::Movie, tmdb_id, "Movie", Some(2020));
    monitor(host, &title);
    want(host, &[wanted_row("w1", &title, None, None, "wanted")]);
}

fn forbid_upgrades(host: &StubHost) {
    let mut profile = crate::rules::load(host).unwrap().profile(None).clone();
    profile.upgrades_allowed = false;
    crate::rules::store::save_profile(host.store(), &profile, 1).unwrap();
}

#[tokio::test]
async fn a_title_route_without_a_session_is_refused() {
    let host = world(&Fakes::new()).await;

    let (status, _) = call(
        routes::<StubHost>(),
        &host,
        "GET",
        "/acquisition/cutoff",
        None,
        None,
    )
    .await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn a_title_search_lists_what_the_indexers_offer() {
    let host = world(&Fakes::new().offering(&["Movie.2020.1080p.WEB-DL.x264-GRP"])).await;
    watch(&host, 603);

    let (status, body) = send(
        &host,
        "POST",
        "/acquisition/titles/movie/603/search",
        Some(json!({})),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["releases"].as_array().unwrap().len(), 1);
    assert_eq!(
        body["releases"][0]["title"],
        "Movie.2020.1080p.WEB-DL.x264-GRP"
    );
}

#[tokio::test]
async fn a_title_search_of_an_unknown_kind_is_refused() {
    let host = world(&Fakes::new()).await;

    let (status, body) = send(
        &host,
        "POST",
        "/acquisition/titles/album/1/search",
        Some(json!({})),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "unknown kind");
}

#[tokio::test]
async fn a_title_search_with_no_indexer_is_refused_with_the_reason() {
    let mut fakes = Fakes::new();
    fakes.indexers.clear();
    let host = world(&fakes).await;
    watch(&host, 603);

    let (status, body) = send(
        &host,
        "POST",
        "/acquisition/titles/movie/603/search",
        Some(json!({})),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["error"]
        .as_str()
        .unwrap()
        .contains("no enabled indexer"));
}

#[tokio::test]
async fn a_grab_hands_the_chosen_release_to_the_downloader() {
    let host = signed_in(world::host(&["Movie.2020.1080p.WEB-DL.x264-GRP"]).await);
    watch(&host, 603);
    send(
        &host,
        "POST",
        "/acquisition/titles/movie/603/search",
        Some(json!({})),
    )
    .await;

    let (status, body) = send(
        &host,
        "POST",
        "/acquisition/titles/movie/603/grab",
        Some(json!({ "guid": "Movie.2020.1080p.WEB-DL.x264-GRP", "indexerId": "idx1" })),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body, json!({ "id": "dl1" }));
}

#[tokio::test]
async fn a_grab_of_an_unknown_kind_is_refused() {
    let host = world(&Fakes::new()).await;

    let (status, _) = send(
        &host,
        "POST",
        "/acquisition/titles/album/1/grab",
        Some(json!({ "guid": "g", "indexerId": "idx1" })),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn a_grab_of_a_release_no_search_found_is_refused() {
    let host = world(&Fakes::new()).await;
    watch(&host, 603);

    let (status, body) = send(
        &host,
        "POST",
        "/acquisition/titles/movie/603/grab",
        Some(json!({ "guid": "ghost", "indexerId": "idx1" })),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["error"].as_str().unwrap().contains("search again"));
}

#[tokio::test]
async fn the_cutoff_list_names_a_title_whose_file_is_below_its_profile() {
    let host = world(&Fakes::new()).await;
    let title = monitored(RequestKind::Movie, 603, "Movie", Some(2020));
    monitor(&host, &title);
    hold_file(&host, &title, None, None, LOW);

    let (status, body) = send(&host, "GET", "/acquisition/cutoff", None).await;

    assert_eq!(status, StatusCode::OK, "{body}");
    let entries = body.as_array().unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0]["tmdbId"], 603);
    assert_eq!(entries[0]["kind"], "movie");
    assert_eq!(entries[0]["title"], "Movie");
    assert_eq!(entries[0]["units"], 1);
    assert_eq!(entries[0]["below"], 1);
    assert!(entries[0]["bestQuality"].is_string());
}

#[tokio::test]
async fn the_cutoff_list_skips_titles_with_no_files() {
    let host = world(&Fakes::new()).await;
    watch(&host, 603);

    let (status, body) = send(&host, "GET", "/acquisition/cutoff", None).await;

    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body, json!([]));
}

#[tokio::test]
async fn the_cutoff_list_skips_titles_whose_profile_allows_no_upgrade() {
    let host = world(&Fakes::new()).await;
    forbid_upgrades(&host);
    let title = monitored(RequestKind::Movie, 603, "Movie", Some(2020));
    monitor(&host, &title);
    hold_file(
        &host,
        &title,
        None,
        None,
        "/lib/Movie.2020.2160p.BluRay.x265-GRP.mkv",
    );

    let (_, body) = send(&host, "GET", "/acquisition/cutoff", None).await;

    assert_eq!(body, json!([]));
}

#[tokio::test]
async fn a_librarian_can_read_the_cutoff_list() {
    let host = world(&Fakes::new()).await;

    let (status, body) = call(
        routes::<StubHost>(),
        &host,
        "GET",
        "/acquisition/cutoff",
        Some(LIBRARIAN),
        None,
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!([]));
}

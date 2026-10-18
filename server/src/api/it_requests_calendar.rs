use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{TestApp, get, seed_session, test_app};
use crate::db;
use crate::model::Permission;

const SEVERANCE: u64 = 95396;

fn librarian(t: &TestApp) -> String {
    seed_session(
        &t.state,
        "lib@test.dev",
        "librarian",
        &[
            Permission::LibraryManage,
            Permission::RequestsCreate,
            Permission::RequestsManage,
        ],
    )
    .1
}

fn requester(t: &TestApp) -> String {
    seed_session(
        &t.state,
        "ask@test.dev",
        "asker",
        &[Permission::Playback, Permission::RequestsCreate],
    )
    .1
}

fn seed_monitored_unit(t: &TestApp, season: u32, episode: u32, air_date: &str) {
    let row = db::WantedRow {
        id: db::unit_id("episode", SEVERANCE, Some(season), Some(episode)),
        request_id: None,
        kind: "episode".into(),
        tmdb_id: SEVERANCE,
        imdb_id: None,
        title: "Severance".into(),
        year: Some(2022),
        season: Some(season),
        episode: Some(episode),
        air_date: Some(air_date.into()),
        status: "wanted".into(),
        last_search_at: None,
    };
    db::insert_wanted(&t.state.db, &[row], 1).unwrap();
}

#[tokio::test]
async fn an_owner_sees_the_episodes_still_coming_to_the_titles_they_follow() {
    let t = test_app();
    let token = librarian(&t);
    seed_monitored_unit(&t, 3, 1, "2999-12-04");

    let (status, body) = get(&t.app, "/api/requests/calendar?mine=true", Some(&token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body[0]["tmdbId"], json!(SEVERANCE));
    assert_eq!(body[0]["season"], json!(3));
}

#[tokio::test]
async fn a_member_who_cannot_manage_the_library_still_sees_only_their_requests() {
    let t = test_app();
    let token = requester(&t);
    seed_monitored_unit(&t, 3, 1, "2999-12-04");

    let (status, body) = get(&t.app, "/api/requests/calendar?mine=true", Some(&token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!([]));
}

#[tokio::test]
async fn a_missing_episode_carries_the_name_the_season_guide_gave_it() {
    let t = test_app();
    let token = librarian(&t);
    seed_monitored_unit(&t, 1, 3, "2022-02-24");
    t.state
        .db
        .get()
        .unwrap()
        .execute_batch(
            "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib1','S','shows','/x','now');
             INSERT INTO shows (id,library,title,added_at) VALUES ('s1','lib1','Severance','now');
             INSERT INTO metadata_core (subject_kind,subject_id,tmdb_id,updated_at) VALUES ('show','s1',95396,0);
             INSERT INTO episode_guide (show_id,season,episode,title) VALUES ('s1',1,3,'In Perpetuity');",
        )
        .unwrap();

    let (status, body) = get(&t.app, "/api/requests/missing?mine=true", Some(&token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body[0]["episodeTitle"], json!("In Perpetuity"));
}

//! Integration tests for the problem-report flow: users file reports
//! (`/api/reports`), admins triage them (`/api/admin/reports`). Driven through the
//! real router over the demo catalogue, so a report can target a real movie/show.

use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{demo_item_id, demo_show_id, get, seed_session, send, test_app};
use crate::model::Permission;

fn member(t: &crate::api::test_support::TestApp, tag: &str) -> String {
    let (_id, token) = seed_session(
        &t.state,
        &format!("{tag}@test.dev"),
        tag,
        &[Permission::Playback],
    );
    token
}

#[tokio::test]
async fn any_user_can_file_a_report_and_the_title_is_resolved() {
    let t = test_app();
    let m = member(&t, "reporter");
    let movie = demo_item_id("The Matrix");

    let (status, body) = send(
        &t.app,
        "POST",
        "/api/reports",
        Some(&m),
        Some(json!({ "subjectKind": "movie", "subjectId": movie, "category": "audio", "message": "  no sound  " })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    // The server resolves + snapshots the real title and trims the message.
    assert_eq!(body["subjectTitle"], json!("The Matrix"));
    assert_eq!(body["category"], json!("audio"));
    assert_eq!(body["status"], json!("open"));
    assert_eq!(body["message"], json!("no sound"));

    let (status, mine) = get(&t.app, "/api/reports/mine", Some(&m)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(mine.as_array().unwrap().len(), 1);
    assert_eq!(mine[0]["reportedByName"], json!("reporter"));
}

#[tokio::test]
async fn report_on_unknown_subject_is_404() {
    let t = test_app();
    let m = member(&t, "ghostreporter");
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/reports",
        Some(&m),
        Some(json!({ "subjectKind": "movie", "subjectId": "does-not-exist", "category": "video" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn a_show_report_resolves_the_show_title() {
    let t = test_app();
    let m = member(&t, "showreporter");
    let show = demo_show_id("The Office");
    let (status, body) = send(
        &t.app,
        "POST",
        "/api/reports",
        Some(&m),
        Some(json!({ "subjectKind": "show", "subjectId": show, "category": "metadata" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["subjectTitle"], json!("The Office"));
    // No message is fine (optional).
    assert_eq!(body["message"], json!(null));
}

#[tokio::test]
async fn triage_queue_requires_reports_manage() {
    let t = test_app();
    let m = member(&t, "peon");
    // A plain member can't reach the admin queue or its actions.
    let (status, _) = get(&t.app, "/api/admin/reports", Some(&m)).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/admin/reports/x/resolve",
        Some(&m),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, body) = get(&t.app, "/api/admin/reports", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["reports"].is_array());
    assert!(body["counts"].is_object());
}

#[tokio::test]
async fn resolve_dismiss_reopen_and_delete_transitions() {
    let t = test_app();
    let m = member(&t, "flag");
    let movie = demo_item_id("The Matrix");
    let (_, created) = send(
        &t.app,
        "POST",
        "/api/reports",
        Some(&m),
        Some(json!({ "subjectKind": "movie", "subjectId": movie, "category": "video" })),
    )
    .await;
    let id = created["id"].as_str().unwrap().to_string();

    let (status, body) = send(
        &t.app,
        "POST",
        &format!("/api/admin/reports/{id}/resolve"),
        Some(&t.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], json!("resolved"));
    assert_eq!(body["resolvedBy"], json!(t.user_id));

    let (status, body) = send(
        &t.app,
        "POST",
        &format!("/api/admin/reports/{id}/reopen"),
        Some(&t.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], json!("open"));
    assert_eq!(body["resolvedBy"], json!(null));

    let (status, body) = send(
        &t.app,
        "POST",
        &format!("/api/admin/reports/{id}/dismiss"),
        Some(&t.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], json!("dismissed"));

    let (status, _) = send(
        &t.app,
        "DELETE",
        &format!("/api/admin/reports/{id}"),
        Some(&t.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _) = send(
        &t.app,
        "DELETE",
        &format!("/api/admin/reports/{id}"),
        Some(&t.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn queue_filters_by_status_and_category() {
    let t = test_app();
    let m = member(&t, "filterer");
    let movie = demo_item_id("The Matrix");
    for category in ["audio", "video"] {
        send(
            &t.app,
            "POST",
            "/api/reports",
            Some(&m),
            Some(json!({ "subjectKind": "movie", "subjectId": movie, "category": category })),
        )
        .await;
    }

    // Counts reflect the whole queue regardless of the active filter.
    let (_, body) = get(&t.app, "/api/admin/reports?category=audio", Some(&t.token)).await;
    assert_eq!(body["counts"]["total"], json!(2));
    assert_eq!(body["counts"]["open"], json!(2));
    let list = body["reports"].as_array().unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0]["category"], json!("audio"));

    let (_, body) = get(&t.app, "/api/admin/reports?status=open", Some(&t.token)).await;
    assert_eq!(body["reports"].as_array().unwrap().len(), 2);
    let (_, body) = get(&t.app, "/api/admin/reports?status=resolved", Some(&t.token)).await;
    assert_eq!(body["reports"].as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn an_episode_report_names_the_show_the_season_and_the_episode() {
    let t = test_app();
    let m = member(&t, "epreporter");
    let episode = demo_item_id("Islands");

    let (status, body) = send(
        &t.app,
        "POST",
        "/api/reports",
        Some(&m),
        Some(json!({ "subjectKind": "episode", "subjectId": episode, "category": "subtitles" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["subjectTitle"],
        json!("Planet Earth II S01E01 - Islands")
    );
}

#[tokio::test]
async fn filing_a_report_needs_the_capability_to_watch_in_the_first_place() {
    let t = test_app();
    let (_id, nobody) = seed_session(&t.state, "nobody-r@test.dev", "nobody-r", &[]);
    let movie = demo_item_id("The Matrix");

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/reports",
        Some(&nobody),
        Some(json!({ "subjectKind": "movie", "subjectId": movie, "category": "audio" })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn the_queue_tallies_every_outcome_and_searches_title_and_reporter() {
    let t = test_app();
    let m = member(&t, "seeker");
    let movie = demo_item_id("The Matrix");
    let show = demo_show_id("The Office");

    let mut ids = Vec::new();
    for (kind, subject) in [
        ("movie", movie.as_str()),
        ("movie", movie.as_str()),
        ("show", show.as_str()),
    ] {
        let (_, created) = send(
            &t.app,
            "POST",
            "/api/reports",
            Some(&m),
            Some(json!({ "subjectKind": kind, "subjectId": subject, "category": "other" })),
        )
        .await;
        ids.push(created["id"].as_str().unwrap().to_string());
    }
    send(
        &t.app,
        "POST",
        &format!("/api/admin/reports/{}/resolve", ids[0]),
        Some(&t.token),
        None,
    )
    .await;
    send(
        &t.app,
        "POST",
        &format!("/api/admin/reports/{}/dismiss", ids[1]),
        Some(&t.token),
        None,
    )
    .await;

    let (status, body) = get(&t.app, "/api/admin/reports", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["counts"]["total"], json!(3));
    assert_eq!(body["counts"]["open"], json!(1));
    assert_eq!(body["counts"]["resolved"], json!(1));
    assert_eq!(body["counts"]["dismissed"], json!(1));

    let (_, body) = get(&t.app, "/api/admin/reports?q=+the+office+", Some(&t.token)).await;
    let list = body["reports"].as_array().unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0]["subjectTitle"], json!("The Office"));
    let (_, body) = get(
        &t.app,
        &format!("/api/admin/reports?q={movie}"),
        Some(&t.token),
    )
    .await;
    assert_eq!(body["reports"].as_array().unwrap().len(), 2);
    let (_, body) = get(&t.app, "/api/admin/reports?q=SEEKER", Some(&t.token)).await;
    assert_eq!(body["reports"].as_array().unwrap().len(), 3);
    let (_, body) = get(
        &t.app,
        "/api/admin/reports?q=nobody-filed-this",
        Some(&t.token),
    )
    .await;
    assert_eq!(body["reports"].as_array().unwrap().len(), 0);
    assert_eq!(body["counts"]["total"], json!(3));
}

#[tokio::test]
async fn a_transition_on_a_report_that_is_not_there_is_a_404() {
    let t = test_app();
    for action in ["resolve", "dismiss", "reopen"] {
        let (status, _) = send(
            &t.app,
            "POST",
            &format!("/api/admin/reports/no-such-report/{action}"),
            Some(&t.token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{action}");
    }
}

#[tokio::test]
async fn resolving_a_show_report_deep_links_the_reporter_to_the_show() {
    let t = test_app();
    let m = member(&t, "showflag");
    let show = demo_show_id("The Office");
    let (_, created) = send(
        &t.app,
        "POST",
        "/api/reports",
        Some(&m),
        Some(json!({ "subjectKind": "show", "subjectId": show, "category": "metadata" })),
    )
    .await;
    let id = created["id"].as_str().unwrap().to_string();

    let (status, _) = send(
        &t.app,
        "POST",
        &format!("/api/admin/reports/{id}/resolve"),
        Some(&t.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (_, inbox) = get(&t.app, "/api/notifications", Some(&m)).await;
    let row = &inbox["notifications"][0];
    assert_eq!(row["event"], json!("report.resolved"));
    assert_eq!(row["link"], json!(format!("/show/{show}")));
}

#[tokio::test]
async fn an_episode_with_no_numbering_is_named_by_its_own_title() {
    let t = test_app();
    let m = member(&t, "loosereporter");
    let episode = demo_item_id("Islands");
    t.state
        .db
        .get()
        .expect("a connection")
        .execute(
            "UPDATE items SET season = NULL, episode = NULL WHERE id = ?1",
            rusqlite::params![episode],
        )
        .expect("strip the numbering");

    let (status, body) = send(
        &t.app,
        "POST",
        "/api/reports",
        Some(&m),
        Some(json!({ "subjectKind": "episode", "subjectId": episode, "category": "video" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["subjectTitle"], json!("Islands"));
}

#[tokio::test]
async fn a_report_that_cannot_be_written_refuses_rather_than_answering_empty() {
    let t = test_app();
    let m = member(&t, "unwritable");
    let movie = demo_item_id("The Matrix");
    t.state
        .db
        .get()
        .expect("a connection")
        .execute_batch(
            "CREATE TRIGGER no_reports BEFORE INSERT ON reports \
             BEGIN SELECT RAISE(ABORT,'sealed'); END",
        )
        .expect("seal the table");

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/reports",
        Some(&m),
        Some(json!({ "subjectKind": "movie", "subjectId": movie, "category": "video" })),
    )
    .await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn resolving_a_report_filed_by_nobody_notifies_nobody() {
    let t = test_app();
    let movie = demo_item_id("The Matrix");
    crate::db::insert_report(
        &t.state.db,
        &crate::db::NewReport {
            id: "anon-report".into(),
            subject_kind: crate::model::ReportSubjectKind::Movie,
            subject_id: movie,
            subject_title: "The Matrix".into(),
            category: crate::model::ReportCategory::Video,
            message: None,
            reported_by: None,
        },
        crate::services::jobs::now_ms(),
    )
    .expect("seed an anonymous report");

    let (status, body) = send(
        &t.app,
        "POST",
        "/api/admin/reports/anon-report/resolve",
        Some(&t.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], json!("resolved"));
    assert_eq!(body["reportedBy"], json!(null));
}

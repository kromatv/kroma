//! Integration tests for the notification centre (`/api/notifications`), driven
//! through the real router.
//!
//! The property worth guarding here is isolation: an inbox is per-account, and
//! the id in a URL never selects whose inbox is touched. Delivery itself (who
//! gets told about what) is unit-tested in `services::notify`.

use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{get, seed_session, send, test_app, TestApp};
use crate::model::{Audience, NotificationEvent, NotificationSpec, Permission};

fn member(t: &TestApp, tag: &str) -> (String, String) {
    let (id, token) =
        seed_session(&t.state, &format!("{tag}@test.dev"), tag, &[Permission::Playback]);
    (id, token)
}

/// Raise one notification for `user_id` through the real service.
fn notify_user(t: &TestApp, user_id: &str, title: &str) {
    let spec = NotificationSpec::new(
        NotificationEvent::RequestAvailable,
        "notifications.request.available.title",
        "notifications.request.available.body",
    )
    .param("title", title)
    .link("/movie/ab12")
    .image(Some("https://img/poster.jpg".into()))
    .action(crate::model::ActionSpec {
        id: "watch".into(),
        label_key: "notifications.action.watch".into(),
        kind: crate::model::ActionKind::Link,
        href: "/watch/ab12".into(),
        method: None,
        style: crate::model::ActionStyle::Primary,
    });
    let sent = crate::services::notify::emit(&t.state, &Audience::user(user_id), &spec);
    assert_eq!(sent, 1, "notification should have been delivered");
}

#[tokio::test]
async fn the_inbox_returns_rendered_rows_with_image_link_and_actions() {
    let t = test_app();
    let (ana_id, ana) = member(&t, "ana");
    notify_user(&t, &ana_id, "Dune");

    let (status, body) = get(&t.app, "/api/notifications", Some(&ana)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["unread"], json!(1));
    let row = &body["notifications"][0];
    // Text arrives RENDERED, not as the stored i18n key.
    assert!(!row["title"].as_str().unwrap().starts_with("notifications."));
    assert!(row["body"].as_str().unwrap().contains("Dune"), "body: {}", row["body"]);
    assert_eq!(row["category"], json!("requests"));
    assert_eq!(row["event"], json!("request.available"));
    assert_eq!(row["link"], json!("/movie/ab12"));
    assert_eq!(row["imageUrl"], json!("https://img/poster.jpg"));
    assert_eq!(row["read"], json!(false));
    // The action button came through, with its label resolved too.
    let action = &row["actions"][0];
    assert_eq!(action["id"], json!("watch"));
    assert_eq!(action["kind"], json!("link"));
    assert_eq!(action["href"], json!("/watch/ab12"));
    assert_eq!(action["style"], json!("primary"));
    assert!(!action["label"].as_str().unwrap().starts_with("notifications."));
}

#[tokio::test]
async fn one_users_notifications_are_invisible_to_another() {
    let t = test_app();
    let (ana_id, _ana) = member(&t, "ana2");
    let (_bo_id, bo) = member(&t, "bo2");
    notify_user(&t, &ana_id, "Dune");

    // Bo's inbox is empty even though the server holds a notification.
    let (status, body) = get(&t.app, "/api/notifications", Some(&bo)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["unread"], json!(0));
    assert_eq!(body["notifications"].as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn the_inbox_requires_a_session() {
    let t = test_app();
    let (status, _) = get(&t.app, "/api/notifications", None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn marking_all_read_clears_the_badge() {
    let t = test_app();
    let (ana_id, ana) = member(&t, "ana3");
    notify_user(&t, &ana_id, "Dune");
    notify_user(&t, &ana_id, "Arrival");

    let (status, body) = send(&t.app, "POST", "/api/notifications/read", Some(&ana), Some(json!({})))
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["unread"], json!(0));

    let (_, inbox) = get(&t.app, "/api/notifications", Some(&ana)).await;
    assert_eq!(inbox["unread"], json!(0));
    // The rows are still there, just read.
    assert_eq!(inbox["notifications"].as_array().unwrap().len(), 2);
    assert_eq!(inbox["notifications"][0]["read"], json!(true));
}

#[tokio::test]
async fn marking_one_read_leaves_the_others_unread() {
    let t = test_app();
    let (ana_id, ana) = member(&t, "ana4");
    notify_user(&t, &ana_id, "Dune");
    notify_user(&t, &ana_id, "Arrival");

    let (_, inbox) = get(&t.app, "/api/notifications", Some(&ana)).await;
    let first = inbox["notifications"][0]["id"].as_str().unwrap().to_string();

    let (status, body) = send(
        &t.app,
        "POST",
        "/api/notifications/read",
        Some(&ana),
        Some(json!({ "ids": [first] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["unread"], json!(1));
}

#[tokio::test]
async fn marking_read_cannot_reach_another_users_notification() {
    let t = test_app();
    let (ana_id, ana) = member(&t, "ana5");
    let (_bo_id, bo) = member(&t, "bo5");
    notify_user(&t, &ana_id, "Dune");

    let (_, inbox) = get(&t.app, "/api/notifications", Some(&ana)).await;
    let ana_row = inbox["notifications"][0]["id"].as_str().unwrap().to_string();

    // Bo names Ana's id explicitly. It must not mark it read.
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/notifications/read",
        Some(&bo),
        Some(json!({ "ids": [ana_row] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (_, ana_inbox) = get(&t.app, "/api/notifications", Some(&ana)).await;
    assert_eq!(ana_inbox["unread"], json!(1), "Bo must not be able to read Ana's mail");
}

#[tokio::test]
async fn deleting_is_scoped_to_the_owner() {
    let t = test_app();
    let (ana_id, ana) = member(&t, "ana6");
    let (_bo_id, bo) = member(&t, "bo6");
    notify_user(&t, &ana_id, "Dune");

    let (_, inbox) = get(&t.app, "/api/notifications", Some(&ana)).await;
    let id = inbox["notifications"][0]["id"].as_str().unwrap().to_string();

    // Bo cannot delete it...
    let (status, _) =
        send(&t.app, "DELETE", &format!("/api/notifications/{id}"), Some(&bo), None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, still) = get(&t.app, "/api/notifications", Some(&ana)).await;
    assert_eq!(still["notifications"].as_array().unwrap().len(), 1);

    // ...but Ana can.
    let (status, _) =
        send(&t.app, "DELETE", &format!("/api/notifications/{id}"), Some(&ana), None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, gone) = get(&t.app, "/api/notifications", Some(&ana)).await;
    assert_eq!(gone["notifications"].as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn prefs_start_fully_on_and_round_trip_through_a_put() {
    let t = test_app();
    let (_ana_id, ana) = member(&t, "ana7");

    let (status, body) = get(&t.app, "/api/notifications/prefs", Some(&ana)).await;
    assert_eq!(status, StatusCode::OK);
    let categories = body["categories"].as_array().unwrap();
    assert_eq!(categories.len(), 5);
    assert!(categories.iter().all(|c| c["inApp"] == json!(true) && c["push"] == json!(true)));

    let (status, body) = send(
        &t.app,
        "PUT",
        "/api/notifications/prefs",
        Some(&ana),
        Some(json!({ "categories": [{ "category": "media", "inApp": false, "push": false }] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let media = body["categories"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["category"] == json!("media"))
        .unwrap();
    assert_eq!(media["inApp"], json!(false));
    // Untouched categories keep the default.
    let requests = body["categories"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["category"] == json!("requests"))
        .unwrap();
    assert_eq!(requests["inApp"], json!(true));
}

#[tokio::test]
async fn a_muted_category_stops_landing_in_the_inbox() {
    let t = test_app();
    let (ana_id, ana) = member(&t, "ana8");

    send(
        &t.app,
        "PUT",
        "/api/notifications/prefs",
        Some(&ana),
        Some(json!({ "categories": [{ "category": "requests", "inApp": false, "push": false }] })),
    )
    .await;

    // Same spec as everywhere else, but this user muted `requests`.
    let spec = NotificationSpec::new(
        NotificationEvent::RequestAvailable,
        "notifications.request.available.title",
        "notifications.request.available.body",
    );
    let sent = crate::services::notify::emit(&t.state, &Audience::user(&ana_id), &spec);
    assert_eq!(sent, 0);

    let (_, inbox) = get(&t.app, "/api/notifications", Some(&ana)).await;
    assert_eq!(inbox["unread"], json!(0));
}

/// The report flow end to end: filing tells the moderators, triaging tells the
/// reporter, and a reopen tells nobody.
#[tokio::test]
async fn the_report_lifecycle_notifies_both_sides_but_not_on_reopen() {
    let t = test_app();
    let (_ana_id, ana) = member(&t, "ana10");
    let movie = crate::api::test_support::demo_item_id("The Matrix");

    // Filing reaches the owner (who holds `reports.manage`), not the reporter.
    let (status, report) = send(
        &t.app,
        "POST",
        "/api/reports",
        Some(&ana),
        Some(json!({ "subjectKind": "movie", "subjectId": movie, "category": "audio" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let report_id = report["id"].as_str().unwrap().to_string();

    let (_, owner_inbox) = get(&t.app, "/api/notifications", Some(&t.token)).await;
    assert_eq!(owner_inbox["unread"], json!(1));
    assert_eq!(owner_inbox["notifications"][0]["event"], json!("report.submitted"));
    assert_eq!(owner_inbox["notifications"][0]["link"], json!("/admin/reports"));
    let (_, ana_inbox) = get(&t.app, "/api/notifications", Some(&ana)).await;
    assert_eq!(ana_inbox["unread"], json!(0), "the reporter should not notify themselves");

    // Resolving tells the reporter, and deep-links to the title they reported.
    let (status, _) = send(
        &t.app,
        "POST",
        &format!("/api/admin/reports/{report_id}/resolve"),
        Some(&t.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let (_, ana_inbox) = get(&t.app, "/api/notifications", Some(&ana)).await;
    assert_eq!(ana_inbox["unread"], json!(1));
    assert_eq!(ana_inbox["notifications"][0]["event"], json!("report.resolved"));
    assert_eq!(ana_inbox["notifications"][0]["link"], json!(format!("/movie/{movie}")));

    // Reopening is moderator churn: the reporter hears nothing new.
    send(&t.app, "POST", &format!("/api/admin/reports/{report_id}/reopen"), Some(&t.token), None)
        .await;
    let (_, ana_inbox) = get(&t.app, "/api/notifications", Some(&ana)).await;
    assert_eq!(ana_inbox["unread"], json!(1), "a reopen must not re-notify");
}

#[tokio::test]
async fn a_moderator_audience_reaches_the_capability_holder_only() {
    let t = test_app();
    let (_mod_id, moderator) =
        seed_session(&t.state, "mod@test.dev", "mod", &[Permission::RequestsManage]);
    let (_plain_id, plain) = member(&t, "plain9");

    let spec = NotificationSpec::new(
        NotificationEvent::RequestSubmitted,
        "notifications.request.submitted.title",
        "notifications.request.submitted.body",
    )
    .param("user", "Ana")
    .param("title", "Dune");
    let sent = crate::services::notify::emit(
        &t.state,
        &Audience::permission(Permission::RequestsManage),
        &spec,
    );
    // Two holders: the moderator seeded above AND the fixture's owner, who is
    // created with `Permission::all()`. Both should be told a request needs review.
    assert_eq!(sent, 2);

    let (_, mod_inbox) = get(&t.app, "/api/notifications", Some(&moderator)).await;
    assert_eq!(mod_inbox["unread"], json!(1));
    let (_, owner_inbox) = get(&t.app, "/api/notifications", Some(&t.token)).await;
    assert_eq!(owner_inbox["unread"], json!(1));
    // The one account WITHOUT the capability hears nothing.
    let (_, plain_inbox) = get(&t.app, "/api/notifications", Some(&plain)).await;
    assert_eq!(plain_inbox["unread"], json!(0));
}

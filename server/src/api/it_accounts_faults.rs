use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{get, seed_session, send, test_app, TestApp};
use crate::model::Permission;

const HIDE_PASSWORD_HASH: &str =
    "ALTER TABLE users RENAME COLUMN password_hash TO password_hash_gone";

fn sql(t: &TestApp, script: &str) {
    t.state.db.get().expect("a connection").execute_batch(script).expect("reshape the schema");
}

fn steal_the_new_email_then_fail(thief: &str) -> String {
    format!(
        "CREATE TRIGGER email_stolen BEFORE UPDATE OF email ON users BEGIN \
           UPDATE users SET email = NEW.email WHERE id = '{thief}'; \
           SELECT RAISE(FAIL,'taken'); \
         END"
    )
}

#[tokio::test]
async fn patching_the_email_refuses_when_the_account_cannot_be_read() {
    let t = test_app();
    sql(&t, HIDE_PASSWORD_HASH);

    let (status, _) = send(
        &t.app,
        "PATCH",
        "/api/auth/me",
        Some(&t.token),
        Some(json!({ "email": "elsewhere@test.dev" })),
    )
    .await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn an_email_taken_between_the_check_and_the_write_is_a_conflict_not_a_crash() {
    let t = test_app();
    let (rival, _) = seed_session(&t.state, "rival@test.dev", "rival", &[Permission::Playback]);
    sql(&t, &steal_the_new_email_then_fail(&rival));

    let (status, body) = send(
        &t.app,
        "PATCH",
        "/api/auth/me",
        Some(&t.token),
        Some(json!({ "email": "contested@test.dev" })),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert!(body["error"].as_str().is_some_and(|m| !m.is_empty()), "{body}");
}

#[tokio::test]
async fn an_email_write_that_failed_against_nobody_but_itself_is_still_a_failure() {
    let t = test_app();
    let self_id = t.user_id.clone();
    sql(&t, &steal_the_new_email_then_fail(&self_id));

    let (status, _) = send(
        &t.app,
        "PATCH",
        "/api/auth/me",
        Some(&t.token),
        Some(json!({ "email": "renamed@test.dev" })),
    )
    .await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn changing_the_password_refuses_when_the_stored_hash_cannot_be_read() {
    let t = test_app();
    sql(&t, HIDE_PASSWORD_HASH);

    let (status, _) = send(
        &t.app,
        "PATCH",
        "/api/auth/me/password",
        Some(&t.token),
        Some(json!({ "current": "hunter2!", "next": "hunter3!" })),
    )
    .await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn the_device_list_and_its_revoke_refuse_when_the_credentials_are_gone() {
    let t = test_app();
    sql(&t, "DROP TABLE access_tokens");

    let (status, _) = get(&t.app, "/api/auth/me/sessions", Some(&t.token)).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);

    let (status, _) =
        send(&t.app, "DELETE", "/api/auth/me/sessions/whatever", Some(&t.token), None).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn the_device_list_refuses_when_a_session_cannot_name_its_own_device() {
    let t = test_app();
    sql(&t, "ALTER TABLE sessions RENAME COLUMN access_token TO access_token_gone");

    let (status, _) = get(&t.app, "/api/auth/me/sessions", Some(&t.token)).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn the_public_roster_refuses_when_the_accounts_are_gone() {
    let t = test_app();
    t.state
        .settings
        .set_patch(&t.state.db, [("publicUserList".to_string(), json!(true))].into_iter().collect());
    sql(&t, "DROP TABLE users");

    let (status, _) = get(&t.app, "/api/users", None).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn an_avatar_the_store_already_holds_is_adopted_without_an_encoder() {
    let t = test_app();
    let (_uid, token) = seed_session(&t.state, "ana@test.dev", "ana", &[Permission::Playback]);
    let bytes = "a portrait this store has seen before";
    let name = seed_rendition(&t, bytes);

    let (status, body) = upload(&t.app, &token, bytes.as_bytes().to_vec()).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["avatarUrl"], json!(format!("/api/images/{name}")));

    let (_, me) = get(&t.app, "/api/auth/me", Some(&token)).await;
    assert_eq!(me["user"]["avatarUrl"], json!(format!("/api/images/{name}")));
}

#[tokio::test]
async fn an_avatar_that_cannot_be_recorded_refuses_rather_than_reporting_a_url() {
    let t = test_app();
    let (_uid, token) = seed_session(&t.state, "ana@test.dev", "ana", &[Permission::Playback]);
    let bytes = "a portrait nothing will admit to";
    seed_rendition(&t, bytes);
    sql(
        &t,
        "CREATE TRIGGER no_avatars BEFORE UPDATE OF avatar_url ON users \
         BEGIN SELECT RAISE(ABORT,'sealed'); END",
    );

    let (status, _) = upload(&t.app, &token, bytes.as_bytes().to_vec()).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
}

fn seed_rendition(t: &TestApp, bytes: &str) -> String {
    let name = format!("{}-w512.webp", crate::services::scan::short_hash(bytes));
    let dir = crate::infra::image::images_dir(&t.state.config.data_dir);
    std::fs::create_dir_all(&dir).expect("images dir");
    std::fs::write(dir.join(&name), b"already-encoded").expect("seed the rendition");
    name
}

async fn upload(
    app: &axum::Router,
    token: &str,
    bytes: Vec<u8>,
) -> (StatusCode, serde_json::Value) {
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt as _;

    let req = Request::builder()
        .method("POST")
        .uri("/api/users/avatar")
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "image/png")
        .body(Body::from(bytes))
        .expect("build request");
    let resp = app.clone().oneshot(req).await.expect("response");
    let status = resp.status();
    let body = axum::body::to_bytes(resp.into_body(), usize::MAX).await.expect("read body");
    (status, serde_json::from_slice(&body).unwrap_or(serde_json::Value::Null))
}

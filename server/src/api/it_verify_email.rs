//! Integration tests for address verification (`api/accounts/verify_email.rs`)
//! and the two links the owner mints from the member editor
//! (`api/admin/users/links.rs`): what they return, who may ask, and how a send
//! failure still leaves the owner something to copy.

use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{get, seed_session, send, test_app, TestApp};
use crate::db;
use crate::model::Permission;

const FUTURE: i64 = 9_999_999_999;
const PAST: i64 = 1;

fn mint(t: &TestApp, token: &str, user_id: &str, email: &str, expires_at: i64) {
    db::create_verification(&t.state.db, token, user_id, email, user_id, expires_at)
        .expect("mint a verification");
}

async fn confirm(t: &TestApp, token: &str) -> StatusCode {
    send(
        &t.app,
        "POST",
        "/api/auth/verify-email",
        None,
        Some(json!({ "token": token })),
    )
    .await
    .0
}

#[tokio::test]
async fn the_check_greets_the_user_only_while_the_link_still_holds() {
    let t = test_app();
    let (uid, _) = seed_session(&t.state, "iris@test.dev", "iris", &[Permission::Playback]);
    let (stale_uid, _) = seed_session(&t.state, "jo@test.dev", "jo", &[Permission::Playback]);
    mint(&t, "good", &uid, "iris@test.dev", FUTURE);
    mint(&t, "stale", &stale_uid, "jo@test.dev", PAST);

    let (status, body) = get(&t.app, "/api/auth/verify-email/good", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["valid"], json!(true));
    assert_eq!(body["username"], json!("iris"));

    let (_, body) = get(&t.app, "/api/auth/verify-email/stale", None).await;
    assert_eq!(body["valid"], json!(false));

    let (_, body) = get(&t.app, "/api/auth/verify-email/never-minted", None).await;
    assert_eq!(body["valid"], json!(false));
    assert_eq!(body["username"], json!(null));
}

#[tokio::test]
async fn a_link_minted_for_an_address_the_account_has_since_left_verifies_nothing() {
    let t = test_app();
    let (uid, _) = seed_session(&t.state, "ada@test.dev", "ada", &[Permission::Playback]);
    mint(&t, "tok", &uid, "ada@test.dev", FUTURE);
    db::set_user_email(&t.state.db, &uid, "elsewhere@test.dev").expect("move the address");

    let (_, body) = get(&t.app, "/api/auth/verify-email/tok", None).await;
    assert_eq!(body["valid"], json!(false));
    assert_eq!(confirm(&t, "tok").await, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn a_link_whose_account_is_gone_verifies_nothing() {
    let t = test_app();
    let (uid, _) = seed_session(&t.state, "eve@test.dev", "eve", &[Permission::Playback]);
    mint(&t, "tok", &uid, "eve@test.dev", FUTURE);
    db::delete_user(&t.state.db, &uid).expect("remove the account");

    let (_, body) = get(&t.app, "/api/auth/verify-email/tok", None).await;
    assert_eq!(body["valid"], json!(false));
}

#[tokio::test]
async fn confirming_marks_the_address_verified_once_and_only_once() {
    let t = test_app();
    let (uid, _) = seed_session(&t.state, "hal@test.dev", "hal", &[Permission::Playback]);
    mint(&t, "tok", &uid, "hal@test.dev", FUTURE);

    assert_eq!(confirm(&t, "tok").await, StatusCode::NO_CONTENT);
    let (_, body) = get(&t.app, "/api/admin/users", Some(&t.token)).await;
    let row = body["users"]
        .as_array()
        .expect("the member list")
        .iter()
        .find(|u| u["id"] == json!(uid))
        .expect("the member")
        .clone();
    assert_eq!(row["emailVerified"], json!(true));

    assert_eq!(confirm(&t, "tok").await, StatusCode::BAD_REQUEST);
    assert_eq!(confirm(&t, "never-minted").await, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn a_relay_grant_riding_in_with_the_click_is_kept_for_the_address() {
    let t = test_app();
    let (uid, _) = seed_session(&t.state, "kim@test.dev", "kim", &[Permission::Playback]);
    mint(&t, "tok", &uid, "kim@test.dev", FUTURE);

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/auth/verify-email",
        None,
        Some(json!({ "token": "tok", "grant": "v1.sealed-by-the-relay" })),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let grant = db::mail_grant(&t.state.db, &uid)
        .expect("read the grant")
        .expect("a grant");
    assert_eq!(grant.grant, "v1.sealed-by-the-relay");
    assert_eq!(grant.email, "kim@test.dev");

    db::set_user_email(&t.state.db, &uid, "moved@test.dev").expect("move the address");
    assert!(db::mail_grant(&t.state.db, &uid)
        .expect("read the grant")
        .is_none());
}

#[tokio::test]
async fn a_grant_offered_on_a_dead_link_is_dropped_with_it() {
    let t = test_app();
    let (uid, _) = seed_session(&t.state, "lou@test.dev", "lou", &[Permission::Playback]);
    mint(&t, "stale", &uid, "lou@test.dev", PAST);

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/auth/verify-email",
        None,
        Some(json!({ "token": "stale", "grant": "v1.sealed" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(db::mail_grant(&t.state.db, &uid)
        .expect("read the grant")
        .is_none());

    mint(&t, "tok", &uid, "lou@test.dev", FUTURE);
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/auth/verify-email",
        None,
        Some(json!({ "token": "tok", "grant": "x".repeat(5000) })),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert!(db::mail_grant(&t.state.db, &uid)
        .expect("read the grant")
        .is_none());
}

fn choose_relay(t: &TestApp) {
    t.state.settings.set_patch(
        &t.state.db,
        [
            ("emailDelivery".to_string(), json!("relay")),
            ("remoteUrl".to_string(), json!("https://kroma.test")),
        ]
        .into_iter()
        .collect(),
    );
}

#[tokio::test]
async fn on_the_relay_a_reset_for_an_address_that_never_consented_is_carried_by_hand() {
    let t = test_app();
    choose_relay(&t);
    let (uid, _) = seed_session(&t.state, "max@test.dev", "max", &[Permission::Playback]);

    let (status, body) = send(
        &t.app,
        "POST",
        &format!("/api/admin/users/{uid}/reset"),
        Some(&t.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["delivered"], json!("unconfirmed"));
    assert!(body["url"]
        .as_str()
        .expect("a link")
        .starts_with("https://kroma.test/reset?token="));
}

#[tokio::test]
async fn on_the_relay_a_verification_asks_the_mailbox_and_an_unreachable_relay_leaves_the_link() {
    let t = test_app();
    choose_relay(&t);
    let (uid, _) = seed_session(&t.state, "nia@test.dev", "nia", &[Permission::Playback]);

    let (status, body) = send(
        &t.app,
        "POST",
        &format!("/api/admin/users/{uid}/email-verification"),
        Some(&t.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["delivered"], json!("manual"));
    let token = body["token"].as_str().expect("a token");
    let (_, check) = get(&t.app, &format!("/api/auth/verify-email/{token}"), None).await;
    assert_eq!(check["valid"], json!(true));
}

#[tokio::test]
async fn a_stored_grant_survives_a_relay_that_is_merely_unreachable() {
    let t = test_app();
    choose_relay(&t);
    let (uid, _) = seed_session(&t.state, "oli@test.dev", "oli", &[Permission::Playback]);
    db::set_mail_grant(&t.state.db, &uid, "oli@test.dev", "v1.sealed").expect("store a grant");

    let (_, body) = send(
        &t.app,
        "POST",
        &format!("/api/admin/users/{uid}/reset"),
        Some(&t.token),
        None,
    )
    .await;
    assert_eq!(body["delivered"], json!("manual"));
    assert!(db::mail_grant(&t.state.db, &uid)
        .expect("read the grant")
        .is_some());
}

#[tokio::test]
async fn a_bare_get_never_consumes_the_link() {
    let t = test_app();
    let (uid, _) = seed_session(&t.state, "ivy@test.dev", "ivy", &[Permission::Playback]);
    mint(&t, "tok", &uid, "ivy@test.dev", FUTURE);

    get(&t.app, "/api/auth/verify-email/tok", None).await;

    assert!(db::get_verification(&t.state.db, "tok")
        .expect("read the verification")
        .expect("the verification")
        .used_at
        .is_none());
    assert_eq!(confirm(&t, "tok").await, StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn minting_a_reset_returns_a_code_and_a_link_the_owner_can_carry() {
    let t = test_app();
    let (uid, _) = seed_session(&t.state, "lee@test.dev", "lee", &[Permission::Playback]);

    let (status, body) = send(
        &t.app,
        "POST",
        &format!("/api/admin/users/{uid}/reset"),
        Some(&t.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["delivered"], json!("manual"));
    assert_eq!(body["url"], json!(null));
    assert_eq!(body["code"].as_str().expect("a code").len(), 8);
    assert!(body["expiresAt"].as_i64().expect("an expiry") > 0);

    let token = body["token"].as_str().expect("a token");
    let (_, check) = get(&t.app, &format!("/api/auth/reset/{token}"), None).await;
    assert_eq!(check["valid"], json!(true));
    assert_eq!(check["username"], json!("lee"));
}

#[tokio::test]
async fn minting_a_verification_returns_a_link_and_no_code() {
    let t = test_app();
    let (uid, _) = seed_session(&t.state, "moe@test.dev", "moe", &[Permission::Playback]);

    let (status, body) = send(
        &t.app,
        "POST",
        &format!("/api/admin/users/{uid}/email-verification"),
        Some(&t.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["delivered"], json!("manual"));
    assert_eq!(body["code"], json!(null));

    let token = body["token"].as_str().expect("a token");
    assert_eq!(confirm(&t, token).await, StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn a_mint_builds_its_link_from_the_public_url_when_one_is_known() {
    let t = test_app();
    let (uid, _) = seed_session(&t.state, "nan@test.dev", "nan", &[Permission::Playback]);
    t.state.settings.set_patch(
        &t.state.db,
        [("remoteUrl".to_string(), json!("https://home.example"))]
            .into_iter()
            .collect(),
    );

    let (_, reset) = send(
        &t.app,
        "POST",
        &format!("/api/admin/users/{uid}/reset"),
        Some(&t.token),
        None,
    )
    .await;
    assert!(reset["url"]
        .as_str()
        .expect("a url")
        .starts_with("https://home.example/reset?token="));

    let (_, verify) = send(
        &t.app,
        "POST",
        &format!("/api/admin/users/{uid}/email-verification"),
        Some(&t.token),
        None,
    )
    .await;
    assert!(verify["url"]
        .as_str()
        .expect("a url")
        .starts_with("https://home.example/verify-email?token="));
}

#[tokio::test]
async fn minting_for_an_account_that_is_not_there_is_a_404() {
    let t = test_app();

    for path in ["reset", "email-verification", "pin"] {
        let method = if path == "pin" { "DELETE" } else { "POST" };
        let (status, _) = send(
            &t.app,
            method,
            &format!("/api/admin/users/ghost/{path}"),
            Some(&t.token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{path}");
    }
}

#[tokio::test]
async fn a_member_without_the_manage_right_cannot_mint_anything() {
    let t = test_app();
    let (uid, viewer) = seed_session(&t.state, "pat@test.dev", "pat", &[Permission::Playback]);

    for path in ["reset", "email-verification"] {
        let (status, _) = send(
            &t.app,
            "POST",
            &format!("/api/admin/users/{uid}/{path}"),
            Some(&viewer),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN, "{path}");
    }
}

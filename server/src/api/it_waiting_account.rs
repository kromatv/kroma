use axum::http::StatusCode;
use serde_json::{json, Value};

use crate::api::test_support::{
    demo_library_ids, get, join, mint_invitation, raw, seed_session, seed_waiting, send, test_app,
    upload, TestApp, PASSWORD,
};
use crate::db;
use crate::model::Permission;

async fn member_row(t: &TestApp, user_id: &str) -> Value {
    let (status, body) = get(&t.app, "/api/admin/users", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    body["users"]
        .as_array()
        .expect("the member list")
        .iter()
        .find(|member| member["id"] == json!(user_id))
        .cloned()
        .expect("the account is on the member list")
}

async fn mint_as(t: &TestApp, token: &str, user_id: &str) -> StatusCode {
    let uri = format!("/api/admin/users/{user_id}/invitation");
    send(&t.app, "POST", &uri, Some(token), None).await.0
}

#[tokio::test]
async fn the_join_page_learns_who_a_waiting_accounts_invitation_is_for() {
    let t = test_app();
    let ana = seed_waiting(&t.state, "ana", Some("ana@old.test"));

    let invite = mint_invitation(&t, &ana).await;

    let (status, check) = get(&t.app, &format!("/api/invites/{invite}"), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(check["valid"], json!(true));
    assert_eq!(check["username"], json!("ana"));
    assert_eq!(check["email"], json!("ana@old.test"));
    let (_, open) = get(&t.app, "/api/invites", Some(&t.token)).await;
    assert_eq!(open, json!([]));
}

#[tokio::test]
async fn minting_takes_the_right_to_manage_users_and_an_account_that_waits() {
    let t = test_app();
    let ana = seed_waiting(&t.state, "ana", None);
    let (member, member_token) =
        seed_session(&t.state, "bo@test.dev", "bo", &[Permission::Playback]);

    let without_the_right = mint_as(&t, &member_token, &ana).await;
    let for_a_held_account = mint_as(&t, &t.token, &member).await;
    let for_nobody = mint_as(&t, &t.token, "no-such-account").await;

    assert_eq!(without_the_right, StatusCode::FORBIDDEN);
    assert_eq!(for_a_held_account, StatusCode::CONFLICT);
    assert_eq!(for_nobody, StatusCode::NOT_FOUND);
    assert_eq!(member_row(&t, &ana).await["invitation"], json!("none"));
}

#[tokio::test]
async fn redeeming_the_invitation_signs_the_person_in_to_the_account_that_waited() {
    let t = test_app();
    let ana = seed_waiting(&t.state, "ana", Some("ana@old.test"));
    let invite = mint_invitation(&t, &ana).await;

    let (status, joined) = join(&t.app, &invite, "Ana@New.test", "anabel").await;

    assert_eq!(status, StatusCode::OK, "{joined}");
    assert_eq!(joined["user"]["id"], json!(ana));
    assert_eq!(joined["user"]["username"], json!("anabel"));
    assert_eq!(joined["user"]["email"], json!("ana@new.test"));
    assert_eq!(joined["user"]["libraries"], json!([demo_library_ids().0]));
    let session = joined["token"].as_str().expect("a session");
    let (status, me) = get(&t.app, "/api/auth/me", Some(session)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(me["user"]["id"], json!(ana));
    assert_eq!(member_row(&t, &ana).await["invitation"], Value::Null);
}

#[tokio::test]
async fn the_password_chosen_at_redemption_is_the_accounts_password_from_then_on() {
    let t = test_app();
    let ana = seed_waiting(&t.state, "ana", None);
    let invite = mint_invitation(&t, &ana).await;
    join(&t.app, &invite, "ana@test.dev", "ana").await;

    let (status, _, signed_in) = raw(
        &t.app,
        "POST",
        "/api/auth/login",
        None,
        Some(json!({ "email": "ana", "password": PASSWORD })),
        &[("cf-connecting-ip", "10.73.1.1")],
    )
    .await;

    assert_eq!(status, StatusCode::OK, "{signed_in}");
    assert_eq!(signed_in["user"]["id"], json!(ana));
}

#[tokio::test]
async fn the_person_may_keep_the_name_and_the_address_the_account_waited_under() {
    let t = test_app();
    let ana = seed_waiting(&t.state, "ana", Some("ana@test.dev"));
    let invite = mint_invitation(&t, &ana).await;

    let (status, joined) = join(&t.app, &invite, "ana@test.dev", "ana").await;

    assert_eq!(status, StatusCode::OK, "{joined}");
    assert_eq!(joined["user"]["id"], json!(ana));
}

#[tokio::test]
async fn a_name_or_an_address_someone_else_holds_is_refused_and_keeps_the_invitation() {
    let t = test_app();
    let ana = seed_waiting(&t.state, "ana", None);
    let invite = mint_invitation(&t, &ana).await;

    let (taken_address, _) = join(&t.app, &invite, "owner@test.dev", "ana").await;
    let (taken_name, _) = join(&t.app, &invite, "ana@test.dev", "owner").await;
    let (status, joined) = join(&t.app, &invite, "ana@test.dev", "ana").await;

    assert_eq!(taken_address, StatusCode::CONFLICT);
    assert_eq!(taken_name, StatusCode::CONFLICT);
    assert_eq!(status, StatusCode::OK, "{joined}");
    assert_eq!(joined["user"]["id"], json!(ana));
}

#[tokio::test]
async fn a_new_invitation_voids_the_one_before_and_the_account_goes_on_waiting() {
    let t = test_app();
    let ana = seed_waiting(&t.state, "ana", None);
    let first = mint_invitation(&t, &ana).await;

    let second = mint_invitation(&t, &ana).await;

    let (voided, _) = join(&t.app, &first, "ana@test.dev", "ana").await;
    assert_eq!(voided, StatusCode::FORBIDDEN);
    let (_, check) = get(&t.app, &format!("/api/invites/{first}"), None).await;
    assert_eq!(check, json!({ "valid": false }));
    assert_eq!(member_row(&t, &ana).await["invitation"], json!("pending"));
    let (status, joined) = join(&t.app, &second, "ana@test.dev", "ana").await;
    assert_eq!(status, StatusCode::OK, "{joined}");
}

#[tokio::test]
async fn an_invitation_is_spent_once_and_a_lapsed_one_never() {
    let t = test_app();
    let (ana, bo) = (
        seed_waiting(&t.state, "ana", None),
        seed_waiting(&t.state, "bo", None),
    );
    let invite = mint_invitation(&t, &ana).await;
    let lapsed = db::AccountInvite {
        token: "lapsed",
        user_id: &bo,
        created_by: &t.user_id,
        expires_at: 1,
    };
    db::invite_waiting_account(&t.state.db, &lapsed).unwrap();
    join(&t.app, &invite, "ana@test.dev", "ana").await;

    let (again, _) = join(&t.app, &invite, "eve@test.dev", "eve").await;
    let (late, _) = join(&t.app, "lapsed", "bo@test.dev", "bo").await;

    assert_eq!(again, StatusCode::FORBIDDEN);
    assert_eq!(late, StatusCode::FORBIDDEN);
    assert_eq!(member_row(&t, &bo).await["invitation"], json!("expired"));
    let (_, members) = get(&t.app, "/api/admin/users", Some(&t.token)).await;
    assert_eq!(members["users"].as_array().unwrap().len(), 3);
}

#[tokio::test]
async fn the_member_list_tells_a_waiting_account_apart() {
    let t = test_app();
    let ana = seed_waiting(&t.state, "ana", None);

    let waiting = member_row(&t, &ana).await;
    let owner = member_row(&t, &t.user_id).await;

    assert_eq!(waiting["invitation"], json!("none"));
    assert_eq!(waiting["email"], Value::Null);
    assert_eq!(waiting["libraries"], json!([demo_library_ids().0]));
    assert_eq!(owner["invitation"], Value::Null);
    assert_eq!(owner["email"], json!("owner@test.dev"));
}

#[tokio::test]
async fn an_owner_cannot_hand_the_server_to_an_account_nobody_can_sign_in_to() {
    let t = test_app();
    let ana = seed_waiting(&t.state, "ana", None);
    let promote = format!("/api/admin/users/{ana}");
    let every_right = json!({ "permissions": Permission::all() });
    send(&t.app, "PATCH", &promote, Some(&t.token), Some(every_right)).await;

    let (status, _) = send(
        &t.app,
        "PATCH",
        &format!("/api/admin/users/{}", t.user_id),
        Some(&t.token),
        Some(json!({ "permissions": ["playback"] })),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    let demote = json!({ "permissions": ["playback"] });
    let (demoted, _) = send(&t.app, "PATCH", &promote, Some(&t.token), Some(demote)).await;
    assert_eq!(demoted, StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn a_backup_brings_a_waiting_account_back_waiting_with_its_invitation() {
    let source = test_app();
    let ana = seed_waiting(&source.state, "ana", None);
    let invite = mint_invitation(&source, &ana).await;
    let backup =
        crate::services::backup::export(&source.state.db, &source.state.config.data_dir, None)
            .unwrap();
    let target = test_app();

    let status = upload(
        &target.app,
        "/api/admin/backup/import",
        &target.token,
        backup,
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert!(db::account_waits(&target.state.db, &ana).unwrap());
    let (_, check) = get(&target.app, &format!("/api/invites/{invite}"), None).await;
    assert_eq!(check["username"], json!("ana"));
    let (status, joined) = join(&target.app, &invite, "ana@test.dev", "ana").await;
    assert_eq!(status, StatusCode::OK, "{joined}");
    assert_eq!(joined["user"]["id"], json!(ana));
}

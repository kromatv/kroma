//! Integration tests for an account's own provider identities
//! (`src/api/sso/identities.rs`): linking, claiming, listing and unlinking.

use axum::http::StatusCode;
use serde_json::{json, Value};

use crate::api::test_support::{at_provider, get, seed_session, send, ProviderRound};
use crate::db;
use crate::model::Permission;
use crate::services::settings::NewPeople;

fn lea() -> Value {
    json!({ "sub": "sub-lea", "preferred_username": "lea", "email": "lea@id.test" })
}

fn member(round: &ProviderRound, email: &str, username: &str) -> (String, String) {
    seed_session(&round.t.state, email, username, &[Permission::Playback])
}

async fn link(round: &ProviderRound, token: &str, claims: Value) -> Value {
    let (status, started) = round
        .begin("/api/auth/me/identities", Some(token), json!({ "provider": "p0" }))
        .await;
    assert_eq!(status, StatusCode::OK, "{started}");
    let returned = round.through(&started, claims).await;
    round.finish(&returned).await.1
}

async fn identities(round: &ProviderRound, token: &str) -> Value {
    get(&round.t.app, "/api/auth/me/identities", Some(token)).await.1
}

#[tokio::test]
async fn an_account_links_a_provider_and_then_signs_in_with_it() {
    let round = at_provider(|_| {});
    let (user_id, token) = member(&round, "lea@test.dev", "lea");

    let linked = link(&round, &token, lea()).await;
    let listed = identities(&round, &token).await;
    let signed_in = round.sign_in(lea()).await;

    assert_eq!(linked, json!({ "status": "linked" }));
    assert_eq!(listed[0]["provider"], json!("Home"));
    assert_eq!(listed[0]["name"], json!("lea@id.test"));
    assert_eq!(signed_in["status"], json!("signedIn"));
    assert_eq!(signed_in["user"]["id"], json!(user_id));
}

#[tokio::test]
async fn linking_needs_a_session() {
    let round = at_provider(|_| {});

    let (status, _) = round
        .begin("/api/auth/me/identities", None, json!({ "provider": "p0" }))
        .await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn an_identity_cannot_be_linked_to_a_second_account() {
    let round = at_provider(|_| {});
    let (_, first) = member(&round, "a@test.dev", "a");
    let (_, second) = member(&round, "b@test.dev", "b");
    link(&round, &first, lea()).await;

    let refused = link(&round, &second, lea()).await;

    assert_eq!(
        refused,
        json!({ "status": "refused", "reason": "linkedElsewhere" })
    );
    assert_eq!(identities(&round, &second).await, json!([]));
}

#[tokio::test]
async fn an_email_already_in_use_never_links_until_its_owner_claims_the_identity() {
    let round = at_provider(|p| p.new_people = NewPeople::Create);
    let (user_id, token) = member(&round, "lea@id.test", "lea");
    let (_, started) = round
        .begin("/api/auth/sso/start", None, json!({ "provider": "p0" }))
        .await;
    let returned = round.through(&started, lea()).await;

    let (_, waiting) = round.finish(&returned).await;
    assert_eq!(waiting, json!({ "status": "emailTaken" }));
    assert_eq!(identities(&round, &token).await, json!([]));

    let (claimed, _) = send(
        &round.t.app,
        "POST",
        "/api/auth/sso/claim",
        Some(&token),
        Some(returned.keys()),
    )
    .await;
    let signed_in = round.sign_in(lea()).await;

    assert_eq!(claimed, StatusCode::NO_CONTENT);
    assert_eq!(signed_in["user"]["id"], json!(user_id));
    assert_eq!(db::user_count(&round.t.state.db).unwrap(), 2);
}

#[tokio::test]
async fn a_claim_needs_a_session_and_a_flow_that_left_an_identity_waiting() {
    let round = at_provider(|p| p.new_people = NewPeople::Create);
    let (_, token) = member(&round, "someone@test.dev", "someone");
    let (_, started) = round
        .begin("/api/auth/sso/start", None, json!({ "provider": "p0" }))
        .await;
    let signed_in = round.through(&started, lea()).await;
    let claim = |token: Option<&'static str>, keys: Value| {
        let app = round.t.app.clone();
        async move { send(&app, "POST", "/api/auth/sso/claim", token, Some(keys)).await.0 }
    };
    let token: &'static str = Box::leak(token.into_boxed_str());

    assert_eq!(claim(None, signed_in.keys()).await, StatusCode::UNAUTHORIZED);
    assert_eq!(
        claim(Some(token), json!({ "flowId": "x", "secret": "y", "code": "z" })).await,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        claim(Some(token), signed_in.keys()).await,
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn a_claimed_join_request_leaves_the_admins_list() {
    let round = at_provider(|_| {});
    let (_, token) = member(&round, "lea@test.dev", "lea");
    let (_, started) = round
        .begin("/api/auth/sso/start", None, json!({ "provider": "p0" }))
        .await;
    let returned = round.through(&started, lea()).await;
    assert_eq!(round.finish(&returned).await.1, json!({ "status": "requested" }));

    send(
        &round.t.app,
        "POST",
        "/api/auth/sso/claim",
        Some(&token),
        Some(returned.keys()),
    )
    .await;

    let (_, requests) = get(&round.t.app, "/api/admin/join-requests", Some(&round.t.token)).await;
    assert_eq!(requests["waiting"], json!([]));
}

#[tokio::test]
async fn an_account_with_a_password_may_unlink_and_a_stranger_may_not() {
    let round = at_provider(|_| {});
    let (_, token) = member(&round, "lea@test.dev", "lea");
    let (_, stranger) = member(&round, "b@test.dev", "b");
    link(&round, &token, lea()).await;
    let id = identities(&round, &token).await[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let uri = format!("/api/auth/me/identities/{id}");

    let (theirs, _) = send(&round.t.app, "DELETE", &uri, Some(&stranger), None).await;
    let (own, _) = send(&round.t.app, "DELETE", &uri, Some(&token), None).await;

    assert_eq!(theirs, StatusCode::NOT_FOUND);
    assert_eq!(own, StatusCode::NO_CONTENT);
    assert_eq!(round.sign_in(lea()).await, json!({ "status": "requested" }));
}

#[tokio::test]
async fn an_account_cannot_remove_its_last_way_in() {
    let round = at_provider(|p| p.new_people = NewPeople::Create);
    let created = round.sign_in(lea()).await;
    let token = created["token"].as_str().unwrap();
    let user_id = created["user"]["id"].as_str().unwrap();
    let identity = identities(&round, token).await[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let identity_uri = format!("/api/auth/me/identities/{identity}");

    let (only_way, body) = send(&round.t.app, "DELETE", &identity_uri, Some(token), None).await;
    assert_eq!(only_way, StatusCode::CONFLICT);
    assert_eq!(body["code"], json!("sso.lastWayIn"));

    db::insert_passkey(&round.t.state.db, "pk1", user_id, "Phone", "{}").unwrap();
    let (with_passkey, _) = send(&round.t.app, "DELETE", &identity_uri, Some(token), None).await;
    let (last_passkey, body) = send(
        &round.t.app,
        "DELETE",
        "/api/auth/me/passkeys/pk1",
        Some(token),
        None,
    )
    .await;

    assert_eq!(with_passkey, StatusCode::NO_CONTENT);
    assert_eq!(last_passkey, StatusCode::CONFLICT);
    assert_eq!(body["code"], json!("sso.lastWayIn"));
}

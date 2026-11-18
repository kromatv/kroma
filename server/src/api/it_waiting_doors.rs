use axum::http::StatusCode;
use serde_json::{json, Value};

use crate::api::test_support::{
    at_provider, get, mint_invitation, put_to_wait, raw, seed_access_token, seed_session_pw,
    seed_waiting, send, test_app, TestApp, PASSWORD,
};
use crate::db;
use crate::model::Permission;
use crate::services::settings::NewPeople;

struct Held {
    id: String,
    session: String,
}

fn ana(t: &TestApp) -> Held {
    let (id, session) = seed_session_pw(
        &t.state,
        "ana@test.dev",
        "ana",
        PASSWORD,
        &[Permission::Playback],
    );
    Held { id, session }
}

async fn sign_in(t: &TestApp, identifier: &str, from: &str) -> (StatusCode, Value) {
    let (status, _, body) = raw(
        &t.app,
        "POST",
        "/api/auth/login",
        None,
        Some(json!({ "email": identifier, "password": PASSWORD })),
        &[("cf-connecting-ip", from)],
    )
    .await;
    (status, body)
}

async fn as_bearer(t: &TestApp, session: &str, method: &str, uri: &str, body: Value) -> StatusCode {
    send(&t.app, method, uri, Some(session), Some(body)).await.0
}

fn lea() -> Value {
    json!({
        "sub": "sub-lea",
        "preferred_username": "lea",
        "email": "lea@id.test",
        "name": "Léa",
        "groups": ["family"],
    })
}

#[tokio::test]
async fn a_password_opens_no_waiting_account_and_the_answer_is_the_one_a_stranger_gets() {
    let t = test_app();
    let ana = ana(&t);
    let (before, _) = sign_in(&t, "ana", "10.73.2.1").await;
    put_to_wait(&t.state, &ana.id);

    let by_name = sign_in(&t, "ana", "10.73.2.1").await;
    let by_address = sign_in(&t, "ana@test.dev", "10.73.2.1").await;
    let stranger = sign_in(&t, "nobody", "10.73.2.1").await;

    assert_eq!(before, StatusCode::OK);
    assert_eq!(stranger.0, StatusCode::UNAUTHORIZED);
    assert_eq!(by_name, stranger);
    assert_eq!(by_address, stranger);
}

#[tokio::test]
async fn an_account_made_to_wait_has_no_password_to_guess() {
    let t = test_app();
    seed_waiting(&t.state, "ana", Some("ana@test.dev"));
    let guess = |password: &'static str| {
        raw(
            &t.app,
            "POST",
            "/api/auth/login",
            None,
            Some(json!({ "email": "ana", "password": password })),
            &[("cf-connecting-ip", "10.73.2.2")],
        )
    };

    let (empty, _, _) = guess("").await;
    let (any, _, _) = guess(PASSWORD).await;

    assert_eq!(empty, StatusCode::UNAUTHORIZED);
    assert_eq!(any, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn a_session_a_waiting_account_holds_opens_nothing() {
    let t = test_app();
    let ana = ana(&t);
    let (before, _) = get(&t.app, "/api/auth/me", Some(&ana.session)).await;
    put_to_wait(&t.state, &ana.id);

    let (me, _) = get(&t.app, "/api/auth/me", Some(&ana.session)).await;
    let pin = as_bearer(
        &t,
        &ana.session,
        "POST",
        "/api/auth/pin/verify",
        json!({ "pin": "1234" }),
    )
    .await;
    let passkey = as_bearer(
        &t,
        &ana.session,
        "POST",
        "/api/auth/me/passkeys/register/start",
        json!({}),
    )
    .await;

    assert_eq!(before, StatusCode::OK);
    assert_eq!(me, StatusCode::UNAUTHORIZED);
    assert_eq!(pin, StatusCode::UNAUTHORIZED);
    assert_eq!(passkey, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn a_waiting_account_cannot_pair_a_television_by_code_or_by_handoff() {
    let t = test_app();
    let ana = ana(&t);
    put_to_wait(&t.state, &ana.id);
    let (_, shown) = send(&t.app, "POST", "/api/auth/quickconnect/initiate", None, None).await;
    let secret = shown["secret"].as_str().expect("a poll secret");

    let approve = as_bearer(
        &t,
        &ana.session,
        "POST",
        "/api/auth/quickconnect/authorize",
        json!({ "code": shown["code"] }),
    )
    .await;
    let grant = as_bearer(
        &t,
        &ana.session,
        "POST",
        "/api/handoff/grant",
        json!({ "handle": "any-television" }),
    )
    .await;

    assert_eq!(approve, StatusCode::UNAUTHORIZED);
    assert_eq!(grant, StatusCode::UNAUTHORIZED);
    let poll = format!("/api/auth/quickconnect/poll?secret={secret}");
    let (_, television) = get(&t.app, &poll, None).await;
    assert_eq!(television["status"], json!("pending"));
}

#[tokio::test]
async fn a_device_credential_of_a_waiting_account_is_not_exchanged_even_with_its_pin() {
    let t = test_app();
    let ana = ana(&t);
    let pin = crate::services::auth::hash_password("1234");
    db::set_user_pin(&t.state.db, &ana.id, Some(&pin)).unwrap();
    let locked = seed_access_token(&t.state, &ana.id, false);
    let unlocked = seed_access_token(&t.state, &ana.id, true);
    let exchange = |access: String| {
        send(
            &t.app,
            "POST",
            "/api/auth/token",
            None,
            Some(json!({ "accessToken": access, "pin": "1234" })),
        )
    };
    let (before, _) = exchange(locked.clone()).await;
    put_to_wait(&t.state, &ana.id);

    let (with_pin, refused) = exchange(locked).await;
    let (already_verified, _) = exchange(unlocked).await;

    assert_eq!(before, StatusCode::OK);
    assert_eq!(with_pin, StatusCode::UNAUTHORIZED);
    assert_eq!(refused["tokenInvalid"], json!(true));
    assert_eq!(already_verified, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn a_provider_identity_on_a_waiting_account_signs_nobody_in() {
    let round = at_provider(|p| p.new_people = NewPeople::Create);
    let first = round.sign_in(lea()).await;
    let account = first["user"]["id"].as_str().expect("an account").to_string();
    put_to_wait(&round.t.state, &account);

    let again = round.sign_in(lea()).await;

    assert_eq!(first["status"], json!("signedIn"));
    assert_eq!(again, json!({ "status": "emailTaken" }));
}

#[tokio::test]
async fn a_provider_gives_a_waiting_account_to_the_person_who_holds_its_invitation_only() {
    let round = at_provider(|p| p.new_people = NewPeople::Create);
    let account = seed_waiting(&round.t.state, "lea-from-plex", Some("lea@id.test"));
    let invite = mint_invitation(&round.t, &account).await;

    let uninvited = round.sign_in(lea()).await;
    let invited = round
        .sign_in_with(json!({ "provider": "p0", "invite": invite }), lea())
        .await;

    assert_eq!(uninvited, json!({ "status": "emailTaken" }));
    assert_eq!(invited["status"], json!("signedIn"));
    assert_eq!(invited["user"]["id"], json!(account));
    assert_eq!(invited["user"]["username"], json!("lea-from-plex"));
}

#[tokio::test]
async fn no_way_in_can_mint_a_token_for_a_waiting_account() {
    let t = test_app();
    let ana = seed_waiting(&t.state, "ana", None);
    let user = db::user_by_id(&t.state.db, &ana).unwrap().unwrap();

    let hints = db::DeviceHints::default();
    let minted = crate::api::accounts::auth_result(&t.state, user, hints).await;

    let refused = minted.err().map(|response| response.status());
    assert_eq!(refused, Some(StatusCode::INTERNAL_SERVER_ERROR));
    let devices = db::list_access_tokens(&t.state.db, &ana).unwrap();
    assert!(devices.is_empty());
}

#[tokio::test]
async fn the_profile_picker_never_offers_a_waiting_account() {
    let t = test_app();
    seed_waiting(&t.state, "ana", None);
    t.state.settings.set_patch(
        &t.state.db,
        [("publicUserList".to_string(), json!(true))]
            .into_iter()
            .collect(),
    );

    let (_, offered) = get(&t.app, "/api/users", None).await;

    let names: Vec<&str> = offered
        .as_array()
        .expect("the public list")
        .iter()
        .filter_map(|user| user["username"].as_str())
        .collect();
    assert_eq!(names, ["owner"]);
}

//! Integration tests for signing in through a provider (`src/api/sso/*`):
//! whole rounds through the router against a provider running in-process.

use axum::http::StatusCode;
use serde_json::{json, Value};

use crate::api::test_support::{
    at_provider, get, raw, seed_session, send, test_app_served_at, ProviderRound, ORIGIN,
};
use crate::db;
use crate::model::Permission;
use crate::services::settings::NewPeople;
use crate::services::sso::testing::Forgery;

fn lea() -> Value {
    json!({
        "sub": "sub-lea",
        "preferred_username": "lea",
        "email": "lea@id.test",
        "name": "Léa",
        "groups": ["family"],
    })
}

fn creates_accounts() -> ProviderRound {
    at_provider(|p| p.new_people = NewPeople::Create)
}

#[tokio::test]
async fn the_gate_offers_a_live_provider_and_never_its_connection() {
    let round = at_provider(|p| p.label = "Home".into());

    let (status, config) = get(&round.t.app, "/api/auth/config", None).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(config["signIn"]["password"], json!(true));
    assert_eq!(config["signIn"]["passkeys"], json!(true));
    assert_eq!(
        config["signIn"]["providers"],
        json!([{ "id": "p0", "label": "Home", "icon": "key" }])
    );
}

#[tokio::test]
async fn a_server_with_no_provider_offers_none() {
    let t = crate::api::test_support::test_app();

    let (_, config) = get(&t.app, "/api/auth/config", None).await;

    assert_eq!(config["signIn"]["providers"], json!([]));
}

#[tokio::test]
async fn a_new_person_gets_an_account_and_a_session_that_works() {
    let round = creates_accounts();

    let result = round.sign_in(lea()).await;

    assert_eq!(result["status"], json!("signedIn"));
    assert_eq!(result["user"]["username"], json!("lea"));
    assert_eq!(result["user"]["email"], json!("lea@id.test"));
    assert!(result["accessToken"].is_string());
    assert!(result["mediaTicket"].is_string());
    let token = result["token"].as_str().unwrap();
    let (status, me) = get(&round.t.app, "/api/auth/me", Some(token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(me["user"]["username"], json!("lea"));
}

#[tokio::test]
async fn signing_in_again_reaches_the_same_account() {
    let round = creates_accounts();

    let first = round.sign_in(lea()).await;
    let second = round.sign_in(lea()).await;

    assert_eq!(first["user"]["id"], second["user"]["id"]);
    assert_ne!(first["token"], second["token"]);
}

#[tokio::test]
async fn a_stranger_waits_for_an_admin_and_gets_in_once_approved() {
    let round = at_provider(|_| {});
    let films = crate::api::test_support::seed_library(&round.t.state, "Films");

    let asked = round.sign_in(lea()).await;
    assert_eq!(asked, json!({ "status": "requested" }));
    assert_eq!(db::user_count(&round.t.state.db).unwrap(), 1);

    let (_, requests) = get(&round.t.app, "/api/admin/join-requests", Some(&round.t.token)).await;
    assert_eq!(requests["waiting"][0]["email"], json!("lea@id.test"));
    assert_eq!(requests["waiting"][0]["provider"], json!("Home"));
    let id = requests["waiting"][0]["id"].as_str().unwrap();
    let (status, approved) = send(
        &round.t.app,
        "POST",
        &format!("/api/admin/join-requests/{id}/approve"),
        Some(&round.t.token),
        Some(json!({ "permissions": ["playback", "requests.create"], "libraries": [films] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{approved}");

    let admitted = round.sign_in(lea()).await;

    assert_eq!(admitted["status"], json!("signedIn"));
    assert_eq!(admitted["user"]["id"], approved["user"]["id"]);
    assert_eq!(admitted["user"]["libraries"], json!([films]));
    assert_eq!(
        admitted["user"]["permissions"],
        json!(["playback", "requests.create"])
    );
}

#[tokio::test]
async fn a_declined_stranger_is_refused_until_the_request_is_removed() {
    let round = at_provider(|_| {});
    round.sign_in(lea()).await;
    let (_, requests) = get(&round.t.app, "/api/admin/join-requests", Some(&round.t.token)).await;
    let id = requests["waiting"][0]["id"].as_str().unwrap().to_string();

    let (status, _) = send(
        &round.t.app,
        "POST",
        &format!("/api/admin/join-requests/{id}/decline"),
        Some(&round.t.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(
        round.sign_in(lea()).await,
        json!({ "status": "refused", "reason": "blocked" })
    );
    let (_, requests) = get(&round.t.app, "/api/admin/join-requests", Some(&round.t.token)).await;
    assert_eq!(requests["waiting"], json!([]));
    assert_eq!(requests["declined"][0]["id"], json!(id));

    let (status, _) = send(
        &round.t.app,
        "DELETE",
        &format!("/api/admin/join-requests/{id}"),
        Some(&round.t.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(round.sign_in(lea()).await, json!({ "status": "requested" }));
}

#[tokio::test]
async fn join_requests_are_for_whoever_manages_users() {
    let round = at_provider(|_| {});
    let (_, member) = seed_session(&round.t.state, "m@test.dev", "m", &[Permission::Playback]);

    for (method, uri) in [
        ("GET", "/api/admin/join-requests"),
        ("POST", "/api/admin/join-requests/x/approve"),
        ("POST", "/api/admin/join-requests/x/decline"),
        ("DELETE", "/api/admin/join-requests/x"),
    ] {
        let body = (method == "POST").then(|| json!({}));
        let (status, _) = send(&round.t.app, method, uri, Some(&member), body).await;
        assert_eq!(status, StatusCode::FORBIDDEN, "{method} {uri}");
    }
    let (status, _) = send(
        &round.t.app,
        "POST",
        "/api/admin/join-requests/made-up/decline",
        Some(&round.t.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn an_invitation_accepted_with_the_provider_creates_the_account() {
    let round = at_provider(|p| p.new_people = NewPeople::Invite);
    let (_, invite) = send(
        &round.t.app,
        "POST",
        "/api/invites",
        Some(&round.t.token),
        Some(json!({ "permissions": ["playback", "requests.create"] })),
    )
    .await;

    let uninvited = round.sign_in(lea()).await;
    let invited = round
        .sign_in_with(json!({ "provider": "p0", "invite": invite["token"] }), lea())
        .await;

    assert_eq!(uninvited, json!({ "status": "invitationOnly" }));
    assert_eq!(invited["status"], json!("signedIn"));
    assert_eq!(
        invited["user"]["permissions"],
        json!(["playback", "requests.create"])
    );
}

#[tokio::test]
async fn a_person_outside_the_required_group_is_refused() {
    let round = at_provider(|p| {
        p.new_people = NewPeople::Create;
        p.required_groups = vec!["admins".into()];
    });

    let result = round.sign_in(lea()).await;

    assert_eq!(result, json!({ "status": "refused", "reason": "group" }));
    assert_eq!(db::user_count(&round.t.state.db).unwrap(), 1);
}

#[tokio::test]
async fn an_outcome_needs_the_secret_and_the_code_and_is_given_once() {
    let round = creates_accounts();
    let (_, started) = round
        .begin("/api/auth/sso/start", None, json!({ "provider": "p0" }))
        .await;
    let returned = round.through(&started, lea()).await;
    let finish = |keys: Value| async {
        send(&round.t.app, "POST", "/api/auth/sso/finish", None, Some(keys)).await
    };

    let mut without_code = returned.keys();
    without_code["code"] = json!("guessed");
    let mut without_secret = returned.keys();
    without_secret["secret"] = json!("guessed");

    assert_eq!(finish(without_code).await.0, StatusCode::NOT_FOUND);
    assert_eq!(finish(without_secret).await.0, StatusCode::NOT_FOUND);
    assert_eq!(finish(returned.keys()).await.1["status"], json!("signedIn"));
    assert_eq!(finish(returned.keys()).await.0, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn a_flow_still_at_the_provider_is_pending() {
    let round = creates_accounts();
    let (_, started) = round
        .begin("/api/auth/sso/start", None, json!({ "provider": "p0" }))
        .await;

    let (status, body) = send(
        &round.t.app,
        "POST",
        "/api/auth/sso/finish",
        None,
        Some(json!({ "flowId": started["flowId"], "secret": started["secret"] })),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!({ "status": "pending" }));
}

#[tokio::test]
async fn a_callback_nobody_started_or_played_twice_is_refused() {
    let round = creates_accounts();
    let (_, started) = round
        .begin("/api/auth/sso/start", None, json!({ "provider": "p0" }))
        .await;
    let redirect = round
        .idp
        .approve(started["authorizeUrl"].as_str().unwrap(), lea());

    let (made_up, _) = round
        .follow(&format!("{ORIGIN}/api/auth/sso/callback?code=x&state=made-up"))
        .await;
    let (first, _) = round.follow(&redirect).await;
    let (replayed, _) = round.follow(&redirect).await;
    let (no_state, _) = round
        .follow(&format!("{ORIGIN}/api/auth/sso/callback?code=x"))
        .await;

    assert_eq!(made_up, StatusCode::BAD_REQUEST);
    assert_eq!(first, StatusCode::SEE_OTHER);
    assert_eq!(replayed, StatusCode::BAD_REQUEST);
    assert_eq!(no_state, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn a_forged_token_signs_nobody_in_and_says_where_it_broke() {
    let round = creates_accounts();
    round.idp.forge(Forgery::WrongAudience);

    let result = round.sign_in(lea()).await;

    assert_eq!(
        result,
        json!({ "status": "failed", "reason": "token.audience" })
    );
    assert_eq!(db::user_count(&round.t.state.db).unwrap(), 1);
}

#[tokio::test]
async fn a_person_who_says_no_at_the_provider_comes_back_with_its_word() {
    let round = creates_accounts();
    let (_, started) = round
        .begin("/api/auth/sso/start", None, json!({ "provider": "p0" }))
        .await;
    let redirect = round.idp.deny(started["authorizeUrl"].as_str().unwrap());

    let (status, location) = round.follow(&redirect).await;
    let code = location.split("code=").nth(1).unwrap();
    let (_, body) = send(
        &round.t.app,
        "POST",
        "/api/auth/sso/finish",
        None,
        Some(json!({ "flowId": started["flowId"], "secret": started["secret"], "code": code })),
    )
    .await;

    assert_eq!(status, StatusCode::SEE_OTHER);
    assert_eq!(
        body,
        json!({ "status": "failed", "reason": "provider.access_denied" })
    );
}

#[tokio::test]
async fn a_flow_begins_only_from_an_origin_and_only_at_a_live_provider() {
    let round = creates_accounts();
    let start = json!({ "provider": "p0" });

    let (no_origin, _) = send(
        &round.t.app,
        "POST",
        "/api/auth/sso/start",
        None,
        Some(start.clone()),
    )
    .await;
    let (with_path, _, _) = raw(
        &round.t.app,
        "POST",
        "/api/auth/sso/start",
        None,
        Some(start),
        &[("origin", "http://kroma.test/somewhere")],
    )
    .await;
    let (unknown, body) = round
        .begin("/api/auth/sso/start", None, json!({ "provider": "nope" }))
        .await;

    assert_eq!(no_origin, StatusCode::BAD_REQUEST);
    assert_eq!(with_path, StatusCode::BAD_REQUEST);
    assert_eq!(unknown, StatusCode::NOT_FOUND);
    assert_eq!(body["code"], json!("sso.providerUnknown"));
}

#[tokio::test]
async fn a_server_with_a_public_address_begins_flows_from_that_origin_alone() {
    let t = test_app_served_at(Some("https://kroma.example"), None);
    let start = |origin: &'static str| {
        let app = t.app.clone();
        async move {
            raw(
                &app,
                "POST",
                "/api/auth/sso/start",
                None,
                Some(json!({ "provider": "p0" })),
                &[("origin", origin)],
            )
            .await
        }
    };

    let (elsewhere, _, refused) = start("https://evil.example").await;
    let (own, _, _) = start("https://kroma.example").await;

    assert_eq!(elsewhere, StatusCode::BAD_REQUEST);
    assert_eq!(refused["code"], json!("sso.originInvalid"));
    assert_eq!(own, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn the_provider_is_asked_to_come_back_to_this_servers_callback() {
    let round = creates_accounts();

    let (_, started) = round
        .begin("/api/auth/sso/start", None, json!({ "provider": "p0" }))
        .await;

    let url = started["authorizeUrl"].as_str().unwrap();
    assert!(url.starts_with(&format!("{}/authorize?", round.idp.issuer)));
    assert!(url.contains("redirect_uri=http%3A%2F%2Fkroma.test%2Fapi%2Fauth%2Fsso%2Fcallback"));
    assert!(url.contains("code_challenge_method=S256"));
    assert_eq!(started["expiresInSec"], json!(600));
}

#[tokio::test]
async fn a_new_join_request_is_told_once_to_whoever_manages_users() {
    let round = at_provider(|_| {});
    let (_, member) = seed_session(&round.t.state, "m@test.dev", "m", &[Permission::Playback]);

    round.sign_in(lea()).await;
    round.sign_in(lea()).await;

    let (_, owner_inbox) = get(&round.t.app, "/api/notifications", Some(&round.t.token)).await;
    assert_eq!(owner_inbox["unread"], json!(1));
    let told = &owner_inbox["notifications"][0];
    assert_eq!(told["event"], json!("system.join.requested"));
    assert_eq!(told["link"], json!("/admin/users"));
    assert!(told["body"].as_str().unwrap().contains("Léa"), "{told}");
    assert!(told["body"].as_str().unwrap().contains("Home"), "{told}");
    let (_, member_inbox) = get(&round.t.app, "/api/notifications", Some(&member)).await;
    assert_eq!(member_inbox["unread"], json!(0));
}

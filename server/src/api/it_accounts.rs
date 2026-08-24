//! Integration tests for the self-service account surface (`src/api/accounts.rs`):
//! password change, logout / session revoke, playback-language preferences,
//! uniqueness checks, and the DB-only slice of Quick Connect. Every branch here
//! is reachable without an image encoder, WebAuthn, a second device, or the
//! network. The profile-PIN handlers are covered in `it_pin`.

use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{
    get, raw, seed_access_token, seed_session, seed_session_pw, send, test_app,
};
use crate::model::Permission;

// Gives each call its own source IP so the process-wide brute-force guard
// can't leak lockouts between parallel tests.
async fn login(t: &crate::api::test_support::TestApp, ip: &str, id: &str, pw: &str) -> (StatusCode, serde_json::Value) {
    let (status, _h, body) = raw(
        &t.app,
        "POST",
        "/api/auth/login",
        None,
        Some(json!({ "email": id, "password": pw })),
        &[("cf-connecting-ip", ip)],
    )
    .await;
    (status, body)
}

#[tokio::test]
async fn login_succeeds_by_email_or_username() {
    let t = test_app();
    seed_session_pw(&t.state, "gwen@test.dev", "gwen", "hunter2", &[Permission::Playback]);

    // By email: a fresh device token pair + the account back.
    let (status, body) = login(&t, "10.0.0.1", "gwen@test.dev", "hunter2").await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["token"].is_string() && body["accessToken"].is_string());
    assert_eq!(body["user"]["username"], json!("gwen"));

    // The profile picker only knows the username, so login accepts it too.
    let (status, body) = login(&t, "10.0.0.2", "gwen", "hunter2").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["user"]["email"], json!("gwen@test.dev"));
}

#[tokio::test]
async fn login_rejects_a_wrong_password_and_an_unknown_account() {
    let t = test_app();
    seed_session_pw(&t.state, "peter@test.dev", "peter", "correct", &[Permission::Playback]);

    // Wrong password -> 401 (same shape as an unknown account).
    let (status, _) = login(&t, "10.0.1.1", "peter@test.dev", "nope").await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // Unknown identifier -> 401, indistinguishable from a bad password.
    let (status, _) = login(&t, "10.0.1.2", "ghost@test.dev", "whatever").await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn login_locks_out_a_source_after_five_failures() {
    let t = test_app();
    seed_session_pw(&t.state, "miles@test.dev", "miles", "correct", &[Permission::Playback]);
    let ip = "10.0.2.99";

    // Four wrong tries are plain 401s.
    for _ in 0..4 {
        let (status, _) = login(&t, ip, "miles@test.dev", "wrong").await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }
    // The fifth trips the escalating cooldown -> 429 with a retryAfter.
    let (status, body) = login(&t, ip, "miles@test.dev", "wrong").await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
    assert!(body["retryAfter"].as_i64().unwrap_or(0) > 0);

    // While locked, even the correct password is refused up front with 429.
    let (status, _) = login(&t, ip, "miles@test.dev", "correct").await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn exchange_token_rejects_blank_and_unknown_tokens() {
    let t = test_app();

    // An empty access token is invalid before any lookup.
    let (status, body) =
        send(&t.app, "POST", "/api/auth/token", None, Some(json!({ "accessToken": "  " }))).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["tokenInvalid"], json!(true));

    // An unknown token reads the same (tokenInvalid -> re-login with a password).
    let (status, body) =
        send(&t.app, "POST", "/api/auth/token", None, Some(json!({ "accessToken": "nope" }))).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["tokenInvalid"], json!(true));
}

#[tokio::test]
async fn exchange_token_mints_a_session_for_a_pinless_account() {
    let t = test_app();
    let (uid, _) = seed_session(&t.state, "swap@test.dev", "swap", &[Permission::Playback]);
    // No PIN on the account -> the gate is skipped and a fresh session is minted.
    let access = seed_access_token(&t.state, &uid, false);
    let (status, body) =
        send(&t.app, "POST", "/api/auth/token", None, Some(json!({ "accessToken": access }))).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["token"].is_string());
    assert_eq!(body["user"]["id"], json!(uid));
}

#[tokio::test]
async fn exchange_token_enforces_the_pin_gate() {
    let t = test_app();
    let (uid, token) = seed_session_pw(&t.state, "locked@test.dev", "locked", "pw", &[Permission::Playback]);
    let (status, _) =
        send(&t.app, "PATCH", "/api/auth/me/pin", Some(&token), Some(json!({ "pin": "1234" }))).await;
    assert_eq!(status, StatusCode::OK);
    let access = seed_access_token(&t.state, &uid, false);

    // No PIN supplied -> asks for it WITHOUT counting a brute-force failure.
    let (status, body) =
        send(&t.app, "POST", "/api/auth/token", None, Some(json!({ "accessToken": access }))).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["pinRequired"], json!(true));

    // A wrong PIN is a penalised 401.
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/auth/token",
        None,
        Some(json!({ "accessToken": access, "pin": "0000" })),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // The correct PIN clears the gate and mints the session.
    let (status, body) = send(
        &t.app,
        "POST",
        "/api/auth/token",
        None,
        Some(json!({ "accessToken": access, "pin": "1234" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["user"]["id"], json!(uid));

    // Now the token is marked verified: a silent refresh (no PIN) succeeds.
    let (status, _) =
        send(&t.app, "POST", "/api/auth/token", None, Some(json!({ "accessToken": access }))).await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn relock_clears_the_pin_verified_flag() {
    let t = test_app();
    let (uid, token) = seed_session_pw(&t.state, "relock@test.dev", "relock", "pw", &[Permission::Playback]);
    send(&t.app, "PATCH", "/api/auth/me/pin", Some(&token), Some(json!({ "pin": "1234" }))).await;
    // A pre-verified device token would normally silent-refresh without a PIN.
    let access = seed_access_token(&t.state, &uid, true);

    // Relocking flips the token back to needing the PIN (unauthenticated by design).
    let (status, _) =
        send(&t.app, "POST", "/api/auth/relock", None, Some(json!({ "accessToken": access }))).await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (status, body) =
        send(&t.app, "POST", "/api/auth/token", None, Some(json!({ "accessToken": access }))).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["pinRequired"], json!(true));

    // An empty access token is a no-op 204.
    let (status, _) =
        send(&t.app, "POST", "/api/auth/relock", None, Some(json!({ "accessToken": "" }))).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn change_password_succeeds_with_the_correct_current() {
    let t = test_app();
    let (_uid, token) =
        seed_session_pw(&t.state, "pw-ok@test.dev", "pwok", "hunter2", &[Permission::Playback]);
    let (status, _) = send(
        &t.app,
        "PATCH",
        "/api/auth/me/password",
        Some(&token),
        Some(json!({ "current": "hunter2", "next": "hunter3!" })),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    // The rotation took: the old password no longer verifies, the new one does.
    let (status, _) = send(
        &t.app,
        "PATCH",
        "/api/auth/me/password",
        Some(&token),
        Some(json!({ "current": "hunter2", "next": "again123" })),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "old password should be dead");
}

#[tokio::test]
async fn change_password_rejects_a_wrong_current() {
    let t = test_app();
    let (_uid, token) =
        seed_session_pw(&t.state, "pw-bad@test.dev", "pwbad", "correct", &[Permission::Playback]);
    let (status, _) = send(
        &t.app,
        "PATCH",
        "/api/auth/me/password",
        Some(&token),
        Some(json!({ "current": "nope", "next": "whatever" })),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn change_password_rejects_a_too_short_new_password() {
    let t = test_app();
    let (_uid, token) =
        seed_session_pw(&t.state, "pw-short@test.dev", "pwshort", "correct", &[Permission::Playback]);
    let (status, _) = send(
        &t.app,
        "PATCH",
        "/api/auth/me/password",
        Some(&token),
        Some(json!({ "current": "correct", "next": "no" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn logout_also_revokes_the_supplied_access_token() {
    let t = test_app();
    let (uid, token) = seed_session(&t.state, "signout@test.dev", "signout", &[Permission::Playback]);
    let access = seed_access_token(&t.state, &uid, true);

    // A full sign-out passes the device access token so it can't be re-exchanged.
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/auth/logout",
        Some(&token),
        Some(json!({ "accessToken": access })),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (status, _) =
        send(&t.app, "POST", "/api/auth/token", None, Some(json!({ "accessToken": access }))).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn logout_revokes_the_current_session() {
    let t = test_app();
    let (_uid, token) = seed_session(&t.state, "bye@test.dev", "bye", &[Permission::Playback]);
    let (status, _) = get(&t.app, "/api/auth/me", Some(&token)).await;
    assert_eq!(status, StatusCode::OK);

    let (status, _) = send(&t.app, "POST", "/api/auth/logout", Some(&token), None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    // The bearer's session was deleted -> the next authed read is 401.
    let (status, _) = get(&t.app, "/api/auth/me", Some(&token)).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn revoke_session_by_id_then_404_on_unknown() {
    let t = test_app();

    // A bogus device id is not one of the caller's devices -> 404 (session live).
    let (status, _) =
        send(&t.app, "DELETE", "/api/auth/me/sessions/ghost-device", Some(&t.token), None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // The real device id from the session list revokes cleanly.
    let (_, sessions) = get(&t.app, "/api/auth/me/sessions", Some(&t.token)).await;
    let id = sessions[0]["id"].as_str().expect("device id").to_string();
    let (status, _) =
        send(&t.app, "DELETE", &format!("/api/auth/me/sessions/{id}"), Some(&t.token), None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn ui_language_sets_then_clears() {
    let t = test_app();
    let (_uid, token) = seed_session(&t.state, "lang@test.dev", "lang", &[Permission::Playback]);

    let (status, body) =
        send(&t.app, "PATCH", "/api/auth/me", Some(&token), Some(json!({ "language": "fr" }))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["user"]["language"], json!("fr"));

    // An explicit null clears it (the field is omitted, not null, once unset).
    let (status, body) =
        send(&t.app, "PATCH", "/api/auth/me", Some(&token), Some(json!({ "language": null }))).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["user"].get("language").is_none(), "cleared language should be absent");

    // An unknown/garbage tag is treated as a clear (normalize returns None).
    let (_, _) =
        send(&t.app, "PATCH", "/api/auth/me", Some(&token), Some(json!({ "language": "fr" }))).await;
    let (status, body) =
        send(&t.app, "PATCH", "/api/auth/me", Some(&token), Some(json!({ "language": "zz-XX" }))).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["user"].get("language").is_none(), "unknown tag falls back to none");
}

#[tokio::test]
async fn audio_and_subtitle_languages_round_trip() {
    let t = test_app();
    let (_uid, token) = seed_session(&t.state, "media-lang@test.dev", "medialang", &[Permission::Playback]);

    let (status, body) = send(
        &t.app,
        "PATCH",
        "/api/auth/me",
        Some(&token),
        Some(json!({ "audioLanguage": "JA", "subtitleLanguage": "off" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    // Free-form ISO codes are lower-cased; "off" is the keep-subs-off sentinel.
    assert_eq!(body["user"]["audioLanguage"], json!("ja"));
    assert_eq!(body["user"]["subtitleLanguage"], json!("off"));

    // An empty string clears a media-language preference.
    let (status, body) = send(
        &t.app,
        "PATCH",
        "/api/auth/me",
        Some(&token),
        Some(json!({ "audioLanguage": "" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["user"].get("audioLanguage").is_none(), "empty audio lang clears it");
    // The untouched subtitle preference persists.
    assert_eq!(body["user"]["subtitleLanguage"], json!("off"));
}

#[tokio::test]
async fn patch_me_rejects_a_taken_username_and_email() {
    let t = test_app();
    seed_session(&t.state, "occupied@test.dev", "occupied", &[Permission::Playback]);
    let (_uid, token) = seed_session(&t.state, "mover@test.dev", "mover", &[Permission::Playback]);

    // Colliding with another account's username -> 409.
    let (status, _) =
        send(&t.app, "PATCH", "/api/auth/me", Some(&token), Some(json!({ "username": "occupied" }))).await;
    assert_eq!(status, StatusCode::CONFLICT);

    // Colliding with another account's email -> 409.
    let (status, _) =
        send(&t.app, "PATCH", "/api/auth/me", Some(&token), Some(json!({ "email": "occupied@test.dev" }))).await;
    assert_eq!(status, StatusCode::CONFLICT);

    // A malformed email is a 400 before any uniqueness lookup.
    let (status, _) =
        send(&t.app, "PATCH", "/api/auth/me", Some(&token), Some(json!({ "email": "not-an-email" }))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // Keeping one's own email is a no-op success (not a self-collision).
    let (status, _) =
        send(&t.app, "PATCH", "/api/auth/me", Some(&token), Some(json!({ "email": "mover@test.dev" }))).await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn patch_me_changes_username_and_email_to_fresh_values() {
    let t = test_app();
    let (_uid, token) = seed_session(&t.state, "old@test.dev", "oldname", &[Permission::Playback]);

    // A free username + a valid, unused email both persist (lower-cased email).
    let (status, body) = send(
        &t.app,
        "PATCH",
        "/api/auth/me",
        Some(&token),
        Some(json!({ "username": "NewName", "email": "NEW@Test.dev" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["user"]["username"], json!("NewName"));
    assert_eq!(body["user"]["email"], json!("new@test.dev"));

    // The change is durable across a fresh read.
    let (_, me) = get(&t.app, "/api/auth/me", Some(&token)).await;
    assert_eq!(me["user"]["email"], json!("new@test.dev"));
}

#[tokio::test]
async fn quick_connect_initiate_then_poll_states() {
    let t = test_app();

    let (status, init) = send(&t.app, "POST", "/api/auth/quickconnect/initiate", None, None).await;
    assert_eq!(status, StatusCode::OK);
    let secret = init["secret"].as_str().expect("secret").to_string();
    assert!(!init["code"].as_str().unwrap_or_default().is_empty());
    // No web_url in the test config and no remoteUrl setting -> no authorize URL.
    assert!(init["authorizeUrl"].is_null());

    // The freshly-issued code has not been approved yet.
    let (status, poll) =
        get(&t.app, &format!("/api/auth/quickconnect/poll?secret={secret}"), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(poll["status"], json!("pending"));

    // An unknown secret reads as expired (the device should restart the flow).
    let (status, poll) =
        get(&t.app, "/api/auth/quickconnect/poll?secret=nope", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(poll["status"], json!("expired"));
}

#[tokio::test]
async fn the_poll_secret_can_travel_in_a_header_instead_of_the_url() {
    // A URL is written into every access log the request passes through, so
    // newer devices send the secret as a header and no query at all. A required
    // query field would reject them before the handler ever looked.
    let t = test_app();
    let (_, init) = send(&t.app, "POST", "/api/auth/quickconnect/initiate", None, None).await;
    let secret = init["secret"].as_str().expect("a poll secret");

    let (status, _headers, body) = raw(
        &t.app,
        "GET",
        "/api/auth/quickconnect/poll",
        None,
        None,
        &[("x-kroma-pairing-secret", secret)],
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], "pending");
}

#[tokio::test]
async fn a_poll_with_neither_header_nor_query_is_simply_unknown() {
    let t = test_app();
    let (status, body) = get(&t.app, "/api/auth/quickconnect/poll", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], "expired");
}

// Nobody authenticates to initiate, so the pending codes are bounded, and the
// bound REFUSES rather than evicting: evicting would let whoever asks most often
// decide whose code silently stops working. A device that is refused says so and
// the person tries again, which is the better failure by a distance.
#[tokio::test]
async fn quick_connect_refuses_a_new_code_rather_than_evicting_a_waiting_one() {
    let t = test_app();

    let mut issued = 0;
    let refused = loop {
        let (status, body) =
            send(&t.app, "POST", "/api/auth/quickconnect/initiate", None, None).await;
        if status != StatusCode::OK {
            break (status, body);
        }
        issued += 1;
        // Counted rather than compared against the constant, so the ceiling can
        // move without this test lying about what it proved.
        assert!(issued < 1000, "the pending codes never filled up");
    };

    assert!(issued > 0, "not one code was issued");
    assert_eq!(refused.0, StatusCode::TOO_MANY_REQUESTS);

    // The first code issued is still pending: it was not the one given up.
    let (status, _) = send(&t.app, "POST", "/api/auth/quickconnect/initiate", None, None).await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS, "asking again does not free a slot");
}

#[tokio::test]
async fn quick_connect_initiate_falls_back_to_the_public_url_setting() {
    let t = test_app();
    // Without KROMA_WEB_URL, the admin "Remote access" public URL feeds the QR
    // (trailing slash trimmed) so a tunnel install still gets a scannable link.
    t.state.settings.set_patch(
        &t.state.db,
        [("remoteUrl".to_string(), json!("https://kroma.example.com/"))].into_iter().collect(),
    );

    let (status, init) = send(&t.app, "POST", "/api/auth/quickconnect/initiate", None, None).await;
    assert_eq!(status, StatusCode::OK);
    let code = init["code"].as_str().expect("code");
    assert_eq!(
        init["authorizeUrl"],
        json!(format!("https://kroma.example.com/connect?code={code}"))
    );
}

#[tokio::test]
async fn quick_connect_authorize_then_poll_hands_the_device_a_session() {
    let t = test_app();

    let (_, init) = send(&t.app, "POST", "/api/auth/quickconnect/initiate", None, None).await;
    let code = init["code"].as_str().expect("code").to_string();
    let secret = init["secret"].as_str().expect("secret").to_string();

    // The signed-in owner approves the shown code -> 204.
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/auth/quickconnect/authorize",
        Some(&t.token),
        Some(json!({ "code": code })),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    // The device's next poll now returns the minted session + account.
    let (status, poll) =
        get(&t.app, &format!("/api/auth/quickconnect/poll?secret={secret}"), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(poll["status"], json!("authorized"));
    assert!(poll["token"].is_string() && poll["accessToken"].is_string());
    assert_eq!(poll["user"]["id"], json!(t.user_id));
}

#[tokio::test]
async fn quick_connect_rotating_revokes_the_previous_code() {
    let t = test_app();

    let (_, first) = send(&t.app, "POST", "/api/auth/quickconnect/initiate", None, None).await;
    let old_secret = first["secret"].as_str().expect("secret").to_string();

    // Before rotating, the old secret still polls as pending.
    let (_, poll) =
        get(&t.app, &format!("/api/auth/quickconnect/poll?secret={old_secret}"), None).await;
    assert_eq!(poll["status"], json!("pending"));

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/auth/quickconnect/initiate",
        None,
        Some(json!({ "prevSecret": old_secret })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // The old code is revoked up front: its secret now reads as expired.
    let (_, poll) =
        get(&t.app, &format!("/api/auth/quickconnect/poll?secret={old_secret}"), None).await;
    assert_eq!(poll["status"], json!("expired"));
}

#[tokio::test]
async fn quick_connect_rotating_cleans_up_an_approved_but_uncollected_code() {
    let t = test_app();

    // Device initiates and the owner approves the code, but the device rotates
    // before it polls -> the minted session is orphaned unless rotation cleans up.
    let (_, first) = send(&t.app, "POST", "/api/auth/quickconnect/initiate", None, None).await;
    let old_code = first["code"].as_str().expect("code").to_string();
    let old_secret = first["secret"].as_str().expect("secret").to_string();

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/auth/quickconnect/authorize",
        Some(&t.token),
        Some(json!({ "code": old_code })),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    // Rotate, passing the old secret -> the approved-but-uncollected entry is
    // revoked and its tokens deleted.
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/auth/quickconnect/initiate",
        None,
        Some(json!({ "prevSecret": old_secret })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // The old secret no longer hands out the session it was approved for.
    let (_, poll) =
        get(&t.app, &format!("/api/auth/quickconnect/poll?secret={old_secret}"), None).await;
    assert_eq!(poll["status"], json!("expired"));
}

#[tokio::test]
async fn quick_connect_authorize_rejects_an_unknown_code_and_requires_auth() {
    let t = test_app();

    // An unknown / expired code is a clean 404 (and leaves no dangling tokens).
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/auth/quickconnect/authorize",
        Some(&t.token),
        Some(json!({ "code": "ZZZZZZ" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // Approving requires a signed-in caller (the approver vouches for the device).
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/auth/quickconnect/authorize",
        None,
        Some(json!({ "code": "ABCDEF" })),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn an_empty_avatar_upload_is_refused_before_any_decoding() {
    // The handler takes raw image bytes, so an empty body is the shape a client
    // sends when its file picker was cancelled. Naming it beats handing an empty
    // buffer to the encoder and reporting "unreadable image".
    let t = test_app();
    let (_uid, token) = seed_session(&t.state, "ana@test.dev", "ana", &[Permission::Playback]);

    let (status, body) = send(&t.app, "POST", "/api/users/avatar", Some(&token), None).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    // The message is rendered in the caller's locale (the harness defaults to
    // French), so this pins that a reason was returned, not its wording.
    assert!(body["error"].as_str().is_some_and(|m| !m.is_empty()), "{body}");
}

#[tokio::test]
async fn an_avatar_upload_needs_a_signed_in_account() {
    // The avatar is written against the caller's own id; there is no id without
    // a session.
    let t = test_app();
    let (status, _) = send(&t.app, "POST", "/api/users/avatar", None, None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn an_oversized_avatar_is_rejected_by_the_body_limit() {
    // The layer answers before the handler, which is the point: the whole body
    // would otherwise be buffered in memory first.
    let t = test_app();
    let (_uid, token) = seed_session(&t.state, "ana@test.dev", "ana", &[Permission::Playback]);

    let oversized = vec![b'x'; crate::api::accounts::MAX_AVATAR_BYTES + 1];
    let (status, _h, _b) = raw_bytes(&t.app, "/api/users/avatar", &token, oversized).await;
    assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
}

#[tokio::test]
async fn an_avatar_the_encoder_cannot_read_is_refused_as_unsupported_media() {
    // Past the length checks and into the encoder, which is the only path that
    // reaches the store. The bytes are not an image, so the answer is the same
    // whether or not the machine running this has cwebp: nothing was stored.
    let t = test_app();
    let (_uid, token) = seed_session(&t.state, "ana@test.dev", "ana", &[Permission::Playback]);

    let (status, _h, _b) = raw_bytes(&t.app, "/api/users/avatar", &token, b"not-an-image".to_vec())
        .await;
    assert_eq!(status, StatusCode::UNSUPPORTED_MEDIA_TYPE);

    let dir = crate::infra::image::images_dir(&t.state.config.data_dir);
    let stored = std::fs::read_dir(&dir).map(Iterator::count).unwrap_or(0);
    assert_eq!(stored, 0, "a rejected upload must leave nothing behind");
}

async fn raw_bytes(
    app: &axum::Router,
    uri: &str,
    token: &str,
    bytes: Vec<u8>,
) -> (StatusCode, axum::http::HeaderMap, Vec<u8>) {
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt as _;

    let req = Request::builder()
        .method("POST")
        .uri(uri)
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "image/png")
        .body(Body::from(bytes))
        .expect("build request");
    let resp = app.clone().oneshot(req).await.expect("response");
    let status = resp.status();
    let headers = resp.headers().clone();
    let body = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap_or_default();
    (status, headers, body.to_vec())
}

// Every self-service update reads, validates, then writes, with an error arm
// that returns the failure instead of the happy response — the difference
// between "your name is now X" and a 500 that half-applied. A trigger makes
// writes to `users` fail like a corrupt/read-only DB while reads keep working,
// so each handler gets all the way to its write before failing.
fn freeze_users(t: &crate::api::test_support::TestApp) {
    t.state
        .db
        .get()
        .expect("db conn")
        .execute_batch(
            "CREATE TRIGGER no_user_writes BEFORE UPDATE ON users \
             BEGIN SELECT RAISE(ABORT, 'database is locked'); END;",
        )
        .expect("install trigger");
}

async fn patch_me(
    t: &crate::api::test_support::TestApp,
    token: &str,
    body: serde_json::Value,
) -> StatusCode {
    send(&t.app, "PATCH", "/api/auth/me", Some(token), Some(body)).await.0
}

#[tokio::test]
async fn a_failed_username_write_is_a_failure_not_a_new_name() {
    let t = test_app();
    let (_id, token) = seed_session(&t.state, "ana@test.dev", "ana", &[Permission::Playback]);
    freeze_users(&t);

    assert_eq!(
        patch_me(&t, &token, json!({ "username": "renamed" })).await,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    // And the stored name is untouched - a 500 that had half-applied would be
    // worse than either outcome.
    let (_s, me) = get(&t.app, "/api/auth/me", Some(&token)).await;
    assert_eq!(me["user"]["username"], "ana");
}

#[tokio::test]
async fn a_failed_email_write_is_a_failure_not_a_new_address() {
    // The email write has its own recovery path: it re-checks for a collision
    // before giving up, because the UNIQUE constraint is how a concurrent
    // request shows up. Here nobody else took it, so the original failure is
    // what surfaces.
    let t = test_app();
    let (_id, token) = seed_session(&t.state, "ana@test.dev", "ana", &[Permission::Playback]);
    freeze_users(&t);

    assert_eq!(
        patch_me(&t, &token, json!({ "email": "new@test.dev" })).await,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    let (_s, me) = get(&t.app, "/api/auth/me", Some(&token)).await;
    assert_eq!(me["user"]["email"], "ana@test.dev");
}

#[tokio::test]
async fn a_failed_language_write_is_a_failure_for_each_of_the_three() {
    // UI, audio and subtitle language are three separate writes behind one
    // request; each needs its own arm or a failure on the second would be
    // reported as a success.
    let t = test_app();
    let (_id, token) = seed_session(&t.state, "ana@test.dev", "ana", &[Permission::Playback]);
    freeze_users(&t);

    for field in ["language", "audioLanguage", "subtitleLanguage"] {
        assert_eq!(
            patch_me(&t, &token, json!({ field: "fr" })).await,
            StatusCode::INTERNAL_SERVER_ERROR,
            "{field} reported success on a write that failed"
        );
    }
}

#[tokio::test]
async fn a_failed_password_write_leaves_the_old_password_working() {
    // The worst case in the file: reporting a rotation that did not happen
    // leaves the user believing a stolen credential was evicted.
    let t = test_app();
    let (_id, token) = seed_session_pw(
        &t.state,
        "ana@test.dev",
        "ana",
        "correct horse battery",
        &[Permission::Playback],
    );
    freeze_users(&t);

    let (status, _) = send(
        &t.app,
        "PATCH",
        "/api/auth/me/password",
        Some(&token),
        Some(json!({ "current": "correct horse battery", "next": "a whole new password" })),
    )
    .await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);

    // The old one still works, which is the honest consequence of the failure.
    let (status, _) = login(&t, "10.9.0.1", "ana@test.dev", "correct horse battery").await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn a_frozen_database_does_not_stop_an_account_reading_itself() {
    // The guard above only proves anything if reads still work; otherwise every
    // one of those 500s could be the authentication failing instead.
    let t = test_app();
    let (_id, token) = seed_session(&t.state, "ana@test.dev", "ana", &[Permission::Playback]);
    freeze_users(&t);

    let (status, me) = get(&t.app, "/api/auth/me", Some(&token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(me["user"]["email"], "ana@test.dev");
}

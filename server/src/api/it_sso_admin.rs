//! Integration tests for the sign-in admin API (`src/api/admin/sign_in.rs`)
//! and for what its switches do to the password and passkey endpoints.

use axum::http::StatusCode;
use serde_json::{json, Value};

use crate::api::test_support::{
    at_provider, get, raw, seed_session, seed_session_pw, send, test_app,
    test_app_with_sign_in_provider, ProviderRound, TestApp, ORIGIN, PASSWORD,
};
use crate::config::ProviderEnv;
use crate::model::Permission;
use crate::services::sso::testing::{FakeProvider, CLIENT_ID, CLIENT_SECRET};

fn provider_input(idp: &FakeProvider) -> Value {
    json!({
        "kind": "oidc",
        "label": "Home",
        "issuer": idp.issuer,
        "clientId": CLIENT_ID,
        "clientSecret": CLIENT_SECRET,
        "enabled": true,
    })
}

fn config_with(providers: Value) -> Value {
    methods(true, true, providers)
}

fn methods(password: bool, passkeys: bool, providers: Value) -> Value {
    let mut list = vec![
        json!({ "kind": "password", "enabled": password }),
        json!({ "kind": "passkey", "enabled": passkeys }),
    ];
    list.extend(providers.as_array().cloned().unwrap_or_default());
    json!({ "methods": list })
}

fn provider_of(config: &Value) -> &Value {
    config["methods"]
        .as_array()
        .and_then(|all| all.iter().find(|m| m["kind"] == "oidc"))
        .expect("a provider")
}

fn enabled(config: &Value, kind: &str) -> Value {
    config["methods"]
        .as_array()
        .and_then(|all| all.iter().find(|m| m["kind"] == kind))
        .map(|m| m["enabled"].clone())
        .unwrap_or(Value::Null)
}

async fn save(t: &TestApp, token: &str, body: Value) -> (StatusCode, Value) {
    send(&t.app, "PUT", "/api/admin/sign-in", Some(token), Some(body)).await
}

async fn read(t: &TestApp) -> Value {
    let (status, _, config) = raw(
        &t.app,
        "GET",
        "/api/admin/sign-in",
        Some(&t.token),
        None,
        &[("origin", ORIGIN)],
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    config
}

async fn password_login(t: &TestApp, username: &str) -> (StatusCode, Value) {
    send(
        &t.app,
        "POST",
        "/api/auth/login",
        None,
        Some(json!({ "email": username, "password": PASSWORD })),
    )
    .await
}

#[tokio::test]
async fn a_saved_provider_is_offline_until_tested_and_its_secret_never_comes_back() {
    let t = test_app();
    let idp = FakeProvider::start();

    let (status, _) = save(&t, &t.token, config_with(json!([provider_input(&idp)]))).await;
    let config = read(&t).await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    let provider = provider_of(&config);
    assert_eq!(provider["id"], json!("p0"));
    assert_eq!(provider["hasSecret"], json!(true));
    assert_eq!(provider["tested"], json!(false));
    assert_eq!(provider["live"], json!(false));
    assert_eq!(provider["groupClaim"], json!("groups"));
    assert_eq!(provider["newPeople"], json!("ask"));
    assert!(!config.to_string().contains(CLIENT_SECRET));
    assert_eq!(config["redirectUris"], json!([]));
    let (_, gate) = get(&t.app, "/api/auth/config", None).await;
    assert_eq!(gate["signIn"]["methods"].as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn a_test_sign_in_takes_the_provider_live_and_shows_what_it_said() {
    let t = test_app();
    let idp = FakeProvider::start();
    let mut input = provider_input(&idp);
    input["requiredGroups"] = json!(["admins"]);
    save(&t, &t.token, config_with(json!([input]))).await;
    let round = ProviderRound { t, idp };

    let (status, started) = round
        .begin(
            "/api/admin/sign-in/test",
            Some(&round.t.token),
            json!({ "provider": "p0" }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{started}");
    let returned = round
        .through(
            &started,
            json!({ "sub": "sub-me", "email": "me@id.test", "groups": ["family"] }),
        )
        .await;
    let (_, result) = round.finish(&returned).await;

    assert_eq!(result["status"], json!("tested"));
    assert_eq!(result["report"]["email"], json!("me@id.test"));
    assert_eq!(result["report"]["groups"], json!(["family"]));
    assert_eq!(result["report"]["admitted"], json!(false));
    assert_eq!(provider_of(&read(&round.t).await)["live"], json!(true));
    let (_, gate) = get(&round.t.app, "/api/auth/config", None).await;
    assert_eq!(gate["signIn"]["methods"][2]["id"], json!("p0"));
    assert_eq!(crate::db::user_count(&round.t.state.db).unwrap(), 1);
}

#[tokio::test]
async fn a_test_that_fails_leaves_the_provider_offline() {
    let t = test_app();
    let idp = FakeProvider::start();
    let mut input = provider_input(&idp);
    input["clientSecret"] = json!("wrong");
    save(&t, &t.token, config_with(json!([input]))).await;
    let round = ProviderRound { t, idp };

    let (_, started) = round
        .begin(
            "/api/admin/sign-in/test",
            Some(&round.t.token),
            json!({ "provider": "p0" }),
        )
        .await;
    let returned = round.through(&started, json!({ "sub": "sub-me" })).await;
    let (_, result) = round.finish(&returned).await;

    assert_eq!(
        result,
        json!({ "status": "failed", "reason": "exchange.invalid_client" })
    );
    assert_eq!(provider_of(&read(&round.t).await)["live"], json!(false));
}

#[tokio::test]
async fn saving_with_a_blank_secret_keeps_a_tested_provider_live() {
    let round = at_provider(|_| {});
    let mut input = provider_input(&round.idp);
    input["id"] = json!("p0");
    input["clientSecret"] = json!("");
    input["label"] = json!("Family");

    let (status, _) = save(&round.t, &round.t.token, config_with(json!([input]))).await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    let config = read(&round.t).await;
    let provider = provider_of(&config);
    assert_eq!(provider["label"], json!("Family"));
    assert_eq!(provider["live"], json!(true));
}

#[tokio::test]
async fn passwords_go_off_only_once_a_provider_is_live() {
    let t = test_app();
    let idp = FakeProvider::start();
    let off = methods(false, true, json!([provider_input(&idp)]));

    let (status, body) = save(&t, &t.token, off).await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["code"], json!("sso.passwordNeedsProvider"));
    assert_eq!(enabled(&read(&t).await, "password"), json!(true));
}

#[tokio::test]
async fn with_passwords_off_a_member_is_refused_and_an_admin_still_gets_in() {
    let round = at_provider(|_| {});
    seed_session_pw(
        &round.t.state,
        "m@test.dev",
        "member",
        PASSWORD,
        &[Permission::Playback],
    );
    seed_session_pw(
        &round.t.state,
        "a@test.dev",
        "admin",
        PASSWORD,
        &[Permission::Playback, Permission::SettingsManage],
    );
    let mut input = provider_input(&round.idp);
    input["id"] = json!("p0");
    let off = methods(false, true, json!([input]));
    assert_eq!(save(&round.t, &round.t.token, off).await.0, StatusCode::NO_CONTENT);

    let (member, body) = password_login(&round.t, "member").await;
    let (admin, _) = password_login(&round.t, "admin").await;
    let (_, invite) = send(
        &round.t.app,
        "POST",
        "/api/invites",
        Some(&round.t.token),
        Some(json!({})),
    )
    .await;
    let (register, _) = send(
        &round.t.app,
        "POST",
        "/api/auth/register",
        None,
        Some(json!({
            "email": "new@test.dev",
            "username": "new",
            "password": PASSWORD,
            "inviteToken": invite["token"],
        })),
    )
    .await;

    assert_eq!(member, StatusCode::FORBIDDEN);
    assert_eq!(body["code"], json!("sso.passwordOff"));
    assert_eq!(admin, StatusCode::OK);
    assert_eq!(register, StatusCode::FORBIDDEN);
    let (_, gate) = get(&round.t.app, "/api/auth/config", None).await;
    assert_eq!(
        gate["signIn"]["methods"][0],
        json!({ "id": "passkey", "kind": "passkey" })
    );
}

#[tokio::test]
async fn with_passkeys_off_no_passkey_ceremony_begins() {
    let t = test_app();
    save(&t, &t.token, methods(true, false, json!([]))).await;

    let (sign_in, _, body) = raw(
        &t.app,
        "POST",
        "/api/auth/passkeys/authenticate/start",
        None,
        None,
        &[("origin", ORIGIN)],
    )
    .await;
    let (register, _, _) = raw(
        &t.app,
        "POST",
        "/api/auth/me/passkeys/register/start",
        Some(&t.token),
        None,
        &[("origin", ORIGIN)],
    )
    .await;

    assert_eq!(sign_in, StatusCode::FORBIDDEN);
    assert_eq!(body["code"], json!("sso.passkeysOff"));
    assert_eq!(register, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn an_address_is_read_before_it_is_saved() {
    let t = test_app();
    let idp = FakeProvider::start();
    let discover = |issuer: String| {
        let (app, token) = (t.app.clone(), t.token.clone());
        async move {
            send(
                &app,
                "POST",
                "/api/admin/sign-in/discover",
                Some(&token),
                Some(json!({ "issuer": issuer })),
            )
            .await
            .1
        }
    };

    let found = discover(format!("{}/", idp.issuer)).await;
    let off_network = discover("http://id.example.com".into()).await;
    let nothing_there = discover(format!("{}/realms/none", idp.issuer)).await;

    assert_eq!(found["ok"], json!(true));
    assert_eq!(found["issuer"], json!(idp.issuer));
    assert_eq!(found["scopes"], json!(["openid", "profile", "email"]));
    assert_eq!(
        off_network,
        json!({ "ok": false, "reason": "discovery.address" })
    );
    assert_eq!(
        nothing_there,
        json!({ "ok": false, "reason": "discovery.noDocument" })
    );
}

#[tokio::test]
async fn a_provider_that_is_not_valid_is_not_saved() {
    let t = test_app();
    let idp = FakeProvider::start();
    let broken = |field: &str, value: Value| {
        let mut input = provider_input(&idp);
        input[field] = value;
        config_with(json!([input]))
    };

    for (body, code) in [
        (broken("label", json!("  ")), "sso.labelInvalid"),
        (broken("label", json!("x".repeat(41))), "sso.labelInvalid"),
        (
            broken("issuer", json!("http://id.example.com")),
            "sso.issuerInvalid",
        ),
        (broken("scopes", json!(["two words"])), "sso.providerInvalid"),
        (broken("icon", json!("<svg>")), "sso.providerInvalid"),
        (
            config_with(json!(vec![provider_input(&idp); 9])),
            "sso.tooManyProviders",
        ),
    ] {
        let (status, refused) = save(&t, &t.token, body).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{code}");
        assert_eq!(refused["code"], json!(code));
    }
    assert_eq!(read(&t).await["methods"].as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn reading_takes_any_admin_and_saving_takes_whoever_manages_settings() {
    let t = test_app();
    let (_, member) = seed_session(&t.state, "m@test.dev", "m", &[Permission::Playback]);
    let (_, librarian) = seed_session(
        &t.state,
        "l@test.dev",
        "l",
        &[Permission::Playback, Permission::LibraryManage],
    );
    let read_as = |token: String| {
        let app = t.app.clone();
        async move { get(&app, "/api/admin/sign-in", Some(&token)).await.0 }
    };

    assert_eq!(read_as(member.clone()).await, StatusCode::FORBIDDEN);
    assert_eq!(read_as(librarian.clone()).await, StatusCode::OK);
    assert_eq!(
        save(&t, &librarian, config_with(json!([]))).await.0,
        StatusCode::FORBIDDEN
    );
    for uri in ["/api/admin/sign-in/discover", "/api/admin/sign-in/test"] {
        let body = json!({ "issuer": "https://id.test", "provider": "p0" });
        let (status, _) = send(&t.app, "POST", uri, Some(&librarian), Some(body)).await;
        assert_eq!(status, StatusCode::FORBIDDEN, "{uri}");
    }
}

#[tokio::test]
async fn a_provider_from_the_environment_is_live_at_once_and_keeps_its_connection() {
    let idp = FakeProvider::start();
    let t = test_app_with_sign_in_provider(ProviderEnv {
        issuer: idp.issuer.clone(),
        client_id: CLIENT_ID.into(),
        client_secret: CLIENT_SECRET.into(),
        label: "Home".into(),
    });
    let mut typed_over = provider_input(&idp);
    typed_over["id"] = json!("env");
    typed_over["issuer"] = json!("https://elsewhere.test");
    typed_over["newPeople"] = json!("create");

    let (status, _) = save(&t, &t.token, config_with(json!([typed_over]))).await;
    let config = read(&t).await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    let provider = provider_of(&config);
    assert_eq!(provider["fromEnv"], json!(true));
    assert_eq!(provider["live"], json!(true));
    assert_eq!(provider["issuer"], json!(idp.issuer));
    assert_eq!(provider["newPeople"], json!("create"));
    let round = ProviderRound { t, idp };
    let result = round
        .sign_in_with(
            json!({ "provider": "env" }),
            json!({ "sub": "sub-lea", "email": "lea@id.test" }),
        )
        .await;
    assert_eq!(result["status"], json!("signedIn"));
}

#[tokio::test]
async fn the_sign_in_screen_offers_methods_in_the_order_an_admin_saved() {
    let round = at_provider(|_| {});
    let mut provider = provider_input(&round.idp);
    provider["id"] = json!("p0");
    let reordered = json!({ "methods": [
        provider,
        { "kind": "passkey", "enabled": true },
        { "kind": "password", "enabled": true },
    ] });

    let (status, _) = save(&round.t, &round.t.token, reordered).await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, gate) = get(&round.t.app, "/api/auth/config", None).await;
    let order: Vec<&str> = gate["signIn"]["methods"]
        .as_array()
        .unwrap()
        .iter()
        .map(|m| m["id"].as_str().unwrap())
        .collect();
    assert_eq!(order, ["p0", "passkey", "password"]);
}

#[tokio::test]
async fn a_provider_cannot_take_the_id_of_a_built_in_method() {
    let t = test_app();
    let idp = FakeProvider::start();
    let mut input = provider_input(&idp);
    input["id"] = json!("password");

    let (status, refused) = save(&t, &t.token, config_with(json!([input]))).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(refused["code"], json!("sso.providerInvalid"));
}

async fn image(t: &TestApp, id: &str) -> (StatusCode, axum::http::HeaderMap, Vec<u8>) {
    picture(t, &format!("/api/auth/methods/{id}/image")).await
}

async fn picture(t: &TestApp, uri: &str) -> (StatusCode, axum::http::HeaderMap, Vec<u8>) {
    use tower::ServiceExt;
    let request = axum::http::Request::builder()
        .uri(uri)
        .extension(axum::extract::ConnectInfo(std::net::SocketAddr::from((
            [127, 0, 0, 1],
            40000,
        ))))
        .body(axum::body::Body::empty())
        .unwrap();
    let response = t.app.clone().oneshot(request).await.unwrap();
    let (status, headers) = (response.status(), response.headers().clone());
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    (status, headers, bytes.to_vec())
}

async fn upload(t: &TestApp, token: &str, id: &str, bytes: &'static [u8]) -> StatusCode {
    use tower::ServiceExt;
    let request = axum::http::Request::builder()
        .method("POST")
        .uri(format!("/api/admin/sign-in/methods/{id}/image"))
        .header("authorization", format!("Bearer {token}"))
        .extension(axum::extract::ConnectInfo(std::net::SocketAddr::from((
            [127, 0, 0, 1],
            40000,
        ))))
        .body(axum::body::Body::from(bytes))
        .unwrap();
    t.app.clone().oneshot(request).await.unwrap().status()
}

#[tokio::test]
async fn a_known_provider_wears_its_logo_and_an_unknown_one_has_no_picture() {
    let round = at_provider(|p| p.preset = "keycloak".into());

    let (_, gate) = get(&round.t.app, "/api/auth/config", None).await;
    let (status, headers, bytes) = picture(&round.t, "/api/auth/logos/keycloak").await;
    let (unknown, _, _) = picture(&round.t, "/api/auth/logos/nope").await;

    assert_eq!(
        gate["signIn"]["methods"][2]["image"],
        json!("/api/auth/logos/keycloak")
    );
    assert_eq!(status, StatusCode::OK);
    assert_eq!(headers["content-type"], "image/svg+xml");
    assert!(headers["content-security-policy"]
        .to_str()
        .unwrap()
        .contains("default-src 'none'"));
    assert!(bytes.starts_with(b"<svg "));
    assert_eq!(unknown, StatusCode::NOT_FOUND);
    let plain = at_provider(|_| {});
    let (_, gate) = get(&plain.t.app, "/api/auth/config", None).await;
    assert_eq!(gate["signIn"]["methods"][2].get("image"), None);
}

#[tokio::test]
async fn an_uploaded_picture_replaces_the_logo_until_it_is_removed() {
    let round = at_provider(|p| p.preset = "keycloak".into());
    let png: &[u8] = b"\x89PNG\r\n\x1a\nnot really pixels";

    let uploaded = upload(&round.t, &round.t.token, "p0", png).await;
    let (_, headers, bytes) = image(&round.t, "p0").await;
    let config = read(&round.t).await;

    assert_eq!(uploaded, StatusCode::NO_CONTENT);
    assert_eq!(headers["content-type"], "image/png");
    assert_eq!(bytes, png);
    assert_eq!(provider_of(&config)["hasImage"], json!(true));
    assert!(provider_of(&config)["image"]
        .as_str()
        .unwrap()
        .starts_with("/api/auth/methods/p0/image?v="));
    assert_eq!(provider_of(&config)["live"], json!(true));

    let (removed, _) = send(
        &round.t.app,
        "DELETE",
        "/api/admin/sign-in/methods/p0/image",
        Some(&round.t.token),
        None,
    )
    .await;

    assert_eq!(removed, StatusCode::NO_CONTENT);
    assert_eq!(image(&round.t, "p0").await.0, StatusCode::NOT_FOUND);
    assert_eq!(
        provider_of(&read(&round.t).await)["image"],
        json!("/api/auth/logos/keycloak")
    );
}

#[tokio::test]
async fn a_picture_takes_a_real_image_from_whoever_manages_settings() {
    let round = at_provider(|_| {});
    let (_, member) = seed_session(&round.t.state, "m@test.dev", "m", &[Permission::Playback]);
    let png: &[u8] = b"\x89PNG\r\n\x1a\nnot really pixels";

    assert_eq!(
        upload(&round.t, &member, "p0", png).await,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        upload(&round.t, &round.t.token, "p0", b"<html>hello</html>").await,
        StatusCode::UNSUPPORTED_MEDIA_TYPE
    );
    assert_eq!(
        upload(&round.t, &round.t.token, "p0", b"<svg><script>x</script></svg>").await,
        StatusCode::UNSUPPORTED_MEDIA_TYPE
    );
    assert_eq!(
        upload(&round.t, &round.t.token, "nope", png).await,
        StatusCode::NOT_FOUND
    );
    assert_eq!(image(&round.t, "p0").await.0, StatusCode::NOT_FOUND);
}

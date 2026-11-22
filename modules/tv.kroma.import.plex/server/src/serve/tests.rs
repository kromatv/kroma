use axum::body::{to_bytes, Body};
use axum::http::{header, Request, StatusCode};
use kroma_module_sdk::host::testing::StubHost;
use serde_json::{json, Value};
use tower::ServiceExt;

use super::*;

use crate::test_support::{mint, post, Household, MACHINE};

const PIN: &str = r#"<pin id="4242" code="{{code}}" authToken=""/>"#;

fn app(home: &Household) -> Router {
    let host = StubHost::with_store(home.pool.clone());
    routes_over::<StubHost>(home.web.clone()).with_state(host)
}

fn asked(method: &str, body: String) -> Request<Body> {
    Request::post(format!("/_port/importer/{method}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body))
        .unwrap()
}

async fn answer(app: Router, method: &str, ask: Value) -> Value {
    let response = app.oneshot(asked(method, ask.to_string())).await.unwrap();
    let body = to_bytes(response.into_body(), 1 << 20).await.unwrap();
    serde_json::from_slice(&body).unwrap()
}

#[tokio::test]
async fn connect_answers_the_envelope_the_core_reads() {
    let home = Household::new();
    let code = mint("code");
    home.web.answers(
        post("https://plex.tv/api/v2/pins"),
        201,
        &crate::test_support::filled(PIN, &[("code", &code)]),
    );

    let answer = answer(app(&home), "connect", json!({})).await;

    assert_eq!(answer["Ok"]["status"], "pending");
    assert!(answer["Ok"]["url"]
        .as_str()
        .unwrap()
        .starts_with("https://app.plex.tv/auth#?clientID="));
    assert!(answer["Ok"]["expiresAt"].as_i64().unwrap() > 1_700_000_000);
}

#[tokio::test]
async fn every_method_of_the_point_answers_for_a_signed_in_owner() {
    let (home, sign_in) = Household::signed_in();
    let on_server = json!({ "signIn": sign_in, "server": MACHINE });
    let with = |more: Value| {
        let mut ask = on_server.clone();
        ask.as_object_mut()
            .unwrap()
            .extend(more.as_object().unwrap().clone());
        ask
    };

    let survey = answer(app(&home), "survey", on_server.clone()).await;
    let titles = answer(
        app(&home),
        "titles",
        with(json!({ "library": "1", "limit": 500 })),
    )
    .await;
    let states = answer(
        app(&home),
        "states",
        with(json!({ "library": "1", "user": "7002", "limit": 500 })),
    )
    .await;
    let plays = answer(app(&home), "plays", with(json!({ "limit": 500 }))).await;
    let unlocked = answer(
        app(&home),
        "unlock",
        with(json!({ "user": "7002", "pin": "4821" })),
    )
    .await;
    let forgotten = answer(app(&home), "forget", json!({ "signIn": sign_in })).await;

    assert_eq!(survey["Ok"]["users"].as_array().unwrap().len(), 5);
    assert_eq!(titles["Ok"]["titles"].as_array().unwrap().len(), 3);
    assert_eq!(states["Ok"]["states"].as_array().unwrap().len(), 2);
    assert_eq!(plays["Ok"]["plays"].as_array().unwrap().len(), 2);
    assert_eq!(
        unlocked,
        json!({ "Ok": { "status": "refused", "reason": "notLocked" } })
    );
    assert_eq!(forgotten, json!({ "Ok": null }));
}

#[tokio::test]
async fn a_failure_of_the_importer_is_an_err_with_the_reason() {
    let home = Household::new();

    let answer = answer(
        app(&home),
        "survey",
        json!({ "signIn": "never-kept", "server": MACHINE }),
    )
    .await;

    assert_eq!(
        answer,
        json!({ "Err": "this importer holds no such sign-in: sign in to Plex again" })
    );
}

#[tokio::test]
async fn an_ask_past_the_size_any_ask_has_is_refused_before_it_is_read() {
    let home = Household::new();
    let padding = "x".repeat(MAX_ASK_BYTES);

    let response = app(&home)
        .oneshot(asked("forget", json!({ "signIn": padding }).to_string()))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
}

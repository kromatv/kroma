use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::api::test_support::{IMPORTER, TestApp, importer_answering, on_disk, send, test_app};

fn typed() -> String {
    crate::services::auth::random_token()
}

async fn ask(t: &TestApp, path: &str, body: Value) -> (StatusCode, Value) {
    let uri = format!("/api/admin/importers/{IMPORTER}/{path}");
    send(&t.app, "POST", &uri, Some(&t.token), Some(body)).await
}

#[tokio::test]
async fn connect_passes_the_form_through_and_hands_back_the_reference_the_importer_gave() {
    let (t, sent) = importer_answering(json!({ "Ok": {
        "status": "ready",
        "signIn": "s-1",
        "servers": [{ "id": "srv", "name": "Living room", "address": "http://nas:8096" }],
    }}));
    let form = json!({ "fields": { "url": "http://nas:8096", "password": typed() } });

    let (status, body) = ask(&t, "connect", form.clone()).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body,
        json!({
            "status": "ready",
            "signIn": "s-1",
            "servers": [{ "id": "srv", "name": "Living room", "address": "http://nas:8096" }],
        })
    );
    assert_eq!(*sent.lock().unwrap(), vec![("connect".to_string(), form)]);
}

#[tokio::test]
async fn the_core_stores_nothing_of_a_sign_in_it_passed_through() {
    let (t, _) =
        importer_answering(json!({ "Ok": { "status": "ready", "signIn": "reference-s-1" } }));
    let secret = typed();
    let form = json!({ "fields": { "password": secret } });

    ask(&t, "connect", form).await;

    assert!(on_disk(&t, "owner@test.dev"));
    assert!(!on_disk(&t, &secret));
    assert!(!on_disk(&t, "reference-s-1"));
}

#[tokio::test]
async fn a_sign_in_in_progress_comes_back_with_the_page_to_open() {
    let (t, sent) = importer_answering(json!({ "Ok": {
        "status": "pending",
        "pending": "p-7",
        "url": "https://account.example/link",
        "expiresAt": 1_700_000_900,
    }}));

    let (status, body) = ask(&t, "connect", json!({ "pending": "p-7" })).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body,
        json!({
            "status": "pending",
            "pending": "p-7",
            "url": "https://account.example/link",
            "expiresAt": 1_700_000_900,
        })
    );
    assert_eq!(
        *sent.lock().unwrap(),
        vec![("connect".to_string(), json!({ "pending": "p-7" }))]
    );
}

#[tokio::test]
async fn a_refused_sign_in_is_an_answer_and_not_an_error() {
    let (t, _) =
        importer_answering(json!({ "Ok": { "status": "refused", "reason": "credentials" } }));

    let (status, body) = ask(&t, "connect", json!({ "fields": { "password": "x" } })).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body,
        json!({ "status": "refused", "reason": "credentials" })
    );
}

#[tokio::test]
async fn an_importer_that_is_not_running_is_a_404() {
    let t = test_app();

    let (status, _) = ask(&t, "connect", json!({})).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn survey_reads_what_a_server_holds_through_the_reference() {
    let (t, sent) = importer_answering(json!({ "Ok": {
        "libraries": [{ "id": "1", "name": "Films", "kind": "movies", "folders": ["/data/movies"] }],
        "users": [{ "id": "42", "name": "Ana", "signedIn": true, "allLibraries": true }],
        "counts": { "titles": 1204 },
        "leftBehind": ["playlists"],
        "somethingNewer": true,
    }}));
    let server = json!({ "signIn": "s-1", "server": "srv" });

    let (status, body) = ask(&t, "survey", server.clone()).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body,
        json!({
            "libraries": [{ "id": "1", "name": "Films", "kind": "movies", "folders": ["/data/movies"] }],
            "users": [{
                "id": "42",
                "name": "Ana",
                "signedIn": true,
                "allLibraries": true,
                "libraries": [],
                "finerLimits": [],
                "stateLocked": false,
            }],
            "counts": { "titles": 1204 },
            "leftBehind": ["playlists"],
        })
    );
    assert_eq!(*sent.lock().unwrap(), vec![("survey".to_string(), server)]);
}

#[tokio::test]
async fn an_importer_s_own_failure_is_a_502_in_its_words() {
    let (t, _) = importer_answering(json!({ "Err": "the other server did not answer" }));

    let (status, body) = ask(&t, "survey", json!({ "signIn": "s-1", "server": "srv" })).await;

    assert_eq!(status, StatusCode::BAD_GATEWAY);
    assert_eq!(body, json!({ "error": "the other server did not answer" }));
}

#[tokio::test]
async fn an_answer_the_core_cannot_read_is_a_502_that_does_not_repeat_it() {
    let (t, _) =
        importer_answering(json!({ "Ok": { "users": [{ "id": "" }], "libraries": "leaked" } }));

    let (status, body) = ask(&t, "survey", json!({ "signIn": "s-1", "server": "srv" })).await;

    assert_eq!(status, StatusCode::BAD_GATEWAY);
    assert_eq!(
        body,
        json!({ "error": "the importer gave an answer this server cannot read" })
    );
}

#[tokio::test]
async fn forget_has_the_importer_delete_the_sign_in() {
    let (t, sent) = importer_answering(json!({ "Ok": {} }));

    let (status, body) = ask(&t, "forget", json!({ "signIn": "s-1" })).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!({ "ok": true }));
    assert_eq!(
        *sent.lock().unwrap(),
        vec![("forget".to_string(), json!({ "signIn": "s-1" }))]
    );
}

#[tokio::test]
async fn a_form_past_the_size_a_sign_in_may_have_never_reaches_the_importer() {
    let (t, sent) = importer_answering(json!({ "Ok": { "status": "ready", "signIn": "s-1" } }));
    let form = json!({ "fields": { "password": "x".repeat(70 * 1024) } });

    let (status, _) = ask(&t, "connect", form).await;

    assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
    assert!(sent.lock().unwrap().is_empty());
}

use serde_json::{json, Value};

use super::super::cache::Cache;
use super::{lookup_all_by_id, tmdb_json, Target};
use crate::test_support::recording_server::RecordingServer;
use crate::test_support::FakeTmdb;

const V3_KEY: &str = "0123456789abcdef0123456789abcdef";
const V4_TOKEN: &str = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ4In0.c2lnbmF0dXJl";

fn ask(server: &RecordingServer, api_key: &str) -> Result<Value, ()> {
    tmdb_json(
        "metadata",
        &format!("{}/movie/603", server.base()),
        api_key,
        &[("language", "fr-FR".to_string())],
    )
}

#[test]
fn a_v3_key_travels_as_the_api_key_query_param() {
    let server = RecordingServer::replying(200, r#"{"id":603}"#);

    let reply = ask(&server, V3_KEY);

    let sent = server.requests();
    assert_eq!(reply, Ok(json!({ "id": 603 })));
    assert_eq!(sent[0].header("authorization"), None);
    assert!(sent[0].target.contains(&format!("api_key={V3_KEY}")));
    assert!(sent[0].target.contains("language=fr-FR"));
}

#[test]
fn a_v4_token_travels_as_a_bearer_header_and_not_in_the_query() {
    let server = RecordingServer::replying(200, r#"{"id":603}"#);

    let reply = ask(&server, V4_TOKEN);

    let sent = server.requests();
    let expected = format!("Bearer {V4_TOKEN}");
    assert_eq!(reply, Ok(json!({ "id": 603 })));
    assert_eq!(sent[0].header("authorization"), Some(expected.as_str()));
    assert!(!sent[0].target.contains("api_key"));
}

#[test]
fn an_http_error_status_is_a_failure() {
    let server = RecordingServer::replying(401, r#"{"status_message":"Invalid API key"}"#);

    let reply = ask(&server, V3_KEY);

    assert_eq!(reply, Err(()));
}

#[test]
fn a_body_that_is_not_json_is_a_failure() {
    let server = RecordingServer::replying(200, "<html>maintenance</html>");

    let reply = ask(&server, V3_KEY);

    assert_eq!(reply, Err(()));
}

#[test]
fn a_locale_is_asked_under_the_tag_tmdb_knows_and_answered_under_its_own() {
    let tmdb = FakeTmdb::start(|_| (200, json!({ "id": 603, "title": "Title" })));
    let cache = Cache::new();
    let locales = ["fr", "pt-BR", "zh-Hant"];

    let resolved = lookup_all_by_id(&cache, V3_KEY, "fr-FR", &locales, Target::Movie, 603).unwrap();

    let mut answered: Vec<&str> = resolved.by_lang.keys().map(String::as_str).collect();
    answered.sort_unstable();
    let asked = tmdb.requests();
    assert_eq!(answered, locales);
    assert!(asked[0].contains("language=fr&"));
    assert!(asked[1].contains("language=pt-BR&"));
    assert!(asked[2].contains("language=zh-TW&"));
}

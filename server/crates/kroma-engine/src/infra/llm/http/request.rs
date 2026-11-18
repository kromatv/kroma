use std::fmt;

use anyhow::{anyhow, Result};
use kroma_http::{Fetch, Response};
use serde_json::Value;

const COMPLETION_MAX_TIME_SECS: u32 = 180;
const MODEL_LIST_MAX_TIME_SECS: u32 = 20;

// `None` when blank and the provider has no default (base URL required).
pub(super) fn resolve_base(base_url: &str, default: Option<&str>) -> Option<String> {
    let base = base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        default.map(str::to_string)
    } else {
        Some(base.to_string())
    }
}

pub(super) fn post_json(url: &str, headers: &[(&str, String)], body: &Value) -> Result<Value> {
    let response = fetch_with(headers, COMPLETION_MAX_TIME_SECS).post_json(url, body)?;
    answer(&response, "LLM request")
}

pub(super) fn get_json(url: &str, headers: &[(&str, String)]) -> Result<Value> {
    let response = fetch_with(headers, MODEL_LIST_MAX_TIME_SECS).get(url)?;
    answer(&response, "model list")
}

fn fetch_with(headers: &[(&str, String)], max_time_secs: u32) -> Fetch {
    headers.iter().fold(
        Fetch::new().purpose("ai").max_time(max_time_secs).no_redirects(),
        |fetch, (name, value)| fetch.header(name, value.as_str()),
    )
}

fn answer(response: &Response, what: &str) -> Result<Value> {
    let v: Value = response
        .json()
        .map_err(|e| anyhow!("{what} (HTTP {}): {e}", response.status))?;
    check_error(response.status, &v)?;
    Ok(v)
}

/// An error the provider answered with. `status` is the error's own `code`
/// when it carries one, since OpenRouter can report a failure inside a 200.
#[derive(Debug)]
pub(super) struct ApiError {
    pub(super) status: u16,
    message: String,
}

impl ApiError {
    pub(super) fn rejected_the_request(&self) -> bool {
        self.status == 400
    }
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "LLM API error: {}", self.message)
    }
}

impl std::error::Error for ApiError {}

// A present-but-`null` `error` field (some OpenAI-compatible servers include
// it on success) is not an error.
fn check_error(http_status: u16, v: &Value) -> Result<(), ApiError> {
    let Some(err) = v.get("error").filter(|e| !e.is_null()) else {
        return Ok(());
    };
    let message = err
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or_else(|| err.as_str().unwrap_or("unknown error"))
        .to_string();
    let status = err
        .get("code")
        .and_then(Value::as_u64)
        .and_then(|code| u16::try_from(code).ok())
        .unwrap_or(http_status);
    Err(ApiError { status, message })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::test_support::recording_server::RecordingServer;

    #[test]
    fn a_base_url_shaped_like_a_curl_flag_is_never_read_as_one() {
        let data = kroma_testing::temp_dir("llm-curl-flag");
        let probe = data.path().join("written-by-curl");
        let config = data.path().join("curl.conf");
        std::fs::write(
            &config,
            format!(
                "output = \"{}\"\nurl = \"file:///dev/null\"\n",
                probe.display()
            ),
        )
        .expect("curl config");

        let out = get_json(&format!("-K{}", config.display()), &[]);

        assert!(out.is_err());
        assert!(
            !probe.exists(),
            "the base URL was read as a curl config-file flag"
        );
    }

    #[test]
    fn a_completion_carries_the_provider_headers_and_the_json_body() {
        let server = RecordingServer::replying(200, r#"{"ok":true}"#);
        let headers = [("x-api-key", "sk-live-1".to_string())];

        let reply = post_json(
            &format!("{}/v1/messages", server.base()),
            &headers,
            &json!({ "model": "m" }),
        )
        .unwrap();

        let sent = server.requests();
        assert_eq!(reply, json!({ "ok": true }));
        assert_eq!(sent[0].header("x-api-key"), Some("sk-live-1"));
        assert_eq!(sent[0].header("content-type"), Some("application/json"));
        assert_eq!(sent[0].body, r#"{"model":"m"}"#);
    }

    #[test]
    fn a_redirect_is_answered_rather_than_followed_so_the_key_stays_with_the_provider() {
        let elsewhere = RecordingServer::replying(200, r#"{"ok":true}"#);
        let provider =
            RecordingServer::redirecting_to(&format!("{}/v1/messages", elsewhere.base()));
        let headers = [("x-api-key", "sk-live-1".to_string())];

        let reply = post_json(
            &format!("{}/v1/messages", provider.base()),
            &headers,
            &json!({ "model": "m" }),
        );

        assert!(reply.is_err());
        assert!(elsewhere.requests().is_empty());
    }

    #[test]
    fn an_error_status_with_a_json_body_reaches_the_error_check() {
        let server = RecordingServer::replying(401, r#"{"error":{"message":"bad key"}}"#);

        let err = get_json(&format!("{}/models", server.base()), &[]).unwrap_err();

        let api = err.downcast_ref::<ApiError>().unwrap();
        assert_eq!(api.status, 401);
        assert_eq!(err.to_string(), "LLM API error: bad key");
    }

    #[test]
    fn an_error_inside_a_success_status_keeps_the_code_it_names() {
        let server = RecordingServer::replying(
            200,
            r#"{"error":{"code":400,"message":"Reasoning is mandatory"}}"#,
        );

        let err = post_json(server.base(), &[], &json!({})).unwrap_err();

        let api = err.downcast_ref::<ApiError>().unwrap();
        assert!(api.rejected_the_request());
    }

    #[test]
    fn a_null_error_field_on_a_success_is_no_error() {
        let server = RecordingServer::replying(200, r#"{"error":null,"ok":true}"#);

        let reply = post_json(server.base(), &[], &json!({})).unwrap();

        assert_eq!(reply["ok"], true);
    }

    #[test]
    fn a_reply_that_is_not_json_reports_its_status_and_an_excerpt() {
        let server = RecordingServer::replying(502, "<html>bad gateway</html>");

        let err = post_json(server.base(), &[], &json!({}))
            .unwrap_err()
            .to_string();

        assert!(err.contains("HTTP 502"), "{err}");
        assert!(err.contains("bad gateway"), "{err}");
    }
}

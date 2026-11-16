use serde_json::json;

use crate::fake_nzbget::{FakeNzbGet, Reply};
use crate::AddReq;

fn usenet<'a>(url: &'a str, name: &'a str, label: &'a str) -> AddReq<'a> {
    AddReq {
        protocol: "usenet",
        url,
        name,
        label,
    }
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn test_reports_the_version_over_authenticated_json_rpc() {
    let fake = FakeNzbGet::start(|method, _| match method {
        "version" => Reply::ok(json!("24.5")),
        _ => Reply::fault("unexpected"),
    });

    assert_eq!(fake.client().test().unwrap(), "NZBGet 24.5");

    let calls = fake.calls();
    assert_eq!(calls[0].auth.as_deref(), Some("Basic YWRtaW46c2VjcmV0"));
    assert_eq!(calls[0].params, json!([]));
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_client_without_credentials_sends_no_authorization_header() {
    let fake = FakeNzbGet::start(|_, _| Reply::ok(json!("24.5")));

    fake.anonymous().test().unwrap();

    assert_eq!(fake.calls()[0].auth, None);
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_401_names_the_credentials() {
    let fake = FakeNzbGet::start(|_, _| Reply::raw(401, "Unauthorized"));

    let err = fake.client().test().unwrap_err().to_string();

    assert!(err.contains("username/password"), "{err}");
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_json_rpc_error_is_surfaced_with_its_message() {
    let fake = FakeNzbGet::start(|_, _| Reply::fault("Access denied"));

    let err = fake.client().test().unwrap_err().to_string();

    assert!(err.contains("Access denied"), "{err}");
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_reply_without_a_result_is_malformed() {
    let fake = FakeNzbGet::start(|_, _| Reply::raw(200, r#"{"ok":true}"#));

    let err = fake.client().test().unwrap_err().to_string();

    assert!(err.contains("malformed"), "{err}");
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn add_hands_the_url_to_append_in_the_documented_parameter_order() {
    let fake = FakeNzbGet::start(|method, _| match method {
        "append" => Reply::ok(json!(42)),
        _ => Reply::fault("unexpected"),
    });

    let id = fake
        .client()
        .add(&usenet("https://idx.example/getnzb/abc.nzb", "Some.Show.S01E01", "kroma"))
        .unwrap();

    assert_eq!(id, "42");
    assert_eq!(
        fake.calls()[0].params,
        json!([
            "Some.Show.S01E01.nzb",
            "https://idx.example/getnzb/abc.nzb",
            "kroma",
            0,
            false,
            false,
            "",
            0,
            "SCORE",
            false
        ])
    );
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn add_keeps_a_release_name_from_escaping_into_a_path() {
    let fake = FakeNzbGet::start(|_, _| Reply::ok(json!(1)));

    fake.client()
        .add(&usenet("http://idx/a.nzb", "a/b\\c", ""))
        .unwrap();

    assert_eq!(fake.calls()[0].params[0], "a_b_c.nzb");
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn an_append_that_returns_zero_is_a_failure() {
    let fake = FakeNzbGet::start(|_, _| Reply::ok(json!(0)));

    let err = fake
        .client()
        .add(&usenet("http://idx/a.nzb", "n", ""))
        .unwrap_err()
        .to_string();

    assert!(err.contains("refused"), "{err}");
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn add_refuses_anything_but_usenet_without_calling_the_daemon() {
    let fake = FakeNzbGet::start(|_, _| Reply::ok(json!(1)));

    for protocol in ["torrent", ""] {
        let err = fake
            .client()
            .add(&AddReq {
                protocol,
                url: "http://idx/a.nzb",
                name: "n",
                label: "",
            })
            .unwrap_err()
            .to_string();

        assert!(err.contains("usenet releases only"), "{err}");
    }
    assert!(fake.calls().is_empty());
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn add_refuses_a_magnet_link() {
    let fake = FakeNzbGet::start(|_, _| Reply::ok(json!(1)));

    let err = fake
        .client()
        .add(&usenet("magnet:?xt=urn:btih:AB", "n", ""))
        .unwrap_err()
        .to_string();

    assert!(err.contains("http(s)"), "{err}");
    assert!(fake.calls().is_empty());
}

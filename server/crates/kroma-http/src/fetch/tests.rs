use std::path::Path;

use super::render::proxy_lines;
use super::send::{chosen_proxy, scrubbed};
use super::*;
use crate::egress::Decision;

#[test]
fn empty_socks5_is_ignored() {
    let f = Fetch::new().socks5("  ");
    assert!(f.socks5.is_none());
}

#[test]
fn a_proxy_forces_ipv4() {
    assert!(proxy_lines("127.0.0.1:25345").starts_with("ipv4\n"));
    assert!(!Fetch::new().base_config().contains("ipv4"));
}

#[test]
fn the_proxy_resolves_names_whatever_scheme_the_caller_wrote() {
    for proxy in [
        "socks5://127.0.0.1:25345",
        "socks5h://127.0.0.1:25345",
        "127.0.0.1:25345",
    ] {
        let own = Fetch::new().socks5(proxy).socks5;

        assert_eq!(own.as_deref(), Some("127.0.0.1:25345"), "{proxy}");
    }
    let with_credentials = Fetch::new()
        .socks5("socks5://kroma:secret@127.0.0.1:1080")
        .socks5;
    assert_eq!(
        with_credentials.as_deref(),
        Some("kroma:secret@127.0.0.1:1080")
    );
    assert!(proxy_lines("kroma:secret@127.0.0.1:1080")
        .contains("socks5-hostname = \"kroma:secret@127.0.0.1:1080\"\n"));
}

#[test]
fn no_host_bypasses_the_proxy_whatever_no_proxy_says() {
    assert!(proxy_lines("127.0.0.1:25345").contains("noproxy = \"\"\n"));
    assert!(!Fetch::new().base_config().contains("noproxy"));
}

#[test]
fn the_gates_proxy_wins_over_the_callers_own() {
    let chosen = chosen_proxy(
        Decision::Proxy("socks5://kroma:pw@127.0.0.1:9".into()),
        Some("127.0.0.1:1080"),
    );

    assert_eq!(chosen, Ok(Some("kroma:pw@127.0.0.1:9".to_string())));
}

#[test]
fn a_direct_ruling_keeps_a_proxy_the_caller_set() {
    assert_eq!(
        chosen_proxy(Decision::Direct, Some("127.0.0.1:1080")),
        Ok(Some("127.0.0.1:1080".to_string()))
    );
    assert_eq!(chosen_proxy(Decision::Direct, None), Ok(None));
}

#[test]
fn a_block_or_an_empty_proxy_refuses_the_call() {
    assert_eq!(
        chosen_proxy(Decision::Block("no".into()), Some("127.0.0.1:1080")),
        Err("no".to_string())
    );
    assert!(chosen_proxy(Decision::Proxy("socks5://".into()), None).is_err());
}

#[test]
fn an_error_never_carries_the_urls_path_or_query() {
    let url = "https://indexer.example/api?apikey=s3cret";

    let error = scrubbed(&format!("{url} is not reachable"), url, "indexer.example");

    assert_eq!(error, "indexer.example is not reachable");
}

#[test]
fn a_long_error_is_cut_short() {
    let error = scrubbed(&"x".repeat(1000), "", "");

    assert_eq!(error.chars().count(), 300);
}

#[test]
fn redirects_are_followed_unless_refused() {
    assert!(Fetch::new().base_config().contains("\nlocation\n"));
    assert!(!Fetch::new()
        .no_redirects()
        .base_config()
        .contains("location"));
    assert!(!Fetch::new()
        .public_only()
        .base_config()
        .contains("location"));
}

#[test]
fn a_redirect_budget_reaches_curl_only_when_asked_for() {
    assert!(Fetch::new()
        .max_redirects(2)
        .base_config()
        .contains("max-redirs = \"2\"\n"));
    assert!(!Fetch::new().base_config().contains("max-redirs"));
}

#[test]
fn only_web_protocols_are_reachable_even_through_a_redirect() {
    let config = Fetch::new().base_config();

    assert!(config.contains("proto = \"=http,https\"\n"), "{config}");
    assert!(
        config.contains("proto-redir = \"=http,https\"\n"),
        "{config}"
    );
}

#[test]
fn an_https_only_request_refuses_plain_http_on_every_hop() {
    let config = Fetch::new().https_only().base_config();

    assert!(config.contains("proto = \"=https\"\n"), "{config}");
    assert!(config.contains("proto-redir = \"=https\"\n"), "{config}");
}

#[test]
fn a_public_only_request_to_a_private_address_never_reaches_curl() {
    let err = Fetch::new()
        .public_only()
        .post_bytes(
            "http://127.0.0.1:4040/api/_host/settings",
            "text/plain",
            b"x",
        )
        .unwrap_err()
        .to_string();

    assert!(err.contains("not a public internet address"), "{err}");
}

#[test]
fn base_config_carries_headers_cookie_jar_and_max_time() {
    let config = Fetch::new()
        .header("X-Test", "v")
        .max_time(99)
        .cookie_jar("/tmp/jar")
        .base_config();
    assert!(config.contains(r#"header = "X-Test: v""#), "{config}");
    assert!(config.contains(r#"max-time = "99""#), "{config}");
    assert!(config.contains(r#"cookie-jar = "/tmp/jar""#), "{config}");
    assert!(config.contains(r#"cookie = "/tmp/jar""#), "{config}");
}

#[test]
fn a_body_cap_reaches_curl_only_when_asked_for() {
    assert!(Fetch::new()
        .max_bytes(1024)
        .base_config()
        .contains(r#"max-filesize = "1024""#));
    assert!(!Fetch::new().base_config().contains("max-filesize"));
}

#[test]
fn http2_is_requested_only_when_asked_for() {
    assert!(Fetch::new().http2().base_config().contains("\nhttp2\n"));
    assert!(!Fetch::new().base_config().contains("http2"));
}

#[test]
fn a_header_value_cannot_inject_a_second_curl_option() {
    let smuggled = "k\"\r\noutput = \"/tmp/pwned\"\nheader = \"X-Injected: 1\\";
    let config = Fetch::new().header("X-Api-Key", smuggled).base_config();

    let options: Vec<&str> = config.lines().collect();
    assert_eq!(options.len(), 7, "one line per option: {config}");
    assert!(
        options[6].starts_with(r#"header = "X-Api-Key: k\""#),
        "{config}"
    );
    assert!(options[6].ends_with(r#"X-Injected: 1\\""#), "{config}");
}

#[test]
fn only_a_form_post_with_no_fields_names_the_method_itself() {
    let empty = Fetch::new().form_config("http://box:8060/launch/dev?server=x", &[]);
    assert!(empty.contains("request = \"POST\"\n"), "{empty}");
    assert!(empty.contains("data = \"\"\n"), "{empty}");

    let filled = Fetch::new().form_config("http://box/api", &[("user", "ana")]);
    assert!(!filled.contains("request = "), "{filled}");
    assert!(!filled.contains("data = \"\"\n"), "{filled}");
    assert!(
        filled.contains("data-urlencode = \"user=ana\"\n"),
        "{filled}"
    );
}

#[test]
fn a_multipart_post_carries_one_line_per_part_and_the_url_last() {
    let config = Fetch::new().multipart_config(
        "http://box/plugin_install",
        &[
            ("mysubmit", FormPart::Text("Replace")),
            ("archive", FormPart::File(Path::new("/data/channel.zip"))),
        ],
    );

    let options: Vec<&str> = config.lines().collect();
    assert_eq!(
        options[6], r#"form-string = "mysubmit=Replace""#,
        "{config}"
    );
    assert_eq!(
        options[7], r#"form = "archive=@\"/data/channel.zip\"""#,
        "{config}"
    );
    assert_eq!(
        options[8], r#"url = "http://box/plugin_install""#,
        "{config}"
    );
}

#[test]
fn a_digest_password_cannot_smuggle_a_second_curl_option() {
    let smuggled = "pa\"ss\nurl = \"http://evil\"";
    let config = Fetch::new().digest("rokudev", smuggled).base_config();

    let options: Vec<&str> = config.lines().collect();
    assert_eq!(options.len(), 8, "one line per option: {config}");
    assert_eq!(options[6], "digest", "{config}");
    assert!(
        options[7].starts_with(r#"user = "rokudev:pa\"ss\nurl"#),
        "{config}"
    );
    assert!(!Fetch::new().base_config().contains("digest"));
}

#[test]
fn builder_setters_record_options() {
    let f = Fetch::new()
        .query("q", "hello world")
        .header("A", "b")
        .max_time(5)
        .purpose("metadata");
    assert_eq!(f.query, vec![("q".to_string(), "hello world".to_string())]);
    assert_eq!(f.headers, vec![("A".to_string(), "b".to_string())]);
    assert_eq!(f.max_time_secs, 5);
    assert_eq!(f.purpose, "metadata");
    assert_eq!(Fetch::new().purpose, "unlabelled");
    assert_eq!(Fetch::new().max_time_secs, 30);
    assert!(!Fetch::new().http2);
    assert!(Fetch::new().http2().http2);
}

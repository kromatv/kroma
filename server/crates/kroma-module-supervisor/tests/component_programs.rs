#![cfg(unix)]

use kroma_module_host::NetworkAction;

mod component_support;

use component_support::wasm::guest_component;
use component_support::{GUEST, Server, THIRD_PARTY, http_server};

const RUNS_ECHO: &str = r#", "storage": {}, "permissions": { "run": ["echo"] }"#;
const STAND_IN: &str = "#!/bin/sh\necho from the helper\n";
const SLEEPER: &str = "#!/bin/sh\nexec sleep \"$1\"\n";

fn sha256_of(bytes: &[u8]) -> String {
    use sha2::Digest;
    hex::encode(sha2::Sha256::digest(bytes))
}

fn manifest_with_helper(port: u16, sha256: &str) -> String {
    let platform = format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH);
    format!(
        r#", "storage": {{}},
        "permissions": {{
            "net": {{ "connect": [{{ "purpose": "binary-download", "to": ["lan"] }}] }},
            "run": ["stand-in"]
        }},
        "helpers": {{ "stand-in": {{ "assets": {{ "{platform}": {{
            "url": "http://127.0.0.1:{port}/stand-in",
            "sha256": "{sha256}"
        }} }} }} }}"#
    )
}

#[test]
fn a_component_starts_only_what_its_manifest_declares() {
    let server = Server::new("component-run", NetworkAction::Direct);
    let endpoint = server.started(GUEST, guest_component(), RUNS_ECHO);

    let declared = server.get(&endpoint, "/run/echo");
    let other = server.get(&endpoint, "/run/sh");

    assert_eq!(declared.text(), "0 hello\n");
    assert!(
        other.text().contains("does not declare"),
        "{}",
        other.text()
    );
}

#[test]
fn a_third_party_component_starts_no_program_even_one_it_declares() {
    let server = Server::new("component-run-third-party", NetworkAction::Direct);
    let endpoint = server.started_from(GUEST, guest_component(), RUNS_ECHO, THIRD_PARTY);

    let declared = server.get(&endpoint, "/run/echo");

    assert!(
        declared
            .text()
            .contains("third-party module stays contained"),
        "{}",
        declared.text()
    );
}

#[test]
fn a_helper_runs_only_after_it_was_fetched_and_matches_its_pin() {
    let server = Server::new("component-helper", NetworkAction::Direct);
    let (port, _) = http_server(STAND_IN);
    let manifest = manifest_with_helper(port, &sha256_of(STAND_IN.as_bytes()));
    let endpoint = server.started(GUEST, guest_component(), &manifest);

    let before = server.get(&endpoint, "/run/stand-in");
    let fetched = server.get(&endpoint, "/ensure/stand-in");
    let after = server.get(&endpoint, "/run/stand-in");

    assert!(
        before.text().contains("has not been fetched"),
        "{}",
        before.text()
    );
    assert_eq!(fetched.text(), "Ok(())");
    assert_eq!(after.text(), "0 from the helper\n");
}

#[test]
fn a_helper_that_does_not_match_its_pin_is_refused_and_not_kept() {
    let server = Server::new("component-helper-pin", NetworkAction::Direct);
    let (port, _) = http_server(STAND_IN);
    let manifest = manifest_with_helper(port, &sha256_of(b"something else"));
    let endpoint = server.started(GUEST, guest_component(), &manifest);

    let fetched = server.get(&endpoint, "/ensure/stand-in");
    let after = server.get(&endpoint, "/run/stand-in");

    assert!(
        fetched.text().contains("pinned sha256"),
        "{}",
        fetched.text()
    );
    assert!(
        after.text().contains("has not been fetched"),
        "{}",
        after.text()
    );
    assert!(
        !server
            .dir
            .path()
            .join("helpers")
            .join(GUEST)
            .join("stand-in")
            .exists()
    );
}

#[test]
fn a_helper_is_kept_where_the_module_cannot_write() {
    let server = Server::new("component-helper-dir", NetworkAction::Direct);
    let (port, _) = http_server(STAND_IN);
    let manifest = manifest_with_helper(port, &sha256_of(STAND_IN.as_bytes()));
    let endpoint = server.started(GUEST, guest_component(), &manifest);

    server.get(&endpoint, "/ensure/stand-in");
    let tampered = server.get(&endpoint, "/tamper/stand-in");

    assert!(tampered.text().starts_with("Err("), "{}", tampered.text());
    assert_eq!(
        server.get(&endpoint, "/run/stand-in").text(),
        "0 from the helper\n"
    );
}

fn is_alive(pid: &str) -> bool {
    std::process::Command::new("ps")
        .args(["-p", pid])
        .output()
        .is_ok_and(|out| out.status.success())
}

#[test]
fn a_component_that_traps_takes_the_programs_it_started_with_it() {
    let server = Server::new("component-helper-trap", NetworkAction::Direct);
    let (port, _) = http_server(SLEEPER);
    let manifest = manifest_with_helper(port, &sha256_of(SLEEPER.as_bytes()));
    let endpoint = server.started(GUEST, guest_component(), &manifest);
    server.get(&endpoint, "/ensure/stand-in");
    let started = server.get(&endpoint, "/start/stand-in");
    let pids = std::fs::read_to_string(
        server
            .dir
            .path()
            .join("helpers")
            .join(GUEST)
            .join("stand-in.pid"),
    )
    .unwrap();
    let pid = pids.lines().last().unwrap().to_string();
    let alive_before = is_alive(&pid);

    let _ = server.as_the_core(GUEST).get(&endpoint.url("/explode"));

    assert_eq!(started.text(), "started");
    assert!(alive_before);
    assert!(!is_alive(&pid));
}

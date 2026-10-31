use std::path::{Path, PathBuf};

use kroma_testing::{cargo, findings, Finding};

const COMMAND: &str = "Command::new(";
const CURL: [&str; 2] = ["curl", "curl.exe"];
const RUNS_CURL: &str = "runs curl outside kroma-http; send the request through kroma_http::Fetch, which asks the egress gate";

const SCANNED_ROOTS: [&str; 2] = ["server", "modules"];
const EXEMPT: [&str; 1] = ["server/crates/kroma-http/"];

fn curl_runs(source: &str) -> Vec<Finding> {
    source
        .match_indices(COMMAND)
        .filter(|(at, _)| names_curl(&source[at + COMMAND.len()..]))
        .map(|(at, _)| Finding {
            line: source[..at].matches('\n').count() + 1,
            reason: RUNS_CURL,
        })
        .collect()
}

fn names_curl(arguments: &str) -> bool {
    let program = arguments.split(')').next().unwrap_or_default().trim();
    let Some(literal) = program
        .strip_prefix('"')
        .and_then(|rest| rest.strip_suffix('"'))
    else {
        return false;
    };
    let name = literal.rsplit(['/', '\\']).next().unwrap_or(literal);
    CURL.contains(&name)
}

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .expect("kroma-http sits three levels below the repository root")
        .to_path_buf()
}

#[test]
fn curl_runs_from_kroma_http_alone() {
    let found = findings(&repo_root(), &SCANNED_ROOTS, &EXEMPT, curl_runs);

    assert!(found.is_empty(), "\n{}\n", found.join("\n"));
}

#[test]
fn the_scan_reads_the_curl_kroma_http_itself_runs() {
    let found = findings(&repo_root(), &SCANNED_ROOTS, &[], curl_runs);

    assert!(
        found
            .iter()
            .any(|line| line.starts_with("server/crates/kroma-http/src/curl.rs:")),
        "{found:?}"
    );
}

#[test]
fn a_curl_command_is_reported_at_its_line_with_the_rule() {
    let source = "fn fetch() {\n    std::process::Command::new(\"curl\")\n        .arg(url)\n        .output();\n}\n";

    let found = curl_runs(source);

    assert_eq!(found.len(), 1);
    assert_eq!(found[0].line, 2);
    assert_eq!(found[0].reason, RUNS_CURL);
}

#[test]
fn a_curl_named_by_its_path_is_reported() {
    for source in [
        "Command::new(\"/usr/bin/curl\")",
        "Command::new( \"C:\\\\Windows\\\\System32\\\\curl.exe\" )",
    ] {
        assert_eq!(curl_runs(source).len(), 1, "{source}");
    }
}

#[test]
fn another_program_is_not_reported() {
    for source in [
        "Command::new(\"ffprobe\")",
        "Command::new(\"curlew\")",
        "Command::new(program)",
    ] {
        assert!(curl_runs(source).is_empty(), "{source}");
    }
}

#[test]
fn clippy_refuses_a_raw_connection_in_the_server_and_names_the_rule() {
    let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/bypass/Cargo.toml");
    let target_dir = Path::new(env!("CARGO_TARGET_TMPDIR")).join("bypass");

    let output = cargo()
        .args(["clippy", "--quiet", "--locked", "--manifest-path"])
        .arg(&fixture)
        .arg("--target-dir")
        .arg(&target_dir)
        .args(["--", "-D", "clippy::disallowed_methods"])
        .output()
        .expect("run cargo clippy on the fixture");

    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(!output.status.success(), "{stderr}");
    assert!(
        stderr.contains("use of a disallowed method `std::net::TcpStream::connect`"),
        "{stderr}"
    );
    assert!(stderr.contains("clippy::disallowed-methods"), "{stderr}");
    assert!(stderr.contains("kroma_http::Fetch"), "{stderr}");
}

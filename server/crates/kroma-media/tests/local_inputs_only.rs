use std::path::{Path, PathBuf};

use kroma_testing::{findings, rust_sources, Finding};

const RAW_INPUT_FLAG: &str = "\"-i\"";
const RAW_WHITELIST_FLAG: &str = "protocol_whitelist";
const FFPROBE_COMMAND: &str = "Command::new(\"ffprobe\")";
const HELPER_CALL: &str = "input::";
const NO_INPUT_FLAG: &str = "\"-version\"";

const SCANNED_ROOTS: [&str; 2] = ["server", "modules"];
const EXEMPT: [&str; 4] = [
    "server/crates/kroma-media/src/input.rs",
    "server/crates/kroma-media/src/input/",
    "server/crates/kroma-media/tests/",
    "server/crates/kroma-testing/",
];

fn violations(source: &str) -> Vec<Finding> {
    let by_line = source.lines().enumerate().flat_map(|(index, text)| {
        [
            (RAW_INPUT_FLAG, "spells the input flag by hand"),
            (RAW_WHITELIST_FLAG, "spells the protocol whitelist by hand"),
        ]
        .into_iter()
        .filter(|(needle, _)| text.contains(needle))
        .map(move |(_, reason)| Finding {
            line: index + 1,
            reason,
        })
    });
    let probes = source
        .match_indices(FFPROBE_COMMAND)
        .filter(|(at, _)| {
            let statement = source[*at..].split(';').next().unwrap_or_default();
            !statement.contains(HELPER_CALL) && !statement.contains(NO_INPUT_FLAG)
        })
        .map(|(at, _)| Finding {
            line: source[..at].matches('\n').count() + 1,
            reason: "runs ffprobe without naming the input through kroma_media::input",
        });
    by_line.chain(probes).collect()
}

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .expect("kroma-media sits three levels below the repository root")
        .to_path_buf()
}

#[test]
fn every_ffmpeg_and_ffprobe_input_goes_through_the_input_helper() {
    let found = findings(&repo_root(), &SCANNED_ROOTS, &EXEMPT, violations);

    assert!(found.is_empty(), "\n{}\n", found.join("\n"));
}

#[test]
fn the_scan_covers_the_server_and_the_modules() {
    let root = repo_root();

    let sources: Vec<PathBuf> = SCANNED_ROOTS
        .iter()
        .flat_map(|top| rust_sources(&root.join(top)))
        .collect();

    let reaches = |part: &str| sources.iter().any(|p| p.to_string_lossy().contains(part));
    assert!(reaches("server/src/api/stream.rs"));
    assert!(reaches("server/crates/kroma-engine/"));
    assert!(reaches("modules/tv.kroma.whisper/server/src/lib.rs"));
}

#[test]
fn a_raw_input_flag_is_reported_with_its_line() {
    let source = "fn run() {\n    cmd.args([\"-v\", \"-i\", path]);\n}\n";

    let found = violations(source);

    assert_eq!(found.len(), 1);
    assert_eq!(found[0].line, 2);
}

#[test]
fn a_hand_spelled_protocol_whitelist_is_reported() {
    let source = "cmd.args([\"-protocol_whitelist\", \"file\"]);";

    let found = violations(source);

    assert_eq!(found.len(), 1);
}

#[test]
fn an_ffprobe_run_that_skips_the_helper_is_reported_at_its_line() {
    let source = "fn probe(path: &Path) {\n    Command::new(\"ffprobe\")\n        .arg(path)\n        .output();\n}\n";

    let found = violations(source);

    assert_eq!(found.len(), 1);
    assert_eq!(found[0].line, 2);
}

#[test]
fn an_ffprobe_run_that_names_its_input_through_the_helper_passes() {
    let source = "Command::new(\"ffprobe\").args(input::file(path)).output();";

    assert!(violations(source).is_empty());
}

#[test]
fn asking_ffprobe_for_its_version_needs_no_input() {
    let source = "Command::new(\"ffprobe\").arg(\"-version\").output();";

    assert!(violations(source).is_empty());
}

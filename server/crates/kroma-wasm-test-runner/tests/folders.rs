#![cfg(unix)]

use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use kroma_testing::TempDir;

const BEHIND_THE_LINK: &str = "tests::a_folder_behind_an_absolute_symlink_lists_its_files";
const SCRATCH: &str = "tests::the_scratch_dir_keeps_what_a_test_writes";

struct ModuleRoot {
    dir: TempDir,
}

impl ModuleRoot {
    fn with_a_folder_behind_an_absolute_symlink() -> Self {
        let dir = kroma_testing::temp_dir("wasm-runner-folders");
        let real = dir.path().join("real");
        std::fs::create_dir_all(dir.path().join("server")).unwrap();
        std::fs::create_dir_all(&real).unwrap();
        std::fs::write(real.join("episode.mkv"), b"").unwrap();
        std::os::unix::fs::symlink(&real, dir.path().join("through-link")).unwrap();
        Self { dir }
    }

    fn crate_dir(&self) -> PathBuf {
        self.dir.path().join("server")
    }
}

fn guest_test_binary(target: Option<&str>) -> PathBuf {
    let guest = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/folders_guest");
    let mut cargo = kroma_testing::cargo();
    cargo
        .args(["test", "--no-run", "--message-format=json"])
        .current_dir(&guest)
        .env(
            "CARGO_TARGET_DIR",
            Path::new(env!("CARGO_TARGET_TMPDIR")).join("folders_guest"),
        );
    if let Some(target) = target {
        cargo.args(["--target", target]);
    }
    let out = cargo.output().expect("run cargo");
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .find_map(|message| message["executable"].as_str().map(PathBuf::from))
        .expect("cargo built a test binary")
}

fn natively(root: &ModuleRoot, test: &str) -> Output {
    Command::new(guest_test_binary(None))
        .args([test, "--exact"])
        .env("CARGO_MANIFEST_DIR", root.crate_dir())
        .output()
        .expect("run the native test binary")
}

fn as_a_component(root: &ModuleRoot, test: &str) -> Output {
    Command::new(env!("CARGO_BIN_EXE_kroma-wasm-test-runner"))
        .arg(guest_test_binary(Some("wasm32-wasip2")))
        .args([test, "--exact"])
        .env("CARGO_MANIFEST_DIR", root.crate_dir())
        .output()
        .expect("run the runner")
}

fn report(out: &Output) -> String {
    format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    )
}

#[test]
fn a_native_test_lists_a_folder_behind_an_absolute_symlink() {
    let root = ModuleRoot::with_a_folder_behind_an_absolute_symlink();

    let out = natively(&root, BEHIND_THE_LINK);

    let report = report(&out);
    assert!(out.status.success(), "{report}");
    assert!(report.contains("1 passed"), "{report}");
}

#[test]
fn the_same_test_fails_in_a_component_where_wasi_refuses_an_absolute_symlink() {
    let root = ModuleRoot::with_a_folder_behind_an_absolute_symlink();

    let out = as_a_component(&root, BEHIND_THE_LINK);

    let report = report(&out);
    assert!(!out.status.success(), "{report}");
    assert!(
        report.contains(&format!("{BEHIND_THE_LINK} ...")),
        "{report}"
    );
    assert!(report.contains("PermissionDenied"), "{report}");
}

#[test]
fn a_component_test_writes_in_a_scratch_dir_of_its_own() {
    let root = ModuleRoot::with_a_folder_behind_an_absolute_symlink();

    let out = as_a_component(&root, SCRATCH);

    let report = report(&out);
    assert!(out.status.success(), "{report}");
    assert!(report.contains("1 passed"), "{report}");
}

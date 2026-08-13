//! Where a module came from, and whether the binary it is running is still the
//! one it was installed with. The second half is what makes a dev loop legible:
//! a locally rebuilt sidecar must not look like the published artifact.

use std::path::Path;
use std::time::SystemTime;

use kroma_module_supervisor::{Supervisor, SupervisorConfig};

fn supervisor(dir: &Path) -> std::sync::Arc<Supervisor> {
    Supervisor::new(SupervisorConfig {
        modules_dir: dir.to_path_buf(),
        core_url: "http://127.0.0.1:0".into(),
        host_token: "t".into(),
        db_path: dir.join("db.sqlite"),
        data_dir: dir.to_path_buf(),
        reserved_ids: Vec::new(),
        server_version: "0.1.4".into(),
        log_line: None,
    })
}

// A module directory as an install leaves it: manifest, binary, and an origin
// record stamped with THAT binary, which is what a real install writes.
fn install_module(dir: &Path, id: &str, kind: Option<&str>) {
    let module_dir = dir.join(id);
    std::fs::create_dir_all(&module_dir).unwrap();
    std::fs::write(module_dir.join("module.json"), format!(r#"{{"id":"{id}","version":"1.0.0"}}"#))
        .unwrap();
    let bin = module_dir.join("module");
    std::fs::write(&bin, b"#!/bin/sh\nsleep 1\n").unwrap();
    let Some(kind) = kind else { return };
    let meta = std::fs::metadata(&bin).unwrap();
    let mtime = meta.modified().unwrap().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_secs();
    std::fs::write(
        module_dir.join("origin.json"),
        format!(
            r#"{{"kind":"{kind}","url":"https://r.example/{id}.kmod","installedAt":{mtime},"bin":{{"size":{},"mtime":{mtime}}},"localBuild":false}}"#,
            meta.len()
        ),
    )
    .unwrap();
}

#[test]
fn a_module_installed_from_a_registry_reports_that_registry() {
    let dir = kroma_testing::temp_dir("origin-registry");
    install_module(dir.path(), "tv.example.one", Some("registry"));

    let origin = supervisor(dir.path()).origin("tv.example.one");
    assert_eq!(origin.kind, "registry");
    assert_eq!(origin.url.as_deref(), Some("https://r.example/tv.example.one.kmod"));
    assert!(!origin.local_build, "an untouched install is not a local build");
}

#[test]
fn an_install_that_predates_origin_tracking_reports_unknown() {
    let dir = kroma_testing::temp_dir("origin-legacy");
    install_module(dir.path(), "tv.example.legacy", None);

    let origin = supervisor(dir.path()).origin("tv.example.legacy");
    assert_eq!(origin.kind, "unknown");
    assert_eq!(origin.url, None);
    // Nothing to compare the binary against, so it is not claimed to be local.
    assert!(!origin.local_build);
}

#[test]
fn a_binary_swapped_after_the_install_is_flagged_as_a_local_build() {
    // The dev loop: `modules watch` rebuilds and writes the binary in place, so
    // the running sidecar is NOT the artifact this module was installed from.
    let dir = kroma_testing::temp_dir("origin-local");
    install_module(dir.path(), "tv.example.dev", Some("registry"));
    // What `modules watch` does: a different binary, written in place.
    std::fs::write(
        dir.path().join("tv.example.dev/module"),
        b"#!/bin/sh\nsleep 2\necho rebuilt\n",
    )
    .unwrap();

    let origin = supervisor(dir.path()).origin("tv.example.dev");
    assert_eq!(origin.kind, "registry", "the source it came from does not change");
    assert!(origin.local_build, "a rebuilt binary must be visible as a local build");
}

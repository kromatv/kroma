//! Integration tests for the supervisor's install path: the `engines`
//! compatibility gate and the download checksum verifier. Bundles are built
//! in-memory as raw tars (the installer accepts zstd / gzip / raw, dispatched
//! by magic bytes) and use `library: true` manifests so nothing is spawned.

use kroma_module_supervisor::{verify_sha256, Supervisor, SupervisorConfig};

// The contract THIS build speaks, so a bump to it does not read as four broken
// tests: only the two that are deliberately about an older bundle spell a
// version of their own.
fn current(body: &str) -> String {
    format!(
        r#"{{ "schemaVersion": {}, {body} }}"#,
        kroma_module_manifest::MODULE_SCHEMA_VERSION
    )
}

fn tar_with_manifest(manifest: &str) -> Vec<u8> {
    let mut builder = tar::Builder::new(Vec::new());
    let bytes = manifest.as_bytes();
    let mut header = tar::Header::new_gnu();
    header.set_size(bytes.len() as u64);
    header.set_mode(0o644);
    header.set_cksum();
    builder.append_data(&mut header, "module.json", bytes).unwrap();
    builder.into_inner().unwrap()
}

fn temp_modules_dir(tag: &str) -> kroma_testing::TempDir {
    kroma_testing::temp_dir(&format!("sup-{tag}"))
}

fn supervisor(dir: &std::path::Path, server_version: &str) -> std::sync::Arc<Supervisor> {
    Supervisor::new(SupervisorConfig {
        modules_dir: dir.to_path_buf(),
        core_url: "http://127.0.0.1:0".into(),
        host_token: "t".into(),
        db_path: dir.join("db.sqlite"),
        data_dir: dir.to_path_buf(),
        reserved_ids: vec!["tv.kroma.reserved".into()],
        server_version: server_version.into(),
        log_line: None,
    })
}

#[test]
fn install_rejects_a_module_needing_a_newer_server() {
    let scratch = temp_modules_dir("gate");
    let dir = scratch.path();
    let sup = supervisor(dir, "0.1.4");
    let bundle = tar_with_manifest(&current(
        r#""id": "com.example.demo", "name": "Demo", "version": "1.0.0",
             "engines": { "server": ">=999.0.0" }, "library": true"#,
    ));
    let err = sup.install(&bundle, None, ("upload", None)).unwrap_err().to_string();
    assert!(err.contains("requires server >=999.0.0"), "unexpected error: {err}");
    assert!(sup.installed_ids().is_empty());
}

#[test]
fn install_accepts_a_satisfied_engine_range() {
    let scratch = temp_modules_dir("ok");
    let dir = scratch.path();
    let sup = supervisor(dir, "0.1.4");
    let bundle = tar_with_manifest(&current(
        r#""id": "com.example.demo", "name": "Demo", "version": "1.0.0",
             "engines": { "server": ">=0.1.0" }, "library": true"#,
    ));
    let manifest = sup.install(&bundle, None, ("upload", None)).unwrap();
    assert_eq!(manifest.id, "com.example.demo");
    assert_eq!(sup.installed_ids(), vec!["com.example.demo".to_string()]);
}

#[test]
fn install_still_rejects_reserved_ids() {
    let scratch = temp_modules_dir("reserved");
    let dir = scratch.path();
    let sup = supervisor(dir, "0.1.4");
    let bundle = tar_with_manifest(&current(
        r#""id": "tv.kroma.reserved", "name": "Shadow", "version": "1.0.0",
             "library": true"#,
    ));
    let err = sup.install(&bundle, None, ("upload", None)).unwrap_err().to_string();
    assert!(err.contains("built into this server"), "unexpected error: {err}");
}

#[test]
fn install_refuses_an_engine_this_server_cannot_check() {
    let scratch = temp_modules_dir("engine");
    let dir = scratch.path();
    let sup = supervisor(dir, "0.1.4");
    // Ignoring it would install a module onto a host that cannot run it.
    let bundle = tar_with_manifest(&current(
        r#""id": "com.example.demo", "name": "Demo", "version": "1.0.0",
             "engines": { "ffmpeg": ">=6" }, "library": true"#,
    ));
    let err = sup.install(&bundle, None, ("upload", None)).unwrap_err().to_string();
    assert!(err.contains("cannot check"), "unexpected error: {err}");
    assert!(err.contains("ffmpeg"), "unexpected error: {err}");
}

#[test]
fn install_refuses_a_bundle_built_for_another_manifest_contract() {
    let scratch = temp_modules_dir("api");
    let dir = scratch.path();
    let sup = supervisor(dir, "0.1.4");
    // No apiVersion at all: every bundle that predates the field, which is the
    // shape whose dependencies would otherwise read as empty.
    let bundle = tar_with_manifest(
        r#"{ "id": "com.example.demo", "name": "Demo", "version": "1.0.0", "library": true }"#,
    );
    let err = sup.install(&bundle, None, ("upload", None)).unwrap_err().to_string();
    assert!(err.contains("manifest schema v0"), "unexpected error: {err}");
    assert!(err.contains("rebuild"), "the error must say what to do: {err}");
    assert!(sup.installed_ids().is_empty(), "nothing is unpacked");
}

#[test]
fn install_reports_an_id_mismatch_before_the_contract_it_was_built_against() {
    let scratch = temp_modules_dir("id-first");
    let dir = scratch.path();
    let sup = supervisor(dir, "0.1.4");
    // Old AND shipped under someone else's id: the id is the security answer, so
    // that is the one the operator is told.
    let bundle = tar_with_manifest(
        r#"{ "id": "com.example.other", "name": "Other", "version": "1.0.0", "library": true }"#,
    );
    let err =
        sup.install(&bundle, Some("com.example.demo"), ("registry", None)).unwrap_err().to_string();
    assert!(err.contains("offered as"), "unexpected error: {err}");
}

#[test]
fn checksum_verification_accepts_match_and_rejects_mismatch() {
    // sha256("kroma") both cases must pass; a different hash must refuse.
    let bytes = b"kroma";
    let good = "04e7f91f56724ce2d4c6334793cd57a03d1d886d7bdf62146e39ea8aba148f5b";
    assert!(verify_sha256(bytes, good).is_ok());
    assert!(verify_sha256(bytes, &good.to_uppercase()).is_ok());
    let err = verify_sha256(bytes, "deadbeef").unwrap_err().to_string();
    assert!(err.contains("checksum mismatch"), "unexpected error: {err}");
}

#[test]
fn upgrading_a_module_keeps_the_database_it_owns() {
    let scratch = temp_modules_dir("keep-store");
    let dir = scratch.path();
    let sup = supervisor(dir, "0.1.4");
    let bundle = |version: &str| {
        tar_with_manifest(&current(&format!(
            r#""id": "com.example.demo", "name": "Demo", "version": "{version}",
                 "storage": {{}}, "library": true"#
        )))
    };

    sup.install(&bundle("1.0.0"), None, ("upload", None)).unwrap();
    let store = dir.join("com.example.demo").join("module.sqlite");
    std::fs::write(&store, b"the module's own rows").unwrap();
    sup.install(&bundle("2.0.0"), None, ("upload", None)).unwrap();

    assert_eq!(std::fs::read(&store).unwrap(), b"the module's own rows");
    assert_eq!(sup.installed_manifests()[0].version, "2.0.0");
}

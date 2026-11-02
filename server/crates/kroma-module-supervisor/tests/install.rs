//! Integration tests for the supervisor's install path: the `engines`
//! compatibility gate and the download checksum verifier. Bundles are built
//! in-memory as raw tars (the installer accepts zstd / gzip / raw, dispatched
//! by magic bytes) and use `library: true` manifests so nothing is spawned.

use kroma_module_supervisor::{Accept, Source, verify_sha256};

mod install_support;

use install_support::{current, supervisor, tar_with_manifest, temp_modules_dir, uploaded};

#[test]
fn install_rejects_a_module_needing_a_newer_server() {
    let scratch = temp_modules_dir("gate");
    let dir = scratch.path();
    let sup = supervisor(dir, "0.1.4");
    let bundle = tar_with_manifest(&current(
        r#""id": "com.example.demo", "name": "Demo", "version": "1.0.0",
             "engines": { "server": ">=999.0.0" }, "library": true"#,
    ));
    let err = sup
        .install(&bundle, None, uploaded())
        .unwrap_err()
        .to_string();
    assert!(
        err.contains("requires server >=999.0.0"),
        "unexpected error: {err}"
    );
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
    let manifest = sup.install(&bundle, None, uploaded()).unwrap();
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
    let err = sup
        .install(&bundle, None, uploaded())
        .unwrap_err()
        .to_string();
    assert!(
        err.contains("built into this server"),
        "unexpected error: {err}"
    );
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
    let err = sup
        .install(&bundle, None, uploaded())
        .unwrap_err()
        .to_string();
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
    let err = sup
        .install(&bundle, None, uploaded())
        .unwrap_err()
        .to_string();
    assert!(
        err.contains("manifest schema v0"),
        "unexpected error: {err}"
    );
    assert!(
        err.contains("rebuild"),
        "the error must say what to do: {err}"
    );
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
    let err = sup
        .install(
            &bundle,
            Some("com.example.demo"),
            Source {
                kind: "registry",
                url: None,
                official: true,
                accept: Accept::Anything,
            },
        )
        .unwrap_err()
        .to_string();
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

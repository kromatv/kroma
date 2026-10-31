use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

use serde_json::json;
use sha2::{Digest, Sha256};

use super::*;
use crate::services::updates::{
    auto_install, install, recover, status, Channel, Target, AUTO_INSTALL_KEY, OPERATION_KEY,
};
use crate::test_support::{serve_bytes, test_state, test_state_as_package};

const BUILD: u64 = 3_600_000;

fn tar_of(files: &[(&str, &[u8], u32)]) -> Vec<u8> {
    let mut archive = tar::Builder::new(Vec::new());
    for (path, bytes, mode) in files {
        let mut header = tar::Header::new_gnu();
        header.set_size(bytes.len() as u64);
        header.set_mode(*mode);
        header.set_cksum();
        archive.append_data(&mut header, path, *bytes).unwrap();
    }
    archive.into_inner().unwrap()
}

fn spk(payload: &[(&str, &[u8], u32)]) -> Vec<u8> {
    let options = lzma_rust2::XzOptions::with_preset(1);
    let mut xz = lzma_rust2::XzWriter::new(Vec::new(), options).unwrap();
    std::io::Write::write_all(&mut xz, &tar_of(payload)).unwrap();
    let compressed = xz.finish().unwrap();
    tar_of(&[
        ("INFO", b"package=\"kroma\"\n", 0o644),
        ("package.tgz", &compressed, 0o644),
    ])
}

fn server_package() -> Vec<u8> {
    spk(&[
        ("./bin/kroma-server", b"#!/bin/sh\n", 0o755),
        ("./web/_shell.html", b"<html></html>", 0o644),
    ])
}

fn written(name: &str, bytes: &[u8]) -> (kroma_testing::TempDir, std::path::PathBuf) {
    let dir = kroma_testing::temp_dir("server-package");
    let path = dir.path().join(name);
    std::fs::write(&path, bytes).unwrap();
    (dir, path)
}

fn feed(package: Vec<u8>, digest: String) -> String {
    let name = format!("kroma-999.0.0.{BUILD}-{}.spk", std::env::consts::ARCH);
    let base = Arc::new(OnceLock::<String>::new());
    let known = Arc::clone(&base);
    let (url, _) = serve_bytes(move |path| {
        let base = known.get().unwrap();
        if path == format!("/download/{name}") {
            return (200, package.clone());
        }
        if path != "/latest" && path != "/tags/v999.0.0" {
            return (404, b"{}".to_vec());
        }
        let release = json!({
            "tag_name": "v999.0.0",
            "html_url": "https://github.com/kromatv/kroma/releases/tag/v999.0.0",
            "assets": [{
                "name": name,
                "browser_download_url": format!("{base}/download/{name}"),
                "digest": format!("sha256:{digest}"),
            }],
        });
        (200, release.to_string().into_bytes())
    });
    base.set(url.clone()).unwrap();
    url
}

fn published(package: Vec<u8>) -> String {
    let digest = hex::encode(Sha256::digest(&package));
    feed(package, digest)
}

fn target() -> Target {
    Target {
        channel: Channel::Stable,
        version: "999.0.0".into(),
        build: BUILD,
    }
}

fn settled(state: &SharedState) -> Operation {
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        let op = status(state).operation.unwrap();
        if !matches!(op.phase.as_str(), "preparing" | "installing") || Instant::now() > deadline {
            return op;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

fn releases(state: &SharedState) -> &Path {
    state.config.self_update_dir.as_deref().unwrap()
}

#[test]
fn a_package_unpacks_its_payload_with_the_server_executable() {
    let (dir, spk) = written("kroma.spk", &server_package());

    let unpacked = unpack(&spk, &dir.path().join("payload")).unwrap();

    assert!(is_payload(&unpacked));
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let server = std::fs::metadata(unpacked.join("bin/kroma-server")).unwrap();
        assert_eq!(server.permissions().mode() & 0o777, 0o755);
    }
}

#[test]
fn a_package_whose_payload_has_no_web_app_is_refused() {
    let (dir, spk) = written("kroma.spk", &spk(&[("./bin/kroma-server", b"x", 0o755)]));

    let unpacked = unpack(&spk, &dir.path().join("payload"));

    assert!(unpacked.unwrap_err().to_string().contains("no web app"));
}

#[test]
fn a_package_with_no_payload_is_refused() {
    let (dir, spk) = written("kroma.spk", &tar_of(&[("INFO", b"package", 0o644)]));

    let unpacked = unpack(&spk, &dir.path().join("payload"));

    assert!(unpacked.unwrap_err().to_string().contains("no payload"));
}

#[test]
fn a_package_is_checked_against_its_published_digest() {
    let bytes = server_package();
    let (_dir, spk) = written("kroma.spk", &bytes);

    let good = verify(&spk, &hex::encode(Sha256::digest(&bytes)));
    let bad = verify(&spk, &"0".repeat(64));

    assert!(good.is_ok());
    assert!(bad.unwrap_err().to_string().contains("checksum"));
}

#[test]
fn only_the_synology_package_updates_itself() {
    let package = test_state_as_package(&published(server_package()));
    let other = test_state();

    assert!(status(&package).installer.ready);
    assert!(!status(&other).installer.ready);
}

#[test]
fn the_package_installs_automatically_until_the_owner_says_otherwise() {
    let state = test_state_as_package(&published(server_package()));
    assert!(auto_install(&state));

    state.settings.set_patch(
        &state.db,
        [(AUTO_INSTALL_KEY.to_owned(), json!(false))].into(),
    );

    assert!(!auto_install(&state));
}

#[test]
fn an_update_unpacks_the_reviewed_build_beside_the_package_and_restarts() {
    let state = test_state_as_package(&published(server_package()));

    install(&state, target()).unwrap();
    let op = settled(&state);

    assert_eq!(op.phase, "restarting", "{:?}", op.message);
    assert!(is_payload(&releases(&state).join(BUILD.to_string())));
    assert!(!releases(&state)
        .join(format!("{BUILD}.spk.partial"))
        .exists());
    assert!(restart_requested());
}

#[test]
fn a_package_that_does_not_match_its_digest_never_reaches_the_service_script() {
    let state = test_state_as_package(&feed(server_package(), "0".repeat(64)));

    install(&state, target()).unwrap();
    let op = settled(&state);

    assert_eq!(op.phase, "failed");
    assert!(op.message.unwrap().contains("checksum"));
    let left: Vec<_> = std::fs::read_dir(releases(&state)).unwrap().collect();
    assert!(left.is_empty());
}

#[test]
fn a_restart_that_came_back_on_the_previous_build_is_reported() {
    let state = test_state_as_package(&published(server_package()));
    let op = json!({
        "id": "restarted", "target": target(), "phase": "restarting",
        "message": null, "requestedAt": "2026-10-31T12:00:00Z", "automatic": true,
    });
    state
        .settings
        .set_internal(&state.db, OPERATION_KEY, op)
        .unwrap();

    recover(&state).unwrap();

    let op = status(&state).operation.unwrap();
    assert_eq!(op.phase, "failed");
    assert!(op.message.unwrap().contains("previous build"));
}

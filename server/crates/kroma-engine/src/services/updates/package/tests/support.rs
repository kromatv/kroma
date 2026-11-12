use std::path::Path;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

use serde_json::json;
use sha2::{Digest, Sha256};

use super::super::Operation;
use crate::services::updates::{status, Channel, Target};
use crate::state::SharedState;
use crate::test_support::serve_bytes;

pub(super) const BUILD: u64 = 3_600_000;

pub(super) fn tar_of(files: &[(&str, &[u8], u32)]) -> Vec<u8> {
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

pub(super) fn spk(payload: &[(&str, &[u8], u32)]) -> Vec<u8> {
    let options = lzma_rust2::XzOptions::with_preset(1);
    let mut xz = lzma_rust2::XzWriter::new(Vec::new(), options).unwrap();
    std::io::Write::write_all(&mut xz, &tar_of(payload)).unwrap();
    let compressed = xz.finish().unwrap();
    tar_of(&[
        ("INFO", b"package=\"kroma\"\n", 0o644),
        ("package.tgz", &compressed, 0o644),
    ])
}

pub(super) fn server_package() -> Vec<u8> {
    spk(&[
        ("./bin/kroma-server", b"#!/bin/sh\n", 0o755),
        ("./web/_shell.html", b"<html></html>", 0o644),
    ])
}

pub(super) fn written(name: &str, bytes: &[u8]) -> (kroma_testing::TempDir, std::path::PathBuf) {
    let dir = kroma_testing::temp_dir("server-package");
    let path = dir.path().join(name);
    std::fs::write(&path, bytes).unwrap();
    (dir, path)
}

pub(super) fn feed(package: Vec<u8>, digest: String) -> String {
    let name = format!("kroma-999.0.0.{BUILD}-{}.spk", std::env::consts::ARCH);
    let base = Arc::new(OnceLock::<String>::new());
    let known = Arc::clone(&base);
    let (url, _) = serve_bytes(move |path| {
        let base = known.get().unwrap();
        if path == format!("/download/{name}") {
            return (200, package.clone());
        }
        if !["/latest", "/tags/v999.0.0", "/tags/canary"].contains(&path) {
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

pub(super) fn published(package: Vec<u8>) -> String {
    let digest = hex::encode(Sha256::digest(&package));
    feed(package, digest)
}

pub(super) fn target() -> Target {
    Target {
        channel: Channel::Stable,
        version: "999.0.0".into(),
        build: BUILD,
    }
}

pub(super) fn settled(state: &SharedState) -> Operation {
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        let op = status(state).operation.unwrap();
        if !matches!(op.phase.as_str(), "preparing" | "installing") || Instant::now() > deadline {
            return op;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

pub(super) fn releases(state: &SharedState) -> &Path {
    state.config.self_update_dir.as_deref().unwrap()
}

pub(super) fn operation(automatic: bool) -> Operation {
    Operation {
        id: "next".into(),
        target: target(),
        phase: "preparing".into(),
        message: None,
        requested_at: "2026-10-31T12:00:00Z".into(),
        automatic,
    }
}

pub(super) fn someone_watches(state: &SharedState) {
    state.playback.upsert(
        crate::services::playback::Ping {
            session_id: "watching".into(),
            item_id: "movie".into(),
            position_ms: 0,
            duration_ms: None,
            state: "playing".into(),
            mode: "direct".into(),
            player: "web".into(),
            device: "browser".into(),
            audio: None,
            subtitle: None,
        },
        None,
        "viewer".into(),
        "127.0.0.1".into(),
        "LAN".into(),
        None,
    );
}

pub(super) fn unpacked(state: &SharedState) {
    let payload = releases(state).join(BUILD.to_string());
    std::fs::create_dir_all(payload.join("bin")).unwrap();
    std::fs::create_dir_all(payload.join("web")).unwrap();
    std::fs::write(payload.join("bin/kroma-server"), b"#!/bin/sh\n").unwrap();
    std::fs::write(payload.join("web/_shell.html"), b"<html></html>").unwrap();
}

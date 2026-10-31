use std::sync::Arc;
use std::time::Duration;

use sha2::{Digest, Sha256};

use super::super::*;
use super::support::*;
use crate::test_support::serve_bytes;

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
fn a_payload_left_by_an_earlier_attempt_is_replaced() {
    let (dir, spk) = written("kroma.spk", &server_package());
    let into = dir.path().join("payload");
    std::fs::create_dir_all(into.join("stale")).unwrap();

    let unpacked = unpack(&spk, &into).unwrap();

    assert!(is_payload(&unpacked));
    assert!(!into.join("stale").exists());
}

#[test]
fn a_package_the_host_does_not_serve_fails_the_download() {
    let (base, _) = serve_bytes(|_| (404, b"{}".to_vec()));
    let dir = kroma_testing::temp_dir("server-package");

    let fetched = download(&format!("{base}/kroma.spk"), &dir.path().join("kroma.spk"));

    assert!(fetched.unwrap_err().to_string().contains("download failed"));
}

#[test]
fn only_the_official_releases_host_a_package_from_the_official_feed() {
    let release = format!("{OFFICIAL_DOWNLOADS}v0.1.39/kroma-0.1.39.3592000-x86_64.spk");

    let elsewhere = official(None, "https://example.com/kroma.spk");
    let published = official(None, &release);
    let own_feed = official(Some("http://127.0.0.1:9"), "http://127.0.0.1:9/kroma.spk");

    assert!(elsewhere.unwrap_err().to_string().contains("official"));
    assert!(published.is_ok());
    assert!(own_feed.is_ok());
}

#[tokio::test]
async fn a_restart_wakes_whoever_waits_for_it_and_whoever_comes_later() {
    let restart = Arc::new(Restart::default());
    let waiting = tokio::spawn({
        let restart = Arc::clone(&restart);
        async move { restart.wait().await }
    });
    tokio::task::yield_now().await;

    restart.request();

    tokio::time::timeout(Duration::from_secs(5), waiting)
        .await
        .unwrap()
        .unwrap();
    tokio::time::timeout(Duration::from_secs(5), restart.wait())
        .await
        .unwrap();
    assert!(restart.requested());
}

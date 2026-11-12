use std::collections::BTreeMap;

use super::super::tests::gateway;
use super::*;

const PROGRAM: &str = "bridge";
const MEMBER: &str = "wireproxy";
const BUILD: &[u8] = b"#!/bin/sh\nexit 0\n";
const FORGED: &[u8] = b"#!/bin/sh\nexit 1\n";

fn gzipped_tar(member: &str, bytes: &[u8]) -> Vec<u8> {
    let mut header = tar::Header::new_gnu();
    header.set_size(bytes.len() as u64);
    header.set_mode(0o755);
    let gzip = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    let mut builder = tar::Builder::new(gzip);
    builder
        .append_data(&mut header, format!("release/{member}"), bytes)
        .unwrap();
    builder.into_inner().unwrap().finish().unwrap()
}

fn pinned_to(download: &[u8], member: Option<&str>) -> HelperAsset {
    HelperAsset {
        url: "http://127.0.0.1:9/".to_string(),
        sha256: hex::encode(Sha256::digest(download)),
        member: member.map(ToString::to_string),
    }
}

fn helpers_dir(dir: &Path) -> PathBuf {
    dir.join("helpers")
}

fn pinning(dir: &Path, asset: &HelperAsset) -> Programs {
    std::fs::create_dir_all(helpers_dir(dir)).unwrap();
    Programs::new(
        "tv.example",
        dir.to_path_buf(),
        helpers_dir(dir),
        vec![PROGRAM.to_string()],
        BTreeMap::from([(
            PROGRAM.to_string(),
            Helper {
                assets: BTreeMap::from([(platform(), asset.clone())]),
            },
        )]),
        gateway(),
        true,
    )
}

fn downloaded(dir: &Path, bytes: &[u8]) {
    std::fs::write(helpers_dir(dir).join(format!("{PROGRAM}.download")), bytes).unwrap();
}

fn downloaded_and_installed(dir: &Path, bytes: &[u8], asset: &HelperAsset) {
    let programs = pinning(dir, asset);
    downloaded(dir, bytes);
    programs.install(PROGRAM, asset).unwrap();
}

fn left_in_helpers(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(helpers_dir(dir))
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

#[test]
fn a_helper_unpacked_from_its_pinned_archive_starts() {
    let dir = kroma_testing::temp_dir("fetch-archived");
    let archive = gzipped_tar(MEMBER, BUILD);
    let asset = pinned_to(&archive, Some(MEMBER));
    let programs = pinning(dir.path(), &asset);
    downloaded(dir.path(), &archive);
    programs.install(PROGRAM, &asset).unwrap();

    let resolved = programs.resolve(PROGRAM);

    assert_eq!(std::fs::read(resolved.unwrap()).unwrap(), BUILD);
}

#[test]
fn an_installed_archived_helper_is_not_fetched_again() {
    let dir = kroma_testing::temp_dir("fetch-kept");
    let archive = gzipped_tar(MEMBER, BUILD);
    let asset = pinned_to(&archive, Some(MEMBER));
    downloaded_and_installed(dir.path(), &archive, &asset);
    let programs = pinning(dir.path(), &asset);

    let fetched = programs.fetch_helper(PROGRAM, &asset);

    assert_eq!(fetched.unwrap(), helpers_dir(dir.path()).join(PROGRAM));
}

#[test]
fn a_bare_helper_download_starts_once_installed() {
    let dir = kroma_testing::temp_dir("fetch-bare");
    let asset = pinned_to(BUILD, None);
    let programs = pinning(dir.path(), &asset);
    downloaded(dir.path(), BUILD);
    programs.install(PROGRAM, &asset).unwrap();

    let resolved = programs.resolve(PROGRAM);

    assert_eq!(std::fs::read(resolved.unwrap()).unwrap(), BUILD);
}

#[test]
fn an_unpacked_helper_whose_bytes_changed_does_not_start() {
    let dir = kroma_testing::temp_dir("fetch-changed");
    let archive = gzipped_tar(MEMBER, BUILD);
    let asset = pinned_to(&archive, Some(MEMBER));
    let programs = pinning(dir.path(), &asset);
    downloaded(dir.path(), &archive);
    programs.install(PROGRAM, &asset).unwrap();
    std::fs::write(helpers_dir(dir.path()).join(PROGRAM), FORGED).unwrap();

    let resolved = programs.resolve(PROGRAM);

    assert!(resolved.unwrap_err().contains("no longer matches"));
}

#[test]
fn an_unpacked_helper_with_no_archive_beside_it_does_not_start() {
    let dir = kroma_testing::temp_dir("fetch-no-archive");
    let asset = pinned_to(&gzipped_tar(MEMBER, BUILD), Some(MEMBER));
    let programs = pinning(dir.path(), &asset);
    std::fs::write(helpers_dir(dir.path()).join(PROGRAM), BUILD).unwrap();

    let resolved = programs.resolve(PROGRAM);

    assert!(resolved.unwrap_err().contains("no longer matches"));
}

#[test]
fn a_helper_unpacked_from_an_archive_the_manifest_does_not_pin_does_not_start() {
    let dir = kroma_testing::temp_dir("fetch-forged");
    let forged = gzipped_tar(MEMBER, FORGED);
    let forged_pin = pinned_to(&forged, Some(MEMBER));
    downloaded_and_installed(dir.path(), &forged, &forged_pin);
    let programs = pinning(
        dir.path(),
        &pinned_to(&gzipped_tar(MEMBER, BUILD), Some(MEMBER)),
    );

    let resolved = programs.resolve(PROGRAM);

    assert!(resolved.unwrap_err().contains("no longer matches"));
}

#[test]
fn a_download_that_does_not_match_its_pin_is_not_installed() {
    let dir = kroma_testing::temp_dir("fetch-mismatch");
    let asset = pinned_to(&gzipped_tar(MEMBER, BUILD), Some(MEMBER));
    let programs = pinning(dir.path(), &asset);
    downloaded(dir.path(), &gzipped_tar(MEMBER, FORGED));

    let installed = programs.install(PROGRAM, &asset);

    assert!(
        installed
            .unwrap_err()
            .contains("does not match its pinned sha256")
    );
    assert_eq!(left_in_helpers(dir.path()), Vec::<String>::new());
}

#[test]
fn an_archive_without_the_pinned_member_is_not_installed() {
    let dir = kroma_testing::temp_dir("fetch-no-member");
    let archive = gzipped_tar("something-else", BUILD);
    let asset = pinned_to(&archive, Some(MEMBER));
    let programs = pinning(dir.path(), &asset);
    downloaded(dir.path(), &archive);

    let installed = programs.install(PROGRAM, &asset);

    assert!(installed.unwrap_err().contains("holds no"));
    assert_eq!(left_in_helpers(dir.path()), Vec::<String>::new());
}

#[test]
fn a_helper_pinned_bare_after_an_archive_keeps_no_archive() {
    let dir = kroma_testing::temp_dir("fetch-now-bare");
    let archive = gzipped_tar(MEMBER, BUILD);
    downloaded_and_installed(dir.path(), &archive, &pinned_to(&archive, Some(MEMBER)));

    downloaded_and_installed(dir.path(), BUILD, &pinned_to(BUILD, None));

    assert_eq!(left_in_helpers(dir.path()), vec![PROGRAM.to_string()]);
}

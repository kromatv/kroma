use std::fs;
use std::path::Path;

use kroma_testing::TempDir;

use super::*;

struct Crate<'a> {
    name: &'a str,
    license: &'a str,
    repository: Option<&'a str>,
    file: Option<&'a str>,
}

fn package(root: &Path, spec: &Crate) -> serde_json::Value {
    let dir = root.join(spec.name);
    fs::create_dir_all(&dir).unwrap();
    if let Some(text) = spec.file {
        fs::write(dir.join("LICENSE"), text).unwrap();
    }
    serde_json::json!({
        "id": spec.name, "name": spec.name, "version": "1.0.0", "license": spec.license,
        "license_file": null, "repository": spec.repository, "homepage": null,
        "authors": ["Jane Doe <jane@example.com>"],
        "manifest_path": dir.join("Cargo.toml"), "source": "registry",
    })
}

fn world(specs: &[Crate]) -> (TempDir, Metadata) {
    let root = kroma_testing::temp_dir("notices");
    let mut packages = vec![serde_json::json!({
        "id": "app", "name": "app", "version": "0.1.0", "license": null,
        "license_file": null, "repository": null, "homepage": null,
        "manifest_path": root.path().join("Cargo.toml"), "source": null,
    })];
    packages.extend(specs.iter().map(|spec| package(root.path(), spec)));
    let deps: Vec<_> = specs
        .iter()
        .filter(|spec| !spec.name.starts_with("unlinked"))
        .map(|spec| serde_json::json!({ "pkg": spec.name, "dep_kinds": [{ "kind": null }] }))
        .collect();
    let metadata = serde_json::from_value(serde_json::json!({
        "packages": packages,
        "resolve": { "root": "app", "nodes": [{ "id": "app", "deps": deps }] },
    }))
    .unwrap();
    (root, metadata)
}

fn texts_of_entry(collected: &Collected, name: &str) -> Vec<String> {
    let entry = collected.manifest.entries.iter().find(|entry| entry.name == name).unwrap();
    entry.texts.iter().map(|index| collected.manifest.texts[*index].clone()).collect()
}

const WASMTIME: Option<&str> = Some("https://github.com/bytecodealliance/wasmtime");

#[test]
fn reads_a_crate_s_own_license_file() {
    let (_root, metadata) = world(&[Crate { name: "itoa", license: "MIT", repository: None, file: Some("itoa terms") }]);

    let collected = notices(&metadata);

    assert_eq!(texts_of_entry(&collected, "itoa"), vec!["itoa terms"]);
    assert!(collected.unresolved.is_empty());
}

#[test]
fn borrows_the_license_file_of_a_crate_from_the_same_repository() {
    let (_root, metadata) = world(&[
        Crate { name: "wasmtime-core", license: "Apache-2.0", repository: Some("https://github.com/bytecodealliance/wasmtime/tree/main/core"), file: None },
        Crate { name: "unlinked-wasmtime", license: "Apache-2.0", repository: WASMTIME, file: Some("wasmtime terms") },
    ]);

    let collected = notices(&metadata);

    assert_eq!(texts_of_entry(&collected, "wasmtime-core"), vec!["wasmtime terms"]);
}

#[test]
fn borrows_nothing_from_a_sibling_under_another_license() {
    let (_root, metadata) = world(&[
        Crate { name: "wasmtime-core", license: "MPL-2.0", repository: WASMTIME, file: None },
        Crate { name: "unlinked-wasmtime", license: "Apache-2.0", repository: WASMTIME, file: Some("wasmtime terms") },
    ]);

    let collected = notices(&metadata);

    assert!(texts_of_entry(&collected, "wasmtime-core")[0].starts_with("Mozilla Public License"));
}

#[test]
fn falls_back_to_the_spdx_text_naming_the_authors() {
    let (_root, metadata) = world(&[Crate { name: "realfft", license: "MIT", repository: None, file: None }]);

    let collected = notices(&metadata);

    assert!(texts_of_entry(&collected, "realfft")[0].contains("Copyright (c) Jane Doe"));
}

#[test]
fn names_a_crate_left_without_any_text() {
    let (_root, metadata) = world(&[Crate { name: "odd", license: "Beerware", repository: None, file: None }]);

    let collected = notices(&metadata);

    assert_eq!(collected.unresolved, vec!["odd 1.0.0"]);
    assert!(texts_of_entry(&collected, "odd").is_empty());
}

#[test]
fn keeps_only_a_web_address_as_the_source() {
    let (_root, metadata) = world(&[
        Crate { name: "linked", license: "MIT", repository: Some("https://github.com/a/linked"), file: Some("t") },
        Crate { name: "local", license: "MIT", repository: Some("git@github.com:a/local.git"), file: Some("t") },
    ]);

    let collected = notices(&metadata);

    let sources: Vec<Option<&str>> =
        collected.manifest.entries.iter().map(|entry| entry.source.as_deref()).collect();
    assert_eq!(sources, vec![Some("https://github.com/a/linked"), None]);
}

#[test]
fn reduces_a_github_address_to_its_repository() {
    let urls = ["https://github.com/Owner/Repo.git", "https://github.com/owner/repo/tree/main/sub/", "https://gitlab.com/owner/repo/"];

    let keys: Vec<String> = urls.iter().map(|url| repository_key(url)).collect();

    assert_eq!(keys, vec!["owner/repo", "owner/repo", "https://gitlab.com/owner/repo"]);
}

#[test]
fn explains_each_failure() {
    let errors = [
        Error::Io(std::io::Error::other("gone")),
        Error::Cargo("  error: no manifest\n".into()),
        Error::Json(serde_json::from_str::<u8>("x").unwrap_err()),
    ];

    let messages: Vec<String> = errors.iter().map(ToString::to_string).collect();

    assert_eq!(messages[0], "cargo could not run: gone");
    assert_eq!(messages[1], "cargo metadata failed: error: no manifest");
    assert!(messages[2].starts_with("cargo metadata answered unreadable JSON"));
}

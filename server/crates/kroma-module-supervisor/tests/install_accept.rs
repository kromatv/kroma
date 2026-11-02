mod install_support;

use install_support::{current, supervisor, tar_with_manifest, temp_modules_dir, uploaded};
use kroma_module_supervisor::{Accept, Source};

fn declaring(version: &str, permissions: &str) -> Vec<u8> {
    tar_with_manifest(&current(&format!(
        r#""id": "com.example.demo", "name": "Demo", "version": "{version}",
             "library": true, "permissions": {permissions}"#
    )))
}

fn offered(accept: Accept<'_>) -> Source<'_> {
    Source {
        kind: "registry",
        url: None,
        official: true,
        accept,
    }
}

const NARROW: &str = r#"{ "net": { "connect": [{ "purpose": "a", "to": ["api.example"] }] } }"#;
const WIDE: &str = r#"{ "net": { "connect": [{ "purpose": "a", "to": ["public"] }] } }"#;

#[test]
fn an_unattended_update_may_not_ask_for_more_than_is_installed() {
    let scratch = temp_modules_dir("accept-wider");
    let sup = supervisor(scratch.path(), "9.9.9");
    sup.install(&declaring("1.0.0", NARROW), None, uploaded()).unwrap();

    let updated = sup.install(&declaring("2.0.0", WIDE), None, offered(Accept::NoWider));

    assert!(updated.unwrap_err().to_string().contains("asks for more"));
    assert_eq!(sup.installed_manifests()[0].version, "1.0.0");
}

#[test]
fn an_unattended_update_that_asks_for_the_same_goes_through() {
    let scratch = temp_modules_dir("accept-same");
    let sup = supervisor(scratch.path(), "9.9.9");
    sup.install(&declaring("1.0.0", NARROW), None, uploaded()).unwrap();

    sup.install(&declaring("2.0.0", NARROW), None, offered(Accept::NoWider))
        .unwrap();

    assert_eq!(sup.installed_manifests()[0].version, "2.0.0");
}

#[test]
fn a_bundle_must_declare_what_its_catalog_row_showed() {
    let scratch = temp_modules_dir("accept-exact");
    let sup = supervisor(scratch.path(), "9.9.9");
    let shown: kroma_module_manifest::Permissions = serde_json::from_str(NARROW).unwrap();

    let installed = sup.install(&declaring("1.0.0", WIDE), None, offered(Accept::Exactly(&shown)));

    assert!(installed.unwrap_err().to_string().contains("catalog row"));
    assert!(sup.installed_manifests().is_empty());
}

#[test]
fn a_bundle_that_declares_what_its_catalog_row_showed_installs() {
    let scratch = temp_modules_dir("accept-exact-ok");
    let sup = supervisor(scratch.path(), "9.9.9");
    let shown: kroma_module_manifest::Permissions = serde_json::from_str(NARROW).unwrap();

    sup.install(&declaring("1.0.0", NARROW), None, offered(Accept::Exactly(&shown)))
        .unwrap();

    assert_eq!(sup.installed_manifests().len(), 1);
}

#[test]
fn inspecting_a_bundle_reads_what_it_declares_and_installs_nothing() {
    let scratch = temp_modules_dir("inspect");
    let sup = supervisor(scratch.path(), "9.9.9");

    let read = sup.inspect(&declaring("1.0.0", NARROW)).unwrap();

    assert_eq!(read.id, "com.example.demo");
    assert!(read.permissions.is_some());
    assert!(sup.installed_manifests().is_empty());
    let left: Vec<_> = std::fs::read_dir(scratch.path()).unwrap().collect();
    assert!(left.is_empty());
}

mod install_support;

use install_support::{current, supervisor, tar_with_manifest, temp_modules_dir, uploaded};
use kroma_module_manifest::{Declared, Permissions};
use kroma_module_supervisor::{Accept, AsksForMore, Source, INSTALLED_DIR};

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

fn writing(version: &str, keys: &str) -> Vec<u8> {
    tar_with_manifest(&current(&format!(
        r#""id": "com.example.demo", "name": "Demo", "version": "{version}",
             "library": true, "permissions": {NARROW},
             "settings": {{ "read": ["acqEnabled"], "write": {keys} }}"#
    )))
}

fn storing(core: &str) -> Vec<u8> {
    tar_with_manifest(&current(&format!(
        r#""id": "com.example.demo", "name": "Demo", "version": "1.0.0",
             "library": true, "permissions": {NARROW}, "storage": {{ "core": {core} }}"#
    )))
}

fn showing(permissions: &Permissions) -> Declared<'_> {
    Declared {
        permissions: Some(permissions),
        ..Declared::default()
    }
}

fn narrow() -> Permissions {
    serde_json::from_str(NARROW).unwrap()
}

const NARROW: &str = r#"{ "net": { "connect": [{ "purpose": "a", "to": ["api.example"] }] } }"#;
const WIDE: &str = r#"{ "net": { "connect": [{ "purpose": "a", "to": ["public"] }] } }"#;

#[test]
fn an_unattended_update_may_not_ask_for_more_than_is_installed() {
    let scratch = temp_modules_dir("accept-wider");
    let sup = supervisor(scratch.path(), "9.9.9");
    sup.install(&declaring("1.0.0", NARROW), None, uploaded()).unwrap();

    let updated = sup.install(&declaring("2.0.0", WIDE), None, offered(Accept::NoWider(None)));

    assert!(updated.unwrap_err().to_string().contains("asks for more"));
    assert_eq!(sup.installed_manifests()[0].version, "1.0.0");
}

#[test]
fn an_unattended_update_that_asks_for_the_same_goes_through() {
    let scratch = temp_modules_dir("accept-same");
    let sup = supervisor(scratch.path(), "9.9.9");
    sup.install(&declaring("1.0.0", NARROW), None, uploaded()).unwrap();

    sup.install(&declaring("2.0.0", NARROW), None, offered(Accept::NoWider(None)))
        .unwrap();

    assert_eq!(sup.installed_manifests()[0].version, "2.0.0");
}

#[test]
fn an_unattended_update_that_writes_a_new_setting_waits_for_the_install_plan() {
    let scratch = temp_modules_dir("accept-settings-wider");
    let sup = supervisor(scratch.path(), "9.9.9");
    sup.install(&writing("1.0.0", r#"["acqEnabled"]"#), None, uploaded()).unwrap();

    let updated = sup.install(
        &writing("2.0.0", r#"["acqEnabled", "namingMovieFolder"]"#),
        None,
        offered(Accept::NoWider(None)),
    );

    let refused = updated.unwrap_err();
    assert!(refused.downcast_ref::<AsksForMore>().is_some(), "{refused:#}");
    assert_eq!(sup.installed_manifests()[0].version, "1.0.0");
}

#[test]
fn an_unattended_update_that_writes_fewer_settings_goes_through() {
    let scratch = temp_modules_dir("accept-settings-narrower");
    let sup = supervisor(scratch.path(), "9.9.9");
    sup.install(&writing("1.0.0", r#"["acqEnabled", "namingMovieFolder"]"#), None, uploaded())
        .unwrap();

    sup.install(&writing("2.0.0", r#"["acqEnabled"]"#), None, offered(Accept::NoWider(None)))
        .unwrap();

    assert_eq!(sup.installed_manifests()[0].version, "2.0.0");
}

#[test]
fn an_unattended_update_still_says_what_its_catalog_row_showed() {
    let scratch = temp_modules_dir("accept-unattended-row");
    let sup = supervisor(scratch.path(), "9.9.9");
    sup.install(&declaring("1.0.0", WIDE), None, uploaded()).unwrap();
    let shown: Permissions = serde_json::from_str(WIDE).unwrap();

    let updated = sup.install(
        &declaring("2.0.0", NARROW),
        None,
        offered(Accept::NoWider(Some(showing(&shown)))),
    );

    assert!(updated.unwrap_err().to_string().contains("catalog row"));
    assert_eq!(sup.installed_manifests()[0].version, "1.0.0");
}

#[test]
fn a_bundle_must_declare_what_its_catalog_row_showed() {
    let scratch = temp_modules_dir("accept-exact");
    let sup = supervisor(scratch.path(), "9.9.9");
    let shown = narrow();

    let installed = sup.install(
        &declaring("1.0.0", WIDE),
        None,
        offered(Accept::Exactly(showing(&shown))),
    );

    assert!(installed.unwrap_err().to_string().contains("catalog row"));
    assert!(sup.installed_manifests().is_empty());
}

#[test]
fn a_bundle_that_declares_what_its_catalog_row_showed_installs() {
    let scratch = temp_modules_dir("accept-exact-ok");
    let sup = supervisor(scratch.path(), "9.9.9");
    let shown = narrow();

    sup.install(
        &declaring("1.0.0", NARROW),
        None,
        offered(Accept::Exactly(showing(&shown))),
    )
    .unwrap();

    assert_eq!(sup.installed_manifests().len(), 1);
}

#[test]
fn a_bundle_that_declares_storage_its_catalog_row_did_not_show_is_refused() {
    let scratch = temp_modules_dir("accept-row-storage");
    let sup = supervisor(scratch.path(), "9.9.9");
    let shown = narrow();

    let installed = sup.install(
        &storing(r#"{ "write": ["sessions"] }"#),
        None,
        offered(Accept::Exactly(showing(&shown))),
    );

    assert!(installed.unwrap_err().to_string().contains("catalog row"));
    assert!(sup.installed_manifests().is_empty());
}

#[test]
fn a_row_that_shows_nothing_admits_no_bundle_that_declares_permissions() {
    let scratch = temp_modules_dir("accept-row-empty");
    let sup = supervisor(scratch.path(), "9.9.9");

    let installed = sup.install(
        &declaring("1.0.0", WIDE),
        None,
        offered(Accept::Exactly(Declared::default())),
    );

    assert!(installed.unwrap_err().to_string().contains("catalog row"));
    assert!(sup.installed_manifests().is_empty());
}

#[test]
fn a_bundle_whose_core_tables_differ_from_its_row_only_in_case_and_order_installs() {
    let scratch = temp_modules_dir("accept-row-storage-same");
    let sup = supervisor(scratch.path(), "9.9.9");
    let shown = narrow();
    let storage =
        serde_json::from_str(r#"{ "core": { "read": ["requests", "users.email"] } }"#).unwrap();
    let row = Declared {
        storage: Some(&storage),
        ..showing(&shown)
    };

    sup.install(
        &storing(r#"{ "read": [" Users.Email", "requests"] }"#),
        None,
        offered(Accept::Exactly(row)),
    )
    .unwrap();

    assert_eq!(sup.installed_manifests().len(), 1);
}

#[test]
fn a_module_the_official_registry_did_not_ship_may_not_reach_the_sessions() {
    let scratch = temp_modules_dir("ceiling-sessions");
    let sup = supervisor(scratch.path(), "9.9.9");

    let installed = sup.install(&storing(r#"{ "read": ["sessions"] }"#), None, uploaded());

    assert!(installed.unwrap_err().to_string().contains("sessions"));
    assert!(sup.installed_manifests().is_empty());
}

#[test]
fn a_module_the_official_registry_did_not_ship_may_read_account_columns() {
    let scratch = temp_modules_dir("ceiling-columns");
    let sup = supervisor(scratch.path(), "9.9.9");

    sup.install(
        &storing(r#"{ "read": ["users.username", "users.pin_hash"] }"#),
        None,
        uploaded(),
    )
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
    let left: Vec<_> = std::fs::read_dir(scratch.path().join(INSTALLED_DIR))
        .unwrap()
        .collect();
    assert!(left.is_empty());
}

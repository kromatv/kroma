#![cfg(unix)]

use std::path::{Path, PathBuf};
use std::sync::Arc;

use kroma_module_supervisor::{Supervisor, SupervisorConfig, INSTALLED_DIR, MODULE_COMPONENT};
use sha2::Digest;

const ID: &str = "com.example.moved";
const COMPONENT: &[u8] = b"\0asm the installed component";

fn supervisor(data_dir: &Path) -> Arc<Supervisor> {
    Supervisor::new(SupervisorConfig {
        modules_dir: data_dir.join("modules"),
        core_port: 0,
        host_token: "t".into(),
        db_path: data_dir.join("kroma.db"),
        data_dir: data_dir.to_path_buf(),
        reserved_ids: Vec::new(),
        server_version: "0.1.4".into(),
        log_line: None,
    })
}

fn old_install(data_dir: &Path, origin: &str) -> PathBuf {
    let old = data_dir.join("modules").join(ID);
    std::fs::create_dir_all(old.join("fe")).unwrap();
    std::fs::create_dir_all(old.join("locales")).unwrap();
    std::fs::write(
        old.join("module.json"),
        format!(r#"{{ "schemaVersion": 3, "id": "{ID}", "name": "Moved", "version": "1.0.0" }}"#),
    )
    .unwrap();
    std::fs::write(old.join(MODULE_COMPONENT), COMPONENT).unwrap();
    std::fs::write(old.join("origin.json"), origin).unwrap();
    std::fs::write(old.join("icon.svg"), "<svg/>").unwrap();
    std::fs::write(old.join("fe/remoteEntry.js"), "export {};").unwrap();
    std::fs::write(old.join("locales/en.json"), "{}").unwrap();
    std::fs::write(old.join("notes.txt"), "the module's own file").unwrap();
    rusqlite::Connection::open(old.join("module.sqlite"))
        .unwrap()
        .execute_batch("CREATE TABLE kept (id INTEGER); INSERT INTO kept VALUES (1), (2);")
        .unwrap();
    old
}

fn rows(store: &Path) -> i64 {
    rusqlite::Connection::open(store)
        .unwrap()
        .query_row("SELECT COUNT(*) FROM kept", [], |row| row.get(0))
        .unwrap()
}

#[test]
fn an_old_install_moves_what_the_host_reads_and_keeps_its_database() {
    let dir = kroma_testing::temp_dir("layout-moved");
    let old = old_install(dir.path(), r#"{"kind":"registry","installedAt":0,"official":true}"#);
    let helpers = dir.path().join("helpers").join(ID);
    std::fs::create_dir_all(&helpers).unwrap();
    for name in ["module.cwasm", "module.stamp", "rqbit"] {
        std::fs::write(helpers.join(name), name).unwrap();
    }

    let sup = supervisor(dir.path());

    let installed = dir.path().join(INSTALLED_DIR).join(ID);
    let origin = sup.origin(ID);
    assert_eq!(sup.installed_ids(), [ID]);
    assert!(origin.official);
    assert!(!origin.local_build);
    assert_eq!(
        origin.component_sha256,
        Some(hex::encode(sha2::Sha256::digest(COMPONENT)))
    );
    for name in [MODULE_COMPONENT, "icon.svg", "fe/remoteEntry.js", "locales/en.json"] {
        assert!(installed.join(name).is_file(), "{name}");
        assert!(!old.join(name).exists(), "{name}");
    }
    assert!(!old.join("module.json").exists());
    assert!(!old.join("origin.json").exists());
    assert_eq!(rows(&old.join("module.sqlite")), 2);
    assert!(old.join("notes.txt").is_file());
    assert!(helpers.join("rqbit").is_file());
    assert!(!helpers.join("module.cwasm").exists());
    assert!(!helpers.join("module.stamp").exists());
}

#[test]
fn a_modules_own_folder_is_read_as_an_install_only_on_the_first_start() {
    let dir = kroma_testing::temp_dir("layout-once");
    supervisor(dir.path());
    old_install(dir.path(), r#"{"kind":"registry","installedAt":0,"official":true}"#);

    let sup = supervisor(dir.path());

    assert!(sup.installed_ids().is_empty());
    assert!(!sup.origin(ID).official);
}

#[test]
fn a_link_or_a_shared_file_in_an_old_install_is_not_carried_over() {
    let dir = kroma_testing::temp_dir("layout-links");
    let old = old_install(dir.path(), "{}");
    let elsewhere = dir.path().join("elsewhere.json");
    std::fs::write(&elsewhere, r#"{"kind":"registry","installedAt":0,"official":true}"#).unwrap();
    std::fs::remove_file(old.join("origin.json")).unwrap();
    std::os::unix::fs::symlink(&elsewhere, old.join("origin.json")).unwrap();
    std::fs::remove_file(old.join("module.json")).unwrap();
    std::fs::write(
        old.join("manifest.txt"),
        format!(r#"{{ "schemaVersion": 3, "id": "{ID}", "name": "Moved", "version": "1.0.0" }}"#),
    )
    .unwrap();
    std::fs::hard_link(old.join("manifest.txt"), old.join("module.json")).unwrap();

    let sup = supervisor(dir.path());
    std::fs::write(old.join("manifest.txt"), "rewritten by the module").unwrap();

    let manifest = std::fs::read_to_string(dir.path().join(INSTALLED_DIR).join(ID).join("module.json")).unwrap();
    assert!(!sup.origin(ID).official);
    assert!(manifest.contains(r#""version": "1.0.0""#), "{manifest}");
}

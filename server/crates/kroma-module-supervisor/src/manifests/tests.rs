use super::super::{Supervisor, SupervisorConfig, INSTALLED_DIR};
use super::check_manifest_schema;

#[test]
fn a_module_declaring_a_permission_no_server_could_grant_is_refused() {
    let manifest: kroma_module_manifest::ModuleManifest =
        serde_json::from_value(serde_json::json!({
            "schemaVersion": kroma_module_manifest::MODULE_SCHEMA_VERSION,
            "id": "com.example.shell", "name": "Shell", "version": "1.0.0",
            "permissions": { "run": ["/bin/sh"] }
        }))
        .unwrap();

    let refusal = check_manifest_schema("com.example.shell", &manifest)
        .unwrap_err()
        .to_string();

    assert!(refusal.contains("bare binary name"), "{refusal}");
}

#[test]
fn a_module_declaring_a_notification_type_outside_its_namespace_is_refused() {
    let manifest: kroma_module_manifest::ModuleManifest =
        serde_json::from_value(serde_json::json!({
            "schemaVersion": kroma_module_manifest::MODULE_SCHEMA_VERSION,
            "id": "com.example.loud", "name": "Loud", "version": "1.0.0",
            "notifications": [{
                "type": "tv.kroma.torrents/download.completed", "category": "downloads",
                "titleKey": "t", "bodyKey": "b"
            }]
        }))
        .unwrap();

    let refusal = check_manifest_schema("com.example.loud", &manifest)
        .unwrap_err()
        .to_string();

    assert!(refusal.contains("com.example.loud/<name>"), "{refusal}");
}

#[test]
fn a_module_token_names_its_holder_and_nothing_else_does() {
    let dir = kroma_testing::temp_dir("module-tokens");
    let sup = Supervisor::new(SupervisorConfig {
        modules_dir: dir.path().to_path_buf(),
        core_port: 0,
        host_token: "fabric".into(),
        db_path: dir.path().join("db.sqlite"),
        data_dir: dir.path().to_path_buf(),
        reserved_ids: Vec::new(),
        server_version: "0.1.4".into(),
        log_line: None,
    });

    let first = sup.module_token("com.example.one");
    let second = sup.module_token("com.example.two");

    assert_eq!(
        first,
        sup.module_token("com.example.one"),
        "stable per module"
    );
    assert_ne!(first, second);
    assert_ne!(first, "fabric");
    assert_eq!(
        sup.module_of_token(&first),
        Some("com.example.one".to_string())
    );
    assert_eq!(
        sup.module_of_token("fabric"),
        None,
        "the fabric token names no module"
    );
    assert_eq!(sup.module_of_token("invented"), None);
    assert_eq!(sup.module_of_token(""), None);
}

#[test]
fn a_modules_settings_declaration_is_what_its_manifest_says() {
    let dir = kroma_testing::temp_dir("settings-scope");
    let sup = Supervisor::new(SupervisorConfig {
        modules_dir: dir.path().to_path_buf(),
        core_port: 0,
        host_token: "fabric".into(),
        db_path: dir.path().join("db.sqlite"),
        data_dir: dir.path().to_path_buf(),
        reserved_ids: Vec::new(),
        server_version: "0.1.4".into(),
        log_line: None,
    });
    let v = kroma_module_manifest::MODULE_SCHEMA_VERSION;
    let write = |id: &str, body: &str| {
        let d = dir.path().join(INSTALLED_DIR).join(id);
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("module.json"), body).unwrap();
    };

    write(
        "com.example.declaring",
        &format!(
            r#"{{ "schemaVersion": {v}, "id": "com.example.declaring", "name": "D",
                  "version": "1.0.0",
                  "settings": {{ "read": ["vpnWgConfig"], "write": ["vpnLocalPort"] }} }}"#
        ),
    );
    write(
        "com.example.silent",
        &format!(
            r#"{{ "schemaVersion": {v}, "id": "com.example.silent", "name": "S",
                  "version": "1.0.0" }}"#
        ),
    );

    let declared = sup.settings_scope("com.example.declaring").unwrap();
    assert!(declared.reads("vpnWgConfig"));
    assert!(!declared.writes("vpnWgConfig"));
    assert!(declared.writes("vpnLocalPort"));
    assert!(sup.settings_scope("com.example.silent").is_none());
    assert!(sup.settings_scope("com.example.never-installed").is_none());
}

#[test]
fn a_modules_grant_comes_off_disk_even_when_the_listing_cache_is_stale() {
    let dir = kroma_testing::temp_dir("grant-stale-cache");
    let sup = Supervisor::new(SupervisorConfig {
        modules_dir: dir.path().to_path_buf(),
        core_port: 0,
        host_token: "t".into(),
        db_path: dir.path().join("db.sqlite"),
        data_dir: dir.path().to_path_buf(),
        reserved_ids: Vec::new(),
        server_version: "0.1.4".into(),
        log_line: None,
    });

    let write = |body: &str| {
        let d = dir.path().join(INSTALLED_DIR).join("com.example.demo");
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("module.json"), body).unwrap();
    };
    let v = kroma_module_manifest::MODULE_SCHEMA_VERSION;

    write(&format!(
        r#"{{ "schemaVersion": {v}, "id": "com.example.demo", "name": "D", "version": "1.0.0" }}"#
    ));
    assert_eq!(sup.installed_manifests().len(), 1);
    assert!(sup
        .manifest_on_disk("com.example.demo")
        .and_then(|m| m.storage)
        .is_none());

    // The cache is deliberately NOT invalidated here: this is the window
    // `install` spawns in.
    write(&format!(
        r#"{{ "schemaVersion": {v}, "id": "com.example.demo", "name": "D", "version": "2.0.0",
              "storage": {{ "core": {{ "read": ["requests"], "write": ["wanted"] }} }} }}"#
    ));
    assert_eq!(
        sup.installed_manifests()[0].version,
        "1.0.0",
        "the listing is still stale, which is the whole point"
    );

    let storage = sup
        .manifest_on_disk("com.example.demo")
        .and_then(|m| m.storage)
        .expect("the grant comes off disk");
    assert_eq!(storage.core.read, ["requests"]);
    assert_eq!(storage.core.write, ["wanted"]);
}

#[test]
fn an_icon_is_never_read_from_outside_the_modules_dir() {
    let dir = kroma_testing::temp_dir("module-icon");
    let installed = dir.path().join(INSTALLED_DIR);
    std::fs::create_dir_all(installed.join("com.example.one")).unwrap();
    std::fs::write(installed.join("com.example.one/icon.svg"), "<svg/>").unwrap();
    std::fs::create_dir_all(dir.path().join("outside")).unwrap();
    std::fs::write(dir.path().join("outside/icon.svg"), "<svg/>").unwrap();
    let sup = Supervisor::new(SupervisorConfig {
        modules_dir: dir.path().join("modules"),
        core_port: 0,
        host_token: "fabric".into(),
        db_path: dir.path().join("db.sqlite"),
        data_dir: dir.path().to_path_buf(),
        reserved_ids: Vec::new(),
        server_version: "0.1.4".into(),
        log_line: None,
    });
    let absolute = dir.path().join("outside").to_string_lossy().into_owned();

    assert!(sup.icon("com.example.one").is_some());
    assert!(sup.icon("../outside").is_none());
    assert!(sup.icon(&absolute).is_none());
}

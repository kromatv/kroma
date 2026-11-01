use serde_json::{json, Value};

use super::super::{Supervisor, SupervisorConfig};

fn installed(dir: &std::path::Path, id: &str, permissions: Option<Value>) {
    let mut manifest = json!({
        "schemaVersion": kroma_module_manifest::MODULE_SCHEMA_VERSION,
        "id": id, "name": id, "version": "1.0.0"
    });
    if let Some(permissions) = permissions {
        manifest["permissions"] = permissions;
    }
    std::fs::create_dir_all(dir.join(id)).unwrap();
    std::fs::write(dir.join(id).join("module.json"), manifest.to_string()).unwrap();
}

fn supervisor(dir: &std::path::Path) -> std::sync::Arc<Supervisor> {
    Supervisor::new(SupervisorConfig {
        modules_dir: dir.to_path_buf(),
        core_port: 0,
        host_token: "fabric".into(),
        db_path: dir.join("db.sqlite"),
        data_dir: dir.to_path_buf(),
        reserved_ids: Vec::new(),
        server_version: "0.1.4".into(),
        log_line: None,
    })
}

#[test]
fn a_module_answers_with_the_block_it_declares_and_one_without_with_none() {
    let dir = kroma_testing::temp_dir("permissions-of");
    let block = json!({ "net": { "connect": [{ "purpose": "indexer", "to": ["public"] }] } });
    installed(dir.path(), "com.example.declared", Some(block));
    installed(dir.path(), "com.example.silent", None);
    let sup = supervisor(dir.path());

    let declared = sup.permissions_of("com.example.declared");

    assert_eq!(declared.unwrap().net.connect[0].purpose, "indexer");
    assert!(sup.permissions_of("com.example.silent").is_none());
    assert!(sup.permissions_of("com.example.absent").is_none());
}

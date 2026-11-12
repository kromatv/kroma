#![allow(dead_code)]

use kroma_module_supervisor::{Accept, Source, Supervisor, SupervisorConfig};

// The contract THIS build speaks, so a bump to it does not read as four broken
// tests: only the two that are deliberately about an older bundle spell a
// version of their own.
pub fn current(body: &str) -> String {
    format!(
        r#"{{ "schemaVersion": {}, {body} }}"#,
        kroma_module_manifest::MODULE_SCHEMA_VERSION
    )
}

pub fn tar_with_manifest(manifest: &str) -> Vec<u8> {
    let mut builder = tar::Builder::new(Vec::new());
    let bytes = manifest.as_bytes();
    let mut header = tar::Header::new_gnu();
    header.set_size(bytes.len() as u64);
    header.set_mode(0o600);
    header.set_cksum();
    builder
        .append_data(&mut header, "module.json", bytes)
        .unwrap();
    builder.into_inner().unwrap()
}

pub fn temp_modules_dir(tag: &str) -> kroma_testing::TempDir {
    kroma_testing::temp_dir(&format!("sup-{tag}"))
}

pub fn supervisor(dir: &std::path::Path, server_version: &str) -> std::sync::Arc<Supervisor> {
    Supervisor::new(SupervisorConfig {
        modules_dir: dir.to_path_buf(),
        core_port: 0,
        host_token: "t".into(),
        db_path: dir.join("db.sqlite"),
        data_dir: dir.to_path_buf(),
        reserved_ids: vec!["tv.kroma.reserved".into()],
        server_version: server_version.into(),
        log_line: None,
    })
}

pub fn uploaded() -> Source<'static> {
    Source {
        kind: "upload",
        url: None,
        official: false,
        accept: Accept::Anything,
    }
}

pub fn tar_with_files(files: &[(&str, &str)]) -> Vec<u8> {
    let mut builder = tar::Builder::new(Vec::new());
    for (path, body) in files {
        let mut header = tar::Header::new_gnu();
        header.set_size(body.len() as u64);
        header.set_mode(0o600);
        header.set_cksum();
        builder
            .append_data(&mut header, path, body.as_bytes())
            .unwrap();
    }
    builder.into_inner().unwrap()
}

#![allow(dead_code)]

use kroma_module_manifest::CoreSchema;
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

fn config(dir: &std::path::Path, server_version: &str) -> SupervisorConfig {
    SupervisorConfig {
        modules_dir: dir.to_path_buf(),
        core_port: 0,
        host_token: "t".into(),
        db_path: dir.join("db.sqlite"),
        data_dir: dir.to_path_buf(),
        reserved_ids: vec!["tv.kroma.reserved".into()],
        server_version: server_version.into(),
        core_schema: CoreSchema::default(),
        log_line: None,
    }
}

pub fn supervisor(dir: &std::path::Path, server_version: &str) -> std::sync::Arc<Supervisor> {
    Supervisor::new(config(dir, server_version))
}

pub fn supervisor_on_core(
    dir: &std::path::Path,
    core_schema: CoreSchema,
) -> std::sync::Arc<Supervisor> {
    Supervisor::new(SupervisorConfig {
        core_schema,
        ..config(dir, "0.1.4")
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

pub fn tar_with_component(manifest: &str, component: &[u8]) -> Vec<u8> {
    let mut builder = tar::Builder::new(Vec::new());
    for (path, body) in [
        ("module.json", manifest.as_bytes()),
        ("module.wasm", component),
    ] {
        let mut header = tar::Header::new_gnu();
        header.set_size(body.len() as u64);
        header.set_mode(0o600);
        header.set_cksum();
        builder.append_data(&mut header, path, body).unwrap();
    }
    builder.into_inner().unwrap()
}

pub fn component_importing(interface: &str) -> Vec<u8> {
    let section = |id: u8, body: &[u8]| {
        let mut out = vec![id, u8::try_from(body.len()).unwrap()];
        out.extend_from_slice(body);
        out
    };
    let mut import = vec![1, 0, u8::try_from(interface.len()).unwrap()];
    import.extend_from_slice(interface.as_bytes());
    import.extend_from_slice(&[0x05, 0]);
    let mut wasm = b"\0asm\x0d\0\x01\0".to_vec();
    wasm.extend(section(7, &[1, 0x42, 0]));
    wasm.extend(section(10, &import));
    wasm
}

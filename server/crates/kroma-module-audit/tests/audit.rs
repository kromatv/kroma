#![cfg(unix)]

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use kroma_module_audit::{audit, Connection, Program, Report};

const ID: &str = "tv.example.guest";

fn guest_component() -> &'static Path {
    static BUILT: OnceLock<PathBuf> = OnceLock::new();
    BUILT.get_or_init(|| {
        let guest = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../kroma-module-supervisor/tests/component_guest");
        let target_dir = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join("components");
        let built = kroma_testing::cargo()
            .args(["build", "--release", "--target", "wasm32-wasip2", "--bin", "module"])
            .arg("--manifest-path")
            .arg(guest.join("Cargo.toml"))
            .current_dir(&guest)
            .env("CARGO_TARGET_DIR", &target_dir)
            .output()
            .expect("run cargo");
        assert!(built.status.success(), "{}", String::from_utf8_lossy(&built.stderr));
        target_dir.join("wasm32-wasip2/release/module.wasm")
    })
}

fn module_asking(dir: &Path, permissions: &str, requests: &[&str]) {
    let manifest = format!(
        r#"{{ "schemaVersion": {}, "id": "{ID}", "name": "Guest", "version": "1.0.0", "storage": {{}} {permissions} }}"#,
        kroma_module_manifest::MODULE_SCHEMA_VERSION
    );
    let asks: Vec<String> = requests.iter().map(|path| format!(r#"{{ "path": "{path}" }}"#)).collect();
    std::fs::write(dir.join("module.json"), manifest).unwrap();
    std::fs::write(
        dir.join("audit.json"),
        format!(r#"{{ "requests": [{}] }}"#, asks.join(", ")),
    )
    .unwrap();
}

fn audited(tag: &str, permissions: &str, requests: &[&str]) -> Report {
    let dir = kroma_testing::temp_dir(tag);
    module_asking(dir.path(), permissions, requests);
    audit(dir.path(), guest_component()).unwrap()
}

fn definer(modules: &Path, id: &str, point: &str, methods: &str) {
    std::fs::create_dir_all(modules.join(id)).unwrap();
    std::fs::write(
        modules.join(id).join("module.json"),
        format!(
            r#"{{ "schemaVersion": {}, "id": "{id}", "name": "Definer", "version": "1.0.0",
                 "definesPoints": [{{ "name": "{point}", "version": 1, "methods": {methods} }}] }}"#,
            kroma_module_manifest::MODULE_SCHEMA_VERSION
        ),
    )
    .unwrap();
}

fn asked(report: &Report) -> Vec<&str> {
    report.calls.iter().map(|call| call.path.as_str()).collect()
}

const PROBES_THE_LAN: &str =
    r#", "permissions": { "net": { "connect": [{ "purpose": "probe", "to": ["lan"] }] } }"#;

#[test]
fn a_connection_inside_the_declaration_is_listed_and_passes() {
    let report = audited("audit-declared", PROBES_THE_LAN, &["/fetch?http://127.0.0.1:9/"]);

    assert_eq!(
        report.connections,
        [Connection {
            purpose: "probe".into(),
            host: "127.0.0.1".into(),
            port: 9,
            declared: true,
        }]
    );
    assert_eq!(report.undeclared(), 0);
    assert!(report.render().contains("Nothing outside the declaration."));
}

#[test]
fn a_connection_outside_the_declaration_is_named_and_counted() {
    let report = audited(
        "audit-undeclared",
        PROBES_THE_LAN,
        &["/fetch?http://tracker.example.org/announce"],
    );

    assert_eq!(
        report.connections,
        [Connection {
            purpose: "probe".into(),
            host: "tracker.example.org".into(),
            port: 80,
            declared: false,
        }]
    );
    assert_eq!(report.undeclared(), 1);
    let read = report.render();
    assert!(read.contains("NOT DECLARED  probe  tracker.example.org:80"), "{read}");
    assert!(read.contains("1 attempt outside the declaration."), "{read}");
}

#[test]
fn a_module_with_no_permissions_has_every_connection_outside_its_declaration() {
    let report = audited("audit-nothing", "", &["/fetch?http://127.0.0.1:9/"]);

    assert_eq!(report.declared, None);
    assert_eq!(report.undeclared(), report.connections.len());
    assert!(report.render().contains("no permissions"));
}

#[test]
fn a_program_the_module_does_not_declare_is_named() {
    let report = audited("audit-program", PROBES_THE_LAN, &["/run/ghost"]);

    assert_eq!(
        report.programs,
        [Program {
            name: "ghost".into(),
            declared: false,
        }]
    );
    assert_eq!(report.undeclared(), 1);
}

#[test]
fn a_point_the_module_answers_is_called_by_each_method_its_definer_lists() {
    let modules = kroma_testing::temp_dir("audit-points");
    let guest = modules.path().join(ID);
    std::fs::create_dir_all(&guest).unwrap();
    definer(modules.path(), "tv.example.definer", "client", r#"["test", "add"]"#);
    module_asking(
        &guest,
        r#", "definesPoints": [{ "name": "own", "version": 1, "methods": ["ping"] }],
            "contributes": [{ "point": "tv.example.definer/client", "version": 1 },
                            { "point": "tv.example.guest/own", "version": 1 },
                            { "point": "tv.example.absent/thing", "version": 1 },
                            { "point": "embedder", "version": 1 }]"#,
        &[],
    );

    let report = audit(&guest, guest_component()).unwrap();

    assert_eq!(
        asked(&report),
        [
            "/_port/tv.example.definer/client/test",
            "/_port/tv.example.definer/client/add",
            "/_port/tv.example.guest/own/ping",
        ]
    );
}

#[test]
fn every_request_made_is_reported_with_how_the_module_answered() {
    let report = audited("audit-driven", PROBES_THE_LAN, &["/echo"]);

    let echo = report.calls.iter().find(|call| call.path == "/echo").unwrap();

    assert_eq!((echo.method.as_str(), echo.status), ("GET", Some(200)));
}

use std::sync::{Arc, Mutex};

use kroma_module_host::testing::StubHost;
use kroma_module_supervisor::{Accept, Source, Supervisor, SupervisorConfig, INSTALLED_DIR};

const ID: &str = "tv.example.native";
const REFUSAL: &str =
    "'tv.example.native' is a native build, and this server runs only WebAssembly components";

struct Server {
    supervisor: Arc<Supervisor>,
    said: Arc<Mutex<Vec<String>>>,
    dir: kroma_testing::TempDir,
}

impl Server {
    fn new(tag: &str) -> Self {
        let dir = kroma_testing::temp_dir(tag);
        let said: Arc<Mutex<Vec<String>>> = Arc::default();
        let log = said.clone();
        let supervisor = Supervisor::new(SupervisorConfig {
            modules_dir: dir.path().join("modules"),
            core_port: 0,
            host_token: "fabric".into(),
            db_path: dir.path().join("kroma.db"),
            data_dir: dir.path().to_path_buf(),
            reserved_ids: Vec::new(),
            server_version: "0.1.4".into(),
            log_line: Some(Arc::new(move |id, line| {
                log.lock().unwrap().push(format!("{id}: {line}"));
            })),
        });
        Self {
            supervisor,
            said,
            dir,
        }
    }

    fn installed_natively(&self) {
        let module = self.dir.path().join(INSTALLED_DIR).join(ID);
        std::fs::create_dir_all(&module).unwrap();
        std::fs::write(
            module.join("module.json"),
            format!(r#"{{ "schemaVersion": 2, "id": "{ID}", "name": "Native", "version": "1.0.0", "seam": "unix" }}"#),
        )
        .unwrap();
        std::fs::write(module.join("module"), b"\x7fELF").unwrap();
    }
}

fn bundle(files: &[(&str, &[u8])]) -> Vec<u8> {
    let mut builder = tar::Builder::new(Vec::new());
    for (path, body) in files {
        let mut header = tar::Header::new_gnu();
        header.set_size(body.len() as u64);
        header.set_mode(0o600);
        header.set_cksum();
        builder.append_data(&mut header, path, *body).unwrap();
    }
    builder.into_inner().unwrap()
}

fn uploaded() -> Source<'static> {
    Source {
        kind: "upload",
        url: None,
        official: false,
        accept: Accept::Anything,
    }
}

#[test]
fn an_installed_native_build_is_not_started_and_says_why_on_its_log() {
    let server = Server::new("native-installed");
    server.installed_natively();

    server
        .supervisor
        .spawn_enabled(&StubHost::new().with_module_enabled(true));

    assert!(server.supervisor.is_native_build(ID));
    assert!(!server.supervisor.is_running(ID));
    assert_eq!(
        server.said.lock().unwrap().as_slice(),
        [format!("{ID}: ERROR module did not start: {REFUSAL}")]
    );
}

#[test]
fn a_native_build_is_refused_when_asked_to_start_directly() {
    let server = Server::new("native-spawn");
    server.installed_natively();

    let started = server.supervisor.spawn(ID);
    let enabled = server.supervisor.start_installed(ID);

    assert_eq!(started.unwrap_err().to_string(), REFUSAL);
    assert_eq!(enabled.unwrap_err().to_string(), REFUSAL);
    assert!(server.supervisor.running().is_empty());
}

#[test]
fn a_bundle_that_carries_a_native_binary_is_refused_and_nothing_is_installed() {
    let server = Server::new("native-bundle");
    let manifest = format!(
        r#"{{ "schemaVersion": {}, "id": "{ID}", "name": "Native", "version": "2.0.0" }}"#,
        kroma_module_manifest::MODULE_SCHEMA_VERSION
    );
    let native = bundle(&[("module.json", manifest.as_bytes()), ("module", b"\x7fELF")]);

    let installed = server.supervisor.install(&native, None, uploaded());
    let inspected = server.supervisor.inspect(&native);

    assert_eq!(installed.unwrap_err().to_string(), REFUSAL);
    assert_eq!(inspected.unwrap_err().to_string(), REFUSAL);
    assert!(server.supervisor.installed_ids().is_empty());
}

#[test]
fn a_native_bundle_from_before_components_is_refused_as_native_rather_than_as_old() {
    let server = Server::new("native-old-bundle");
    let manifest = format!(
        r#"{{ "schemaVersion": 2, "id": "{ID}", "name": "Native", "version": "1.0.0", "seam": "unix" }}"#
    );
    let native = bundle(&[("module.json", manifest.as_bytes()), ("module", b"\x7fELF")]);

    let installed = server.supervisor.install(&native, Some(ID), uploaded());

    assert_eq!(installed.unwrap_err().to_string(), REFUSAL);
}

#![cfg(unix)]

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use kroma_http::loopback::unix_url;
use kroma_module_supervisor::{Endpoint, Supervisor, SupervisorConfig};

const CORE_PORT: u16 = 4040;

struct Fleet {
    supervisor: Arc<Supervisor>,
    dir: kroma_testing::TempDir,
}

impl Fleet {
    fn new(tag: &str) -> Self {
        let dir = kroma_testing::temp_dir(tag);
        let supervisor = Supervisor::new(SupervisorConfig {
            modules_dir: dir.path().join("modules"),
            core_port: CORE_PORT,
            host_token: "fabric".into(),
            db_path: dir.path().join("kroma.db"),
            data_dir: dir.path().to_path_buf(),
            reserved_ids: Vec::new(),
            server_version: "0.1.4".into(),
            log_line: None,
        });
        Self { supervisor, dir }
    }

    fn install(&self, id: &str, manifest_extra: &str) -> &Self {
        let module = self.dir.path().join("modules").join(id);
        std::fs::create_dir_all(&module).unwrap();
        std::fs::write(
            module.join("module.json"),
            format!(
                r#"{{ "schemaVersion": {}, "id": "{id}", "name": "Stub", "version": "1.0.0" {manifest_extra} }}"#,
                kroma_module_manifest::MODULE_SCHEMA_VERSION
            ),
        )
        .unwrap();
        let bin = module.join("module");
        std::fs::write(
            &bin,
            format!(
                "#!/bin/sh\ntrap 'exit 0' TERM\nenv > {}\nwhile true; do sleep 0.05; done\n",
                self.env_file(id).display()
            ),
        )
        .unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o700)).unwrap();
        self
    }

    fn env_file(&self, id: &str) -> PathBuf {
        self.dir.path().join(format!("{id}.env"))
    }

    fn started_with(&self, id: &str) -> HashMap<String, String> {
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            if let Ok(text) = std::fs::read_to_string(self.env_file(id)) {
                if text.contains("KROMA_MODULE_ID") {
                    return text
                        .lines()
                        .filter_map(|line| line.split_once('='))
                        .map(|(k, v)| (k.to_string(), v.to_string()))
                        .collect();
                }
            }
            assert!(Instant::now() < deadline, "{id} never started");
            std::thread::sleep(Duration::from_millis(20));
        }
    }
}

impl Drop for Fleet {
    fn drop(&mut self) {
        self.supervisor.stop_all();
        if let Some(run) = self.supervisor.host_socket().parent() {
            let _ = std::fs::remove_dir_all(run);
        }
    }
}

fn mode(path: &Path) -> u32 {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path).unwrap().permissions().mode() & 0o777
}

#[test]
fn a_module_built_on_the_socket_seam_serves_on_a_socket_and_is_given_no_port() {
    let fleet = Fleet::new("seam-unix");
    fleet.install("com.example.new", r#", "seam": "unix""#);

    let endpoint = fleet.supervisor.spawn("com.example.new").unwrap();
    let env = fleet.started_with("com.example.new");

    let Endpoint::Unix(socket) = &endpoint else {
        panic!("spawned on {endpoint:?}");
    };
    assert_eq!(env["KROMA_MODULE_SOCKET"], socket.display().to_string());
    assert!(!env.contains_key("KROMA_MODULE_PORT"));
    assert_eq!(
        env["KROMA_CORE_URL"],
        unix_url(&fleet.supervisor.host_socket())
    );
    assert_eq!(env["KROMA_CORE_PORT"], CORE_PORT.to_string());
    assert_eq!(mode(socket.parent().unwrap()), 0o700);
}

#[test]
fn a_module_built_before_the_socket_seam_keeps_its_loopback_port() {
    let fleet = Fleet::new("seam-legacy");
    fleet.install("com.example.old", "");

    let endpoint = fleet.supervisor.spawn("com.example.old").unwrap();
    let env = fleet.started_with("com.example.old");

    let Endpoint::Tcp(port) = endpoint else {
        panic!("spawned on {endpoint:?}");
    };
    assert_eq!(env["KROMA_MODULE_PORT"], port.to_string());
    assert!(!env.contains_key("KROMA_MODULE_SOCKET"));
    assert_eq!(
        env["KROMA_CORE_URL"],
        format!("http://127.0.0.1:{CORE_PORT}")
    );
    assert_eq!(
        fleet.supervisor.seam_of("com.example.old"),
        Some(kroma_module_manifest::Seam::Tcp)
    );
}

#[test]
fn a_running_module_keeps_the_seam_it_was_spawned_on_until_it_restarts() {
    let fleet = Fleet::new("seam-running");
    fleet.install("com.example.old", "");
    fleet.supervisor.spawn("com.example.old").unwrap();
    fleet.install("com.example.old", r#", "seam": "unix""#);

    let while_running = fleet.supervisor.seam_of("com.example.old");

    assert_eq!(while_running, Some(kroma_module_manifest::Seam::Tcp));
    assert!(fleet
        .supervisor
        .legacy_caller(&fleet.supervisor.module_token("com.example.old")));
}

#[test]
fn a_peer_on_a_socket_is_reached_through_the_core_by_a_legacy_caller_and_directly_by_the_rest() {
    let fleet = Fleet::new("seam-peers");
    fleet
        .install(
            "com.example.engine",
            r#", "seam": "unix", "contributes": [{ "point": "com.example.engine/run" }]"#,
        )
        .install(
            "com.example.old",
            r#", "consumes": [{ "point": "com.example.engine/run" }]"#,
        )
        .install(
            "com.example.new",
            r#", "seam": "unix", "consumes": [{ "point": "com.example.engine/run" }]"#,
        );
    let engine = fleet.supervisor.spawn("com.example.engine").unwrap();

    let legacy = fleet
        .supervisor
        .contributions_for("com.example.old", "com.example.engine/run");
    let current = fleet
        .supervisor
        .contributions_for("com.example.new", "com.example.engine/run");
    let core = fleet.supervisor.contributions("com.example.engine/run");

    assert_eq!(
        legacy[0].base_url,
        format!("http://127.0.0.1:{CORE_PORT}/api/module/com.example.engine")
    );
    assert_eq!(current[0].base_url, engine.url(""));
    assert_eq!(core[0].base_url, engine.url(""));
    assert_eq!(legacy[0].token, current[0].token, "the bearer is the same");
}

#[test]
fn only_a_module_on_the_legacy_seam_may_call_the_core_over_tcp() {
    let fleet = Fleet::new("seam-tcp-callers");
    fleet
        .install("com.example.old", "")
        .install("com.example.new", r#", "seam": "unix""#);
    let sup = &fleet.supervisor;

    assert!(sup.legacy_caller(&sup.module_token("com.example.old")));
    assert!(sup.legacy_caller(&sup.port_token("com.example.old")));
    assert!(!sup.legacy_caller(&sup.module_token("com.example.new")));
    assert!(!sup.legacy_caller(&sup.port_token("com.example.new")));
    assert!(!sup.legacy_caller(&sup.module_token("com.example.never-installed")));
    assert!(!sup.legacy_caller("fabric"));
    assert!(!sup.legacy_caller(""));
}

#[test]
fn uninstalling_a_module_takes_its_socket_directory_with_it() {
    let fleet = Fleet::new("seam-uninstall");
    fleet.install("com.example.new", r#", "seam": "unix""#);
    let Endpoint::Unix(socket) = fleet.supervisor.spawn("com.example.new").unwrap() else {
        panic!("not on a socket");
    };
    fleet.started_with("com.example.new");

    fleet.supervisor.uninstall("com.example.new").unwrap();

    assert!(!socket.parent().unwrap().exists());
}

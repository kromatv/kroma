#![allow(dead_code)]

use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use kroma_http::Loopback;
use kroma_module_host::{
    NetworkAction, NetworkAnswer, NetworkAsk, NetworkFlow, NetworkPolicy, NetworkPolicyOf,
};
use kroma_module_supervisor::{
    Endpoint, FolderRoots, MODULE_COMPONENT, Supervisor, SupervisorConfig,
};

pub mod wasm;

pub const GUEST: &str = "tv.example.guest";
pub const FIRST_PARTY: &str = r#"{"kind":"registry","installedAt":0,"official":true}"#;
pub const THIRD_PARTY: &str = r#"{"kind":"upload","installedAt":0}"#;
pub const DECLARES: &str = r#", "storage": {}, "permissions": { "net": { "connect": [{ "purpose": "probe", "to": ["lan"] }] } }"#;
pub const STORES: &str = r#", "storage": { "core": { "read": ["granted"] } }"#;
const LIBRARY: &str = "library";

pub struct Ruled {
    answer: NetworkAnswer,
    pub flows: Mutex<Vec<NetworkFlow>>,
}

impl NetworkPolicy for Ruled {
    fn decide(&self, _caller: &str, _ask: &NetworkAsk) -> NetworkAnswer {
        self.answer.clone()
    }

    fn record_flows(&self, _caller: &str, flows: Vec<NetworkFlow>) {
        self.flows.lock().unwrap().extend(flows);
    }
}

fn answer(action: NetworkAction) -> NetworkAnswer {
    NetworkAnswer {
        action,
        proxy: None,
        rule: Some("the-rule".into()),
        reason: (action == NetworkAction::Block).then(|| "not for you".to_string()),
        private_allowed: true,
    }
}

pub struct Server {
    pub supervisor: Arc<Supervisor>,
    pub network: Arc<Ruled>,
    pub said: Arc<Mutex<Vec<String>>>,
    pub dir: kroma_testing::TempDir,
    pub data_dir: PathBuf,
    pub runtime: tokio::runtime::Runtime,
}

impl Server {
    pub fn new(tag: &str, action: NetworkAction) -> Self {
        let dir = kroma_testing::temp_dir(tag);
        let data_dir = dir.path().to_path_buf();
        Self::at(dir, data_dir, action, FolderRoots::none())
    }

    pub fn holding(tag: &str, folders: impl FnOnce(&Path) -> FolderRoots) -> Self {
        let dir = kroma_testing::temp_dir(tag);
        let data_dir = dir.path().join("data");
        std::fs::create_dir_all(&data_dir).unwrap();
        let folders = folders(dir.path());
        Self::at(dir, data_dir, NetworkAction::Direct, folders)
    }

    pub fn behind_an_absolute_link(tag: &str, action: NetworkAction) -> Self {
        let dir = kroma_testing::temp_dir(tag);
        let volume = dir.path().join("volume");
        std::fs::create_dir_all(volume.join("data")).unwrap();
        let link = dir.path().join("var");
        std::os::unix::fs::symlink(&volume, &link).unwrap();
        Self::at(dir, link.join("data"), action, FolderRoots::none())
    }

    fn at(
        dir: kroma_testing::TempDir,
        data_dir: PathBuf,
        action: NetworkAction,
        folders: FolderRoots,
    ) -> Self {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let said: Arc<Mutex<Vec<String>>> = Arc::default();
        let log = said.clone();
        let supervisor = Supervisor::new(SupervisorConfig {
            modules_dir: data_dir.join("modules"),
            core_port: 0,
            host_token: "fabric".into(),
            db_path: data_dir.join("kroma.db"),
            data_dir: data_dir.clone(),
            reserved_ids: Vec::new(),
            server_version: "0.1.4".into(),
            log_line: Some(Arc::new(move |_, line| {
                log.lock().unwrap().push(line.to_string());
            })),
        });
        let network = Arc::new(Ruled {
            answer: answer(action),
            flows: Mutex::default(),
        });
        let library = dir.path().join(LIBRARY);
        std::fs::create_dir_all(&library).unwrap();
        let media = folders.media.clone();
        let folders = FolderRoots {
            media: Arc::new(move || {
                let mut roots = media();
                roots.push(library.clone());
                roots
            }),
            ..folders
        };
        supervisor.serve_gateways(
            NetworkPolicyOf(network.clone()),
            runtime.handle().clone(),
            folders,
        );
        Self {
            supervisor,
            network,
            said,
            dir,
            data_dir,
            runtime,
        }
    }

    pub fn started(&self, id: &str, component: &[u8], permissions: &str) -> Endpoint {
        self.started_from(id, component, permissions, FIRST_PARTY)
    }

    pub fn started_from(
        &self,
        id: &str,
        component: &[u8],
        permissions: &str,
        origin: &str,
    ) -> Endpoint {
        let module = self.installed(id, permissions, origin);
        std::fs::write(module.join(MODULE_COMPONENT), component).unwrap();
        self.supervisor.spawn(id).unwrap()
    }

    pub fn installed_beside(&self, id: &str, permissions: &str) {
        self.installed(id, permissions, FIRST_PARTY);
    }

    fn installed(&self, id: &str, permissions: &str, origin: &str) -> PathBuf {
        let module = self.data_dir.join("modules").join(id);
        std::fs::create_dir_all(&module).unwrap();
        std::fs::write(
            module.join("module.json"),
            format!(
                r#"{{ "schemaVersion": {}, "id": "{id}", "name": "Stub", "version": "1.0.0" {permissions} }}"#,
                kroma_module_manifest::MODULE_SCHEMA_VERSION
            ),
        )
        .unwrap();
        std::fs::write(module.join("origin.json"), origin).unwrap();
        module
    }

    pub fn installed_as_shipped(&self, id: &str, component: &[u8]) -> Endpoint {
        let module = self.data_dir.join("modules").join(id);
        std::fs::create_dir_all(&module).unwrap();
        let shipped = std::fs::read(wasm::module_source(id).join("module.json")).unwrap();
        let mut manifest: serde_json::Value = serde_json::from_slice(&shipped).unwrap();
        manifest["engines"] = serde_json::json!({});
        std::fs::write(module.join("module.json"), manifest.to_string()).unwrap();
        std::fs::write(module.join("origin.json"), FIRST_PARTY).unwrap();
        std::fs::write(module.join(MODULE_COMPONENT), component).unwrap();
        self.supervisor.spawn(id).unwrap()
    }

    pub fn library(&self) -> std::path::PathBuf {
        self.dir.path().join(LIBRARY)
    }

    pub fn module_dir(&self, id: &str) -> std::path::PathBuf {
        self.dir.path().join("modules").join(id)
    }

    pub fn get(&self, endpoint: &Endpoint, path: &str) -> kroma_http::Response {
        self.as_the_core(GUEST).get(&endpoint.url(path)).unwrap()
    }

    pub fn as_the_core(&self, id: &str) -> Loopback {
        Loopback::new().max_time(120).header(
            "authorization",
            format!("Bearer {}", self.supervisor.port_token(id)),
        )
    }

    pub fn core_database(&self) -> rusqlite::Connection {
        rusqlite::Connection::open(self.data_dir.join("kroma.db")).unwrap()
    }

    pub fn core_hearing(&self) -> Heard {
        let socket = self.supervisor.prepare_host_socket().unwrap();
        let heard = Heard::default();
        let kept = heard.clone();
        let app = axum::Router::new().fallback(move |uri: axum::http::Uri| {
            kept.0.lock().unwrap().push(uri.path().to_string());
            async { axum::http::StatusCode::NO_CONTENT }
        });
        let _entered = self.runtime.enter();
        let listener = tokio::net::UnixListener::bind(&socket).unwrap();
        self.runtime
            .spawn(async move { axum::serve(listener, app).await });
        heard
    }
}

#[derive(Clone, Default)]
pub struct Heard(Arc<Mutex<Vec<String>>>);

impl Heard {
    pub fn count(&self, path: &str) -> usize {
        self.0
            .lock()
            .unwrap()
            .iter()
            .filter(|heard| *heard == path)
            .count()
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.supervisor.stop_all();
        if let Some(run) = self.supervisor.host_socket().parent() {
            let _ = std::fs::remove_dir_all(run);
        }
    }
}

pub fn http_server(body: &'static str) -> (u16, Arc<AtomicUsize>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let hits = Arc::new(AtomicUsize::new(0));
    let counted = hits.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { return };
            counted.fetch_add(1, Ordering::SeqCst);
            let mut asked = [0u8; 4096];
            let _ = stream.read(&mut asked);
            let answer = format!(
                "HTTP/1.1 200 OK\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                body.len()
            );
            let _ = stream.write_all(answer.as_bytes());
        }
    });
    (port, hits)
}

pub fn seed_core(server: &Server) {
    let core = server.core_database();
    core.execute_batch(
        "CREATE TABLE granted (id INTEGER); CREATE TABLE secret (id INTEGER);
         INSERT INTO granted VALUES (1), (2); INSERT INTO secret VALUES (3);",
    )
    .unwrap();
}

pub fn wait_until(mut ready: impl FnMut() -> bool) -> bool {
    for _ in 0..100 {
        if ready() {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    false
}

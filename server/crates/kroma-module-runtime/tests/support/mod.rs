#![allow(dead_code)]

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use axum::body::Bytes;
use axum::extract::State;
use axum::http::Uri;
use axum::response::IntoResponse;
use axum::{Json, Router};
use kroma_http::loopback::unix_url;
use kroma_http::Loopback;
use kroma_module_host::{async_trait, ModuleJob, ServerModule};
use kroma_module_runtime::RemoteHost;

pub const HOST_TOKEN: &str = "sidecar-token";

#[derive(Clone, Debug)]
pub struct Call {
    pub path: String,
    pub query: String,
    pub body: String,
}

#[derive(Clone, Default)]
pub struct CoreLog(Arc<Mutex<Vec<Call>>>);

impl CoreLog {
    pub fn to(&self, path: &str) -> Vec<Call> {
        self.0
            .lock()
            .unwrap()
            .iter()
            .filter(|call| call.path == path)
            .cloned()
            .collect()
    }

    pub fn wait_for(&self, path: &str, count: usize) -> Vec<Call> {
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            let calls = self.to(path);
            if calls.len() >= count || Instant::now() > deadline {
                return calls;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    }
}

pub struct Sidecar {
    pub socket: PathBuf,
    pub core: CoreLog,
    pub host: RemoteHost,
}

impl Sidecar {
    pub fn url(&self, path: &str) -> String {
        format!("{}{path}", unix_url(&self.socket))
    }

    pub fn post(&self, path: &str, token: &str, body: serde_json::Value) -> u16 {
        Loopback::new()
            .header("authorization", format!("Bearer {token}"))
            .post_json(&self.url(path), &body)
            .expect("the sidecar answered")
            .status
    }
}

pub static EVENTS: Mutex<Vec<(String, serde_json::Value)>> = Mutex::new(Vec::new());

struct Demo;

fn ping_core(host: &RemoteHost) -> anyhow::Result<()> {
    use kroma_module_host::HostCtx;
    host.trigger_job("demo.ran", "test");
    Ok(())
}

fn fail(_: &RemoteHost) -> anyhow::Result<()> {
    anyhow::bail!("disk on fire")
}

fn explode(_: &RemoteHost) -> anyhow::Result<()> {
    panic!("boom")
}

#[async_trait]
impl ServerModule<RemoteHost> for Demo {
    fn id(&self) -> &'static str {
        "tv.kroma.demo"
    }

    fn jobs(&self) -> Vec<ModuleJob<RemoteHost>> {
        vec![
            ModuleJob {
                key: "demo.ping",
                category: "maintenance",
                schedule: Some("0 * * * *"),
                run: ping_core,
            },
            ModuleJob {
                key: "demo.fail",
                category: "maintenance",
                schedule: None,
                run: fail,
            },
            ModuleJob {
                key: "demo.explode",
                category: "maintenance",
                schedule: None,
                run: explode,
            },
        ]
    }

    fn events(&self) -> Vec<&'static str> {
        vec!["demo.ping", "demo.other"]
    }

    async fn on_event(&self, _host: RemoteHost, topic: String, payload: serde_json::Value) {
        EVENTS.lock().unwrap().push((topic, payload));
    }
}

pub struct NeedsSchema;

#[async_trait]
impl ServerModule<RemoteHost> for NeedsSchema {
    fn id(&self) -> &'static str {
        "tv.kroma.needs-schema"
    }

    fn migrations(&self) -> &'static str {
        "CREATE TABLE t (id INTEGER);"
    }
}

fn answer(path: &str, query: &str) -> serde_json::Value {
    match path {
        "/api/_host/setting" if query.contains("kind=str") => {
            serde_json::json!({ "value": "hello" })
        }
        "/api/_host/setting" if query.contains("kind=bool") => serde_json::json!({ "value": true }),
        "/api/_host/setting" => serde_json::json!({ "value": 42 }),
        "/api/_host/session" => serde_json::to_value(user(&["library.manage"])).unwrap(),
        "/api/_host/notify" => serde_json::json!({ "sent": 3 }),
        "/api/_host/enabled" => serde_json::json!({ "enabled": false }),
        "/api/_host/libraries" => serde_json::json!([
            { "id": "l1", "kind": "movie", "name": "Films", "folders": ["/films"] }
        ]),
        "/api/_host/secret" => serde_json::json!("s3cret"),
        "/api/_host/metadata-language" => serde_json::json!("fr-FR"),
        "/api/_host/contributions" => serde_json::json!([
            { "module_id": "tv.kroma.peer", "base_url": "http://127.0.0.1:1", "token": "t" }
        ]),
        _ => serde_json::json!({}),
    }
}

pub fn user(permissions: &[&str]) -> kroma_module_wire::User {
    serde_json::from_value(serde_json::json!({
        "id": "u1",
        "email": "a@b.c",
        "username": "ann",
        "permissions": permissions,
        "libraries": null,
        "createdAt": "2026-01-01T00:00:00Z",
        "hasPin": false,
    }))
    .expect("a user")
}

pub const UNDECLARED: &str = "tv.kroma.demo/undeclared";

async fn core_fallback(State(log): State<CoreLog>, uri: Uri, body: Bytes) -> impl IntoResponse {
    let query = uri.query().unwrap_or_default().to_string();
    let reply = answer(uri.path(), &query);
    let body = String::from_utf8_lossy(&body).into_owned();
    let refused = uri.path() == "/api/_host/notify" && body.contains(UNDECLARED);
    log.0.lock().unwrap().push(Call {
        path: uri.path().to_string(),
        query,
        body,
    });
    if refused {
        let refusal = serde_json::json!({ "error": "not declared" });
        return (axum::http::StatusCode::FORBIDDEN, Json(refusal));
    }
    (axum::http::StatusCode::OK, Json(reply))
}

fn start_core(log: CoreLog, socket: &Path) {
    serve(
        Router::new().fallback(core_fallback).with_state(log),
        socket,
    );
}

pub fn serve(app: Router, socket: &Path) {
    let _ = std::fs::remove_file(socket);
    let listener = std::os::unix::net::UnixListener::bind(socket).expect("bind");
    listener.set_nonblocking(true).expect("non-blocking");
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime");
        rt.block_on(async move {
            let listener = tokio::net::UnixListener::from_std(listener).expect("listener");
            axum::serve(listener, app).await.expect("serve");
        });
    });
}

pub fn scratch(name: &str) -> PathBuf {
    let dir = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(name);
    std::fs::create_dir_all(&dir).expect("tmp dir");
    dir
}

pub fn sidecar() -> &'static Sidecar {
    static BOOTED: OnceLock<Sidecar> = OnceLock::new();
    BOOTED.get_or_init(|| {
        let dir = scratch("sidecar");
        let core = CoreLog::default();
        let core_socket = dir.join("core.sock");
        start_core(core.clone(), &core_socket);
        let socket = dir.join("module.sock");
        let _ = std::fs::remove_file(&socket);
        std::env::set_var("KROMA_MODULE_ID", "tv.kroma.demo");
        std::env::set_var("KROMA_MODULE_SOCKET", &socket);
        std::env::set_var("KROMA_CORE_URL", format!("{}/", unix_url(&core_socket)));
        std::env::set_var("KROMA_HOST_TOKEN", HOST_TOKEN);
        std::env::set_var("KROMA_DB_PATH", dir.join("core.db").display().to_string());
        std::env::set_var("KROMA_DATA_DIR", dir.display().to_string());
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("runtime");
            let wire = move |host: &RemoteHost| {
                tx.send(host.clone()).expect("host handed out");
                Router::new()
            };
            rt.block_on(kroma_module_runtime::serve(wire, vec![Box::new(Demo)]))
                .expect("serve");
        });
        let host = rx.recv_timeout(Duration::from_secs(30)).expect("booted");
        let sidecar = Sidecar { socket, core, host };
        let deadline = Instant::now() + Duration::from_secs(10);
        while Loopback::new().get(&sidecar.url("/_health")).is_err() {
            assert!(Instant::now() < deadline, "module never came up");
            std::thread::sleep(Duration::from_millis(50));
        }
        sidecar
    })
}

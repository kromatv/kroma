use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::time::Duration;

use axum::Router;
use axum::routing::get;
use kroma_module_runtime::RemoteHost;
use kroma_module_sdk::db::{Run, Step};
use kroma_module_sdk::host::{HostStorage, ModuleJob, ServerModule};

static ENABLED: AtomicBool = AtomicBool::new(false);
static CALLS: AtomicU32 = AtomicU32::new(0);

const SCHEMA: &str = "CREATE TABLE IF NOT EXISTS enabled (at INTEGER NOT NULL);";

const STEPS: &[Step] = &[Step {
    name: "0002_steps",
    run: Run::Sql("CREATE TABLE steps (n INTEGER NOT NULL); INSERT INTO steps VALUES (2);"),
    rebuilds: false,
}];

fn routes() -> Router<RemoteHost> {
    Router::new()
        .route("/state", get(state))
        .route("/hold", get(hold))
}

fn name() -> String {
    static NAME: OnceLock<String> = OnceLock::new();
    NAME.get_or_init(kroma_module_sdk::primitives::random_token)
        .clone()
}

async fn state() -> String {
    let role = std::env::var("KROMA_MODULE_ROLE").unwrap_or_default();
    let enabled = if ENABLED.load(Ordering::SeqCst) {
        "enabled"
    } else {
        "idle"
    };
    let calls = CALLS.fetch_add(1, Ordering::SeqCst) + 1;
    format!("{role} {enabled} {calls}")
}

async fn hold() -> String {
    tokio::time::sleep(Duration::from_millis(800)).await;
    name()
}

fn nothing(_: &RemoteHost) -> anyhow::Result<()> {
    Ok(())
}

struct Lifecycle;

#[kroma_module_sdk::host::async_trait]
impl ServerModule<RemoteHost> for Lifecycle {
    fn id(&self) -> &'static str {
        "tv.example.lifecycle"
    }

    fn migrations(&self) -> &'static str {
        SCHEMA
    }

    fn steps(&self) -> &'static [Step] {
        STEPS
    }

    fn jobs(&self) -> Vec<ModuleJob<RemoteHost>> {
        vec![
            ModuleJob {
                key: "lifecycle.tidy",
                category: "maintenance",
                schedule: Some("0 * * * *"),
                run: nothing,
            },
            ModuleJob {
                key: "lifecycle.sweep",
                category: "maintenance",
                schedule: None,
                run: nothing,
            },
        ]
    }

    fn events(&self) -> Vec<&'static str> {
        vec!["item.updated"]
    }

    async fn on_enable(&self, host: RemoteHost) {
        ENABLED.store(true, Ordering::SeqCst);
        if let Ok(conn) = host.store().get() {
            let _ = conn.execute("INSERT INTO enabled (at) VALUES (1)", []);
        }
    }
}

kroma_module_runtime::module_main!(|_host| routes(), vec![Box::new(Lifecycle)]);

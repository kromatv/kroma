use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Duration;

use axum::extract::{Path, Query, RawQuery, State};
use axum::routing::get;
use axum::Router;
use kroma_module_runtime::RemoteHost;
use kroma_module_sdk::host::media::{self, Pcm, SampleFormat};
use kroma_module_sdk::host::process::Command;
use kroma_module_sdk::host::{HostCtx, HostStorage, ServerModule};

static BACKGROUND: AtomicU32 = AtomicU32::new(0);
static STOP_FILE: &str = "stopped.txt";

fn routes() -> Router<RemoteHost> {
    Router::new()
        .route("/echo", get(|| async { "still here" }))
        .route("/explode", get(explode))
        .route("/file", get(read_a_file))
        .route("/read", get(read_at))
        .route("/write", get(write_at))
        .route("/fetch", get(fetch))
        .route(
            "/setting",
            get(|State(host): State<RemoteHost>| async move { host.setting_str("theKey", "absent") }),
        )
        .route("/own", get(own_database))
        .route("/core/{table}", get(core_table))
        .route("/keep", get(keep_a_file))
        .route("/downloads/{id}", get(list_a_download))
        .route("/run/{program}", get(run_a_program))
        .route("/background", get(start_background))
        .route("/background/count", get(background_count))
        .route("/who", get(who))
        .route("/slow", get(slow))
        .route("/start/{program}", get(start_a_program))
        .route("/ensure/{program}", get(ensure_a_program))
        .route("/tamper/{program}", get(tamper))
        .route("/decode", get(decode))
}

async fn explode() -> &'static str {
    panic!("a bug in the module")
}

async fn read_a_file() -> String {
    format!("{:?}", std::fs::read_to_string("/etc/passwd").map_err(|e| e.kind()))
}

async fn read_at(RawQuery(path): RawQuery) -> String {
    let read = std::fs::read_to_string(path.unwrap_or_default());
    format!("{:?}", read.map_err(|e| e.kind()))
}

async fn write_at(RawQuery(path): RawQuery) -> String {
    let written = std::fs::write(path.unwrap_or_default(), "written");
    format!("{:?}", written.map_err(|e| e.kind()))
}

async fn fetch(RawQuery(url): RawQuery) -> String {
    let url = url.unwrap_or_default();
    match kroma_module_sdk::http::Fetch::new().purpose("probe").get(&url) {
        Ok(response) => format!("{} {}", response.status, response.text()),
        Err(error) => format!("refused: {error:#}"),
    }
}

async fn own_database(State(host): State<RemoteHost>) -> String {
    let answered = (|| -> anyhow::Result<i64> {
        let conn = host.store().get()?;
        conn.execute_batch("CREATE TABLE IF NOT EXISTS mine (id INTEGER PRIMARY KEY, name TEXT)")?;
        conn.execute("INSERT INTO mine (name) VALUES (?1)", ["row"])?;
        Ok(conn.query_row("SELECT COUNT(*) FROM mine", [], |row| row.get(0))?)
    })();
    format!("{answered:?}")
}

async fn core_table(State(host): State<RemoteHost>, Path(table): Path<String>) -> String {
    let answered = (|| -> anyhow::Result<i64> {
        let conn = host.db().get()?;
        Ok(conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| row.get(0))?)
    })();
    match answered {
        Ok(count) => format!("rows {count}"),
        Err(error) => format!("refused: {error:#}"),
    }
}

fn module_dir(host: &RemoteHost) -> std::path::PathBuf {
    host.data_dir().join("modules").join("tv.example.guest")
}

async fn keep_a_file(State(host): State<RemoteHost>) -> String {
    let path = module_dir(&host).join("kept.txt");
    let written = std::fs::write(&path, "kept").and_then(|()| std::fs::read_to_string(&path));
    format!("{written:?}")
}

async fn list_a_download(State(host): State<RemoteHost>, Path(id): Path<String>) -> String {
    let folder = host.data_dir().join("torrents/downloads").join(id);
    let listed = std::fs::read_dir(folder).and_then(|entries| {
        let mut files = Vec::new();
        for entry in entries {
            let entry = entry?;
            if entry.file_type()?.is_file() {
                files.push(entry.file_name().to_string_lossy().into_owned());
            }
        }
        Ok(files)
    });
    format!("{:?}", listed.map_err(|e| e.kind()))
}

async fn run_a_program(Path(program): Path<String>) -> String {
    match Command::new(program).arg("hello").output(Duration::from_secs(10)) {
        Ok(output) => format!("{} {}", output.code, String::from_utf8_lossy(&output.stdout)),
        Err(reason) => format!("refused: {reason}"),
    }
}

async fn start_a_program(Path(program): Path<String>) -> String {
    match Command::new(program).arg("30").spawn() {
        Ok(_) => "started".to_string(),
        Err(reason) => format!("refused: {reason}"),
    }
}

async fn slow() -> &'static str {
    tokio::time::sleep(Duration::from_secs(3)).await;
    "done"
}

async fn start_background() -> &'static str {
    tokio::spawn(async {
        loop {
            BACKGROUND.fetch_add(1, Ordering::Relaxed);
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    });
    "started"
}

async fn background_count() -> String {
    BACKGROUND.load(Ordering::Relaxed).to_string()
}

async fn ensure_a_program(Path(program): Path<String>) -> String {
    format!("{:?}", kroma_module_sdk::host::process::ensure(&program))
}

async fn tamper(State(host): State<RemoteHost>, Path(program): Path<String>) -> String {
    let helper = host.data_dir().join("helpers").join("tv.example.guest").join(program);
    format!("{:?}", std::fs::write(helper, "#!/bin/sh\necho tampered\n").map_err(|e| e.kind()))
}

async fn decode(Query(asked): Query<HashMap<String, String>>) -> String {
    let pcm = Pcm {
        sample_rate: 16_000,
        channels: 1,
        format: SampleFormat::F32le,
    };
    let source = std::path::Path::new(&asked["source"]);
    let track = asked["track"].parse().unwrap_or(0);
    let into = std::path::Path::new(&asked["into"]);
    let decoded = media::decode_audio(source, track, pcm, into);
    let seen = std::fs::metadata(into).map(|meta| meta.len()).map_err(|e| e.kind());
    format!("{decoded:?} {seen:?}")
}

async fn who() -> String {
    static NAME: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    tokio::time::sleep(Duration::from_millis(5)).await;
    NAME.get_or_init(kroma_module_sdk::primitives::random_token).clone()
}

struct Guest;

#[kroma_module_sdk::host::async_trait]
impl ServerModule<RemoteHost> for Guest {
    fn id(&self) -> &'static str {
        "tv.example.guest"
    }

    async fn on_disable(&self, host: RemoteHost) {
        let _ = std::fs::write(module_dir(&host).join(STOP_FILE), "stopped");
    }
}

kroma_module_runtime::module_main!(|_host| routes(), vec![Box::new(Guest)]);

//! Reusable `#[cfg(test)]` harness for services that need a full [`SharedState`].
//!
//! [`test_state`] builds a minimal, real [`AppState`] over a fresh temp-file
//! SQLite DB, a no-op [`Embedder`](crate::ports::Embedder), no TMDB key and no
//! `web_dir`. Nothing here talks to the network, a module sidecar, or `ffmpeg`.
//!
//! The `seed_*` helpers insert the catalog rows a service under test reads (a
//! library, a movie, a show + episode, a pipeline-ledger task) via raw SQL.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use crate::config::Config;
use crate::db;
use crate::ports::{Embedder, NoopEmbedder};
use crate::services::settings::Settings;
use crate::state::{AppState, SharedState};

// Monotonic counter for seeded rows that must not collide across parallel tests.
static SEQ: AtomicU32 = AtomicU32::new(0);

// A minimal Config: a temp `data_dir`, no media dirs (nothing to scan), no
// TMDB key (network features cleanly no-op), no `web_dir`.
fn test_config(data_dir: PathBuf) -> Config {
    Config {
        host: "127.0.0.1".into(),
        port: 0,
        data_dir,
        tmdb_language: "en-US".into(),
        ..Default::default()
    }
}

// The state takes the scratch dir over, so it is removed once the last handle
// goes rather than when the test body ends - jobs the test triggers keep
// writing into it from their own threads.
fn build_state(embedder: Arc<dyn Embedder>, tmdb_api_key: Option<&str>) -> SharedState {
    let scratch = kroma_testing::temp_dir("engine-test");
    let db = db::init(&scratch.path().join("kroma.db")).expect("init db");
    let mut config = test_config(scratch.path().to_path_buf());
    config.tmdb_api_key = tmdb_api_key.map(str::to_string);
    let settings = Settings::load(&db);
    let state = AppState::new(config, false, db, settings, embedder, HashMap::new(), &[]);
    state.own_scratch_dir(scratch);
    state
}

/// Like [`test_state`], but with a TMDB key in the config.
///
/// For services that refuse to start without one. It does NOT make the network
/// reachable and no test may rely on it doing so: it only gets a service past
/// its "TMDB is not configured" guard, so the paths that never reach a request
/// (an empty library, an un-enriched show, a cancelled run) can be exercised.
pub(crate) fn test_state_with_tmdb(key: &str) -> SharedState {
    build_state(Arc::new(NoopEmbedder), Some(key))
}

/// Like [`test_state`], but with a real (if trivial) embedder.
///
/// [`NoopEmbedder`] reports dim 0 and returns empty vectors, which makes every
/// dimension comparison vacuous - a pass that stored nothing looks identical to
/// one that stored everything. This one produces a vector of the requested
/// length so "already at the active dim" is actually distinguishable.
pub(crate) fn test_state_with_embedder(embedder: Arc<dyn Embedder>) -> SharedState {
    build_state(embedder, None)
}

/// Build a minimal, real [`SharedState`]: fresh temp DB, loaded settings, a no-op
/// embedder, empty module services, no module jobs, `ffprobe_available = false`.
/// The state owns the scratch `data_dir`, which goes when its last clone does.
pub(crate) fn test_state() -> SharedState {
    build_state(Arc::new(NoopEmbedder), None)
}

/// Insert a library row (idempotent). `kind` is `"movies" | "shows" | "mixed"`.
pub(crate) fn seed_library(state: &SharedState, id: &str, kind: &str) {
    state
        .db
        .get()
        .unwrap()
        .execute(
            &format!(
                "INSERT OR IGNORE INTO libraries (id,name,kind,path,added_at) \
                 VALUES ('{id}','Lib {id}','{kind}','/x/{id}','t')"
            ),
            [],
        )
        .unwrap();
}

/// Insert a movie item (creating a `movies` library if needed). `abs_path` is a
/// (non-existent) file path so cache-invalidation paths have something to touch.
pub(crate) fn seed_movie(state: &SharedState, id: &str) {
    seed_library(state, "lib-movies", "movies");
    let conn = state.db.get().unwrap();
    conn.execute(
        &format!(
            "INSERT INTO items (id,kind,title,container,library,abs_path,added_at) \
             VALUES ('{id}','movie','Title {id}','mkv','lib-movies','/media/{id}.mkv','t')"
        ),
        [],
    )
    .unwrap();
    conn.execute(
        &format!("INSERT INTO files (id,item_id,abs_path) VALUES ('{id}-f','{id}','/media/{id}.mkv')"),
        [],
    )
    .unwrap();
}

/// Insert a show plus one episode under season 1 (creating a `shows` library if
/// needed). Returns `(show_id, episode_id)` for convenience.
pub(crate) fn seed_show_episode(state: &SharedState, show_id: &str, ep_id: &str) -> (String, String) {
    seed_library(state, "lib-shows", "shows");
    let conn = state.db.get().unwrap();
    conn.execute(
        &format!(
            "INSERT INTO shows (id,library,title,added_at) VALUES ('{show_id}','lib-shows','Show {show_id}','t')"
        ),
        [],
    )
    .unwrap();
    conn.execute(
        &format!(
            "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,abs_path,added_at) \
             VALUES ('{ep_id}','episode','Ep {ep_id}','mkv','lib-shows','{show_id}',1,1,'/media/{ep_id}.mkv','t')"
        ),
        [],
    )
    .unwrap();
    conn.execute(
        &format!("INSERT INTO files (id,item_id,abs_path) VALUES ('{ep_id}-f','{ep_id}','/media/{ep_id}.mkv')"),
        [],
    )
    .unwrap();
    (show_id.to_string(), ep_id.to_string())
}

/// Insert one pipeline-ledger task in an explicit `status`, with an optional error
/// message (for `failed` rows). Use [`crate::db::pipeline::enqueue`] instead when a
/// plain `pending` task suffices.
pub(crate) fn seed_task(
    state: &SharedState,
    stage: &str,
    subject_kind: &str,
    subject_id: &str,
    status: &str,
    error: Option<&str>,
) {
    let err_sql = match error {
        Some(e) => format!("'{e}'"),
        None => "NULL".to_string(),
    };
    state
        .db
        .get()
        .unwrap()
        .execute(
            &format!(
                "INSERT INTO pipeline_tasks \
                   (stage,subject_kind,subject_id,status,error,enqueued_at,updated_at) \
                 VALUES ('{stage}','{subject_kind}','{subject_id}','{status}',{err_sql},1,1)"
            ),
            [],
        )
        .unwrap();
}

/// Record a finished play in `play_history` (for the trending / for-you home rows).
/// `ended_at` is epoch **seconds** (the table's convention), so pass a recent
/// `now`-ish value for the row to fall inside the trending window.
pub(crate) fn seed_play(state: &SharedState, user_id: &str, item_id: &str, ended_at: i64) {
    let id = format!("h-{}", SEQ.fetch_add(1, Ordering::Relaxed));
    state
        .db
        .get()
        .unwrap()
        .execute(
            &format!(
                "INSERT INTO play_history (id,user_id,item_id,kind,title,started_at,ended_at,watched_ms) \
                 VALUES ('{id}','{user_id}','{item_id}','movie','Title {item_id}',{start},{ended_at},1000)",
                start = ended_at - 100
            ),
            [],
        )
        .unwrap();
}

/// A `User` value with no DB row behind it, for services that only read the
/// struct. Use [`test_state`] + `kroma_db::create_user` when the row must exist.
pub(crate) fn test_user(id: &str, permissions: Vec<crate::model::Permission>) -> crate::model::User {
    crate::model::User {
        id: id.into(),
        email: format!("{id}@example.test"),
        username: id.into(),
        avatar_url: None,
        language: None,
        audio_language: None,
        subtitle_language: None,
        permissions,
        created_at: "now".into(),
        has_pin: false,
    }
}

/// Epoch **seconds** "now" for seeding recent `play_history` rows.
pub(crate) fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// A fake OpenAI-compatible chat endpoint, for the LLM-backed jobs.
///
/// The provider base URL is a plain setting and the transport shells out to
/// curl, so nothing has to be stubbed: point `llmBaseUrl` at one of these and
/// the real client speaks to it. Each request is recorded so a test can assert
/// on the prompt that was actually sent.
pub(crate) struct FakeLlm {
    base: String,
    seen: Arc<std::sync::Mutex<Vec<serde_json::Value>>>,
}

impl FakeLlm {
    /// Answer every completion with `content`.
    pub(crate) fn always(content: &str) -> Self {
        let content = content.to_string();
        Self::routed(move |_| (200, serde_json::json!({
            "choices": [{ "message": { "content": content } }]
        })))
    }

    /// Answer with `status` and a body that is not a completion at all.
    pub(crate) fn failing(status: u16) -> Self {
        Self::routed(move |_| (status, serde_json::json!({ "error": "nope" })))
    }

    /// Full control: map the request body to `(status, response body)`.
    pub(crate) fn routed(
        route: impl Fn(&serde_json::Value) -> (u16, serde_json::Value) + Send + 'static,
    ) -> Self {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().unwrap().port();
        let seen = Arc::new(std::sync::Mutex::new(Vec::new()));
        let log = Arc::clone(&seen);

        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { break };
                let Some(request) = read_json_request(&stream) else { continue };
                let (status, reply) = route(&request);
                log.lock().unwrap().push(request);
                write_json_reply(&mut stream, status, &reply);
            }
        });

        Self { base: format!("http://127.0.0.1:{port}"), seen }
    }

    /// The endpoint's base URL, for `llmBaseUrl`.
    pub(crate) fn base(&self) -> &str {
        &self.base
    }

    /// Every chat request this endpoint received, in order.
    pub(crate) fn requests(&self) -> Vec<serde_json::Value> {
        self.seen.lock().unwrap().clone()
    }

    /// Point a bare `Settings` at this endpoint (for services that take
    /// `&Settings` rather than a whole state).
    pub(crate) fn configure_settings(&self, settings: &Settings, pool: &db::Pool) {
        settings.set_patch(
            pool,
            std::collections::BTreeMap::from([
                ("llmEnabled".to_string(), serde_json::json!(true)),
                ("llmProvider".to_string(), serde_json::json!("openai")),
                ("llmBaseUrl".to_string(), serde_json::json!(self.base)),
                ("llmModel".to_string(), serde_json::json!("test-model")),
                ("llmApiKey".to_string(), serde_json::json!("test-key")),
            ]),
        );
    }

    /// Point a state's LLM settings at this endpoint.
    pub(crate) fn configure(&self, state: &SharedState) {
        use kroma_module_host::HostCtx as _;
        state.set_settings(std::collections::BTreeMap::from([
            ("llmEnabled".to_string(), serde_json::json!(true)),
            ("llmProvider".to_string(), serde_json::json!("openai")),
            ("llmBaseUrl".to_string(), serde_json::json!(self.base)),
            ("llmModel".to_string(), serde_json::json!("test-model")),
            ("llmApiKey".to_string(), serde_json::json!("test-key")),
        ]));
    }
}

// Reads one HTTP request off `stream` and parses its body as JSON. `None`
// when the peer sent nothing.
fn read_json_request(stream: &std::net::TcpStream) -> Option<serde_json::Value> {
    use std::io::{BufRead, BufReader, Read};

    let mut reader = BufReader::new(stream.try_clone().ok()?);
    let mut line = String::new();
    if reader.read_line(&mut line).unwrap_or(0) == 0 {
        return None;
    }
    let mut len = 0usize;
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header).unwrap_or(0) == 0 || header == "\r\n" {
            break;
        }
        if let Some(v) = header.to_ascii_lowercase().strip_prefix("content-length:") {
            len = v.trim().parse().unwrap_or(0);
        }
    }
    let mut body = vec![0u8; len];
    if len > 0 {
        let _ = reader.read_exact(&mut body);
    }
    Some(serde_json::from_slice(&body).unwrap_or(serde_json::Value::Null))
}

fn write_json_reply(stream: &mut std::net::TcpStream, status: u16, reply: &serde_json::Value) {
    use std::io::Write;

    let payload = reply.to_string();
    let head = format!(
        "HTTP/1.1 {status} X\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n",
        payload.len()
    );
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(payload.as_bytes());
    let _ = stream.flush();
}

/// A fake TMDB, for the services that go through it.
///
/// The base is a `#[cfg(test)]` override on `infra::metadata::client`, so the
/// real client code runs - curl, the api_key param, the JSON decode - against a
/// server on localhost. Points itself at the current thread on construction and
/// releases it on drop, so parallel tests never share a base.
pub(crate) struct FakeTmdb {
    base: String,
    seen: Arc<std::sync::Mutex<Vec<String>>>,
}

impl FakeTmdb {
    /// `route` maps a request path (e.g. `/movie/603`) to `(status, body)`.
    pub(crate) fn start(
        route: impl Fn(&str) -> (u16, serde_json::Value) + Send + 'static,
    ) -> Self {
        use std::io::Write;

        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().unwrap().port();
        let seen = Arc::new(std::sync::Mutex::new(Vec::new()));
        let log = Arc::clone(&seen);

        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { break };
                let Some(full) = read_request_target(&stream) else { continue };
                // "/movie/603?api_key=x" -> "/movie/603"
                let path = full.split('?').next().unwrap_or("").to_string();
                log.lock().unwrap().push(full);

                let (status, body) = route(&path);
                let payload = body.to_string();
                let head = format!(
                    "HTTP/1.1 {status} X\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n",
                    payload.len()
                );
                let _ = stream.write_all(head.as_bytes());
                let _ = stream.write_all(payload.as_bytes());
                let _ = stream.flush();
            }
        });

        let base = format!("http://127.0.0.1:{port}");
        crate::infra::metadata::test_override::set(&base);
        Self { base, seen }
    }

    /// Every request path this fake received, query string included.
    pub(crate) fn requests(&self) -> Vec<String> {
        self.seen.lock().unwrap().clone()
    }

    #[allow(dead_code)]
    pub(crate) fn base(&self) -> &str {
        &self.base
    }
}

impl Drop for FakeTmdb {
    fn drop(&mut self) {
        crate::infra::metadata::test_override::clear();
    }
}

// Reads one HTTP request and returns its target (`"/movie/603?api_key=x"`).
// `None` when the peer sent nothing.
fn read_request_target(stream: &std::net::TcpStream) -> Option<String> {
    use std::io::{BufRead, BufReader};

    let mut reader = BufReader::new(stream.try_clone().ok()?);
    let mut request = String::new();
    if reader.read_line(&mut request).unwrap_or(0) == 0 {
        return None;
    }
    // Drain the headers so the client sees a clean close.
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header).unwrap_or(0) == 0 || header == "\r\n" {
            break;
        }
    }
    // "GET /movie/603?api_key=x HTTP/1.1" -> "/movie/603?api_key=x"
    Some(request.split_whitespace().nth(1).unwrap_or("").to_string())
}

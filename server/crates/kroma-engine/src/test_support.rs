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
use crate::point::Point;
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
fn build_state(embedder: Point, tmdb_api_key: Option<&str>) -> SharedState {
    let scratch = kroma_testing::temp_dir("engine-test");
    let db = db::init(&scratch.path().join("kroma.db")).expect("init db");
    let mut config = test_config(scratch.path().to_path_buf());
    config.tmdb_api_key = tmdb_api_key.map(str::to_string);
    let settings = Settings::load(&db);
    let state =
        AppState::new(config, false, db, settings, embedder, HashMap::new(), &[], Arc::new(|_| Vec::new()));
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
    build_state(Point::absent("embedder"), Some(key))
}

/// Like [`test_state`], but with a point that answers.
///
/// An absent point embeds to nothing and reports dim 0, which makes every
/// dimension comparison vacuous - a pass that stored nothing looks identical to
/// one that stored everything. A stub that produces vectors of a known width
/// makes "already at the active dim" distinguishable.
pub(crate) fn test_state_with_embedder(embedder: Point) -> SharedState {
    build_state(embedder, None)
}

/// A stubbed `embedder` point of a fixed width, whose vectors carry a call
/// counter in their first component so a re-embed is distinguishable from a skip.
pub(crate) fn fixed_dim_embedder(dim: usize) -> Point {
    let calls = std::sync::atomic::AtomicUsize::new(0);
    Point::stub("embedder", move |method, body| match method {
        "meta" => Some(serde_json::json!({ "dim": dim, "relevance_floor": 0.1 })),
        "embed" => Some(serde_json::json!(stamped(dim, &calls))),
        "embed_batch" => {
            let n = body["texts"].as_array().map_or(0, Vec::len);
            Some(serde_json::json!(
                (0..n).map(|_| stamped(dim, &calls)).collect::<Vec<_>>()
            ))
        }
        _ => None,
    })
}

fn stamped(dim: usize, calls: &std::sync::atomic::AtomicUsize) -> Vec<f32> {
    let n = calls.fetch_add(1, Ordering::Relaxed) + 1;
    let mut v = vec![0.0f32; dim];
    if let Some(first) = v.first_mut() {
        *first = n as f32;
    }
    v
}

/// Build a minimal, real [`SharedState`]: fresh temp DB, loaded settings, an
/// unanswered `embedder` point, empty module services, no module jobs, and
/// `ffprobe_available = false`.
/// The state owns the scratch `data_dir`, which goes when its last clone does.
pub(crate) fn test_state() -> SharedState {
    build_state(Point::absent("embedder"), None)
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

/// Write a `channels`-channel 16-bit PCM WAV of `secs` seconds at `RATE` Hz.
///
/// Real audio bytes for the passes that shell out to `ffmpeg` (loudness,
/// fingerprinting), so their success paths run without shipping a media fixture.
/// One distinct tone per channel, so a centre-channel measurement differs from
/// the full mix.
pub(crate) fn write_test_wav(path: &std::path::Path, secs: f32, channels: u16) {
    const RATE: u32 = 11_025;
    let frames = (secs * RATE as f32) as u32;
    let mut data = Vec::with_capacity(frames as usize * channels as usize * 2);
    for i in 0..frames {
        for c in 0..channels {
            let hz = 220.0 + 80.0 * f32::from(c);
            let t = i as f32 / RATE as f32;
            let s = (12_000.0 * (std::f32::consts::TAU * hz * t).sin()) as i16;
            data.extend_from_slice(&s.to_le_bytes());
        }
    }
    let block_align = channels * 2;
    let byte_rate = RATE * u32::from(block_align);
    let mut out = Vec::with_capacity(44 + data.len());
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data.len() as u32).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&channels.to_le_bytes());
    out.extend_from_slice(&RATE.to_le_bytes());
    out.extend_from_slice(&byte_rate.to_le_bytes());
    out.extend_from_slice(&block_align.to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&(data.len() as u32).to_le_bytes());
    out.extend_from_slice(&data);
    std::fs::write(path, out).expect("write the test wav");
}

/// A throwaway Apple `.p8` auth key (PKCS#8 P-256), built here rather than
/// stored as a PEM literal so no file in the tree looks like a private key.
///
/// The scalar is a counter, not a secret: it exists only so the APNs identity
/// and the requests signed with it can be exercised without Apple's issuance.
pub(crate) fn test_apns_key_p8() -> String {
    let mut ec = vec![0x02, 0x01, 0x01, 0x04, 0x20];
    ec.extend(1u8..=32);
    let ec = der(0x30, &ec);
    const ALG: &[u8] = &[
        0x30, 0x13, 0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02, 0x01, 0x06, 0x08, 0x2A, 0x86,
        0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07,
    ];
    let mut body = vec![0x02, 0x01, 0x00];
    body.extend_from_slice(ALG);
    body.extend_from_slice(&der(0x04, &ec));
    let pkcs8 = der(0x30, &body);

    let b64 = base64_standard(&pkcs8);
    let mut pem = String::from("-----BEGIN PRIVATE KEY-----\n");
    for line in b64.as_bytes().chunks(64) {
        pem.push_str(std::str::from_utf8(line).expect("ascii"));
        pem.push('\n');
    }
    pem.push_str("-----END PRIVATE KEY-----\n");
    pem
}

fn der(tag: u8, body: &[u8]) -> Vec<u8> {
    let mut out = vec![tag, body.len() as u8];
    out.extend_from_slice(body);
    out
}

fn base64_standard(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = (u32::from(chunk[0]) << 16)
            | (u32::from(chunk.get(1).copied().unwrap_or(0)) << 8)
            | u32::from(chunk.get(2).copied().unwrap_or(0));
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(char::from(ALPHABET[((n >> (18 - 6 * i)) & 63) as usize]));
            } else {
                out.push('=');
            }
        }
    }
    out
}

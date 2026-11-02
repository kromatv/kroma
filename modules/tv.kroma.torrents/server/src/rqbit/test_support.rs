//! A stand-in for rqbit's HTTP API, and an engine pointed at it.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex, PoisonError};

use kroma_module_sdk::host::process::{Child, Command};

use super::api::Api;
use super::{RqbitConfig, RqbitEngine};

const PASSWORD: &str = "test-password";

#[derive(Debug, Clone)]
pub(crate) struct Seen {
    pub path_and_query: String,
    pub head: String,
    pub body: Vec<u8>,
}

/// Answers `"METHOD /path"` as told and remembers what it was asked. Anything it
/// was not told about is a 404.
pub(crate) struct StubApi {
    pub port: u16,
    seen: Arc<Mutex<Vec<(String, Seen)>>>,
}

impl StubApi {
    pub(crate) fn serving(routes: &[(&str, u16, &str)]) -> Self {
        let routes: Vec<(String, u16, String)> = routes
            .iter()
            .map(|(route, status, body)| (route.to_string(), *status, body.to_string()))
            .collect();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let log = Arc::clone(&seen);
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(stream) = stream else { break };
                answer(stream, &routes, &log);
            }
        });
        Self { port, seen }
    }

    /// What was asked of one `"METHOD /path"`, oldest first.
    pub(crate) fn seen(&self, route: &str) -> Vec<Seen> {
        self.seen
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .iter()
            .filter(|(asked, _)| asked == route)
            .map(|(_, seen)| seen.clone())
            .collect()
    }
}

fn answer(
    mut stream: TcpStream,
    routes: &[(String, u16, String)],
    log: &Mutex<Vec<(String, Seen)>>,
) {
    let mut raw = Vec::new();
    let mut chunk = [0_u8; 4096];
    let head_end = loop {
        if let Some(at) = raw.windows(4).position(|window| window == b"\r\n\r\n") {
            break at + 4;
        }
        match stream.read(&mut chunk) {
            Ok(0) | Err(_) => return,
            Ok(read) => raw.extend_from_slice(&chunk[..read]),
        }
    };
    let head = String::from_utf8_lossy(&raw[..head_end]).into_owned();
    let length = head
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().ok())?
        })
        .unwrap_or(0);
    while raw.len() < head_end + length {
        match stream.read(&mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(read) => raw.extend_from_slice(&chunk[..read]),
        }
    }
    let mut parts = head.split_whitespace();
    let method = parts.next().unwrap_or_default().to_string();
    let path_and_query = parts.next().unwrap_or_default().to_string();
    let path = path_and_query.split('?').next().unwrap_or_default();
    let route = format!("{method} {path}");
    log.lock().unwrap_or_else(PoisonError::into_inner).push((
        route.clone(),
        Seen {
            path_and_query: path_and_query.clone(),
            head: head.clone(),
            body: raw[head_end..].to_vec(),
        },
    ));
    let (status, body) = routes
        .iter()
        .find(|(known, _, _)| *known == route)
        .map_or((404, "{}"), |(_, status, body)| (*status, body.as_str()));
    let reply = format!(
        "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(reply.as_bytes());
}

pub(crate) fn sleeper() -> Child {
    Command::new("sleep").arg("30").spawn().unwrap()
}

/// An engine that talks to `stub`, its helper a process that only waits.
pub(crate) fn engine_over(stub: &StubApi, cfg: RqbitConfig) -> Arc<RqbitEngine> {
    let work_dir = kroma_module_sdk::testing::temp_dir("engine-work");
    let cfg = RqbitConfig {
        work_dir: work_dir.path().join("adding"),
        ..cfg
    };
    std::mem::forget(work_dir);
    RqbitEngine::attached(
        sleeper(),
        Api::new(stub.port, PASSWORD),
        "9.1.0".into(),
        &cfg,
    )
}

/// An engine with the work directory `cfg` names, for a test that reads it.
pub(crate) fn engine_with_work_dir(stub: &StubApi, cfg: RqbitConfig) -> Arc<RqbitEngine> {
    RqbitEngine::attached(
        sleeper(),
        Api::new(stub.port, PASSWORD),
        "9.1.0".into(),
        &cfg,
    )
}

const DONE: &str = "script-reached-its-end\n";

/// The lines of a shell script that writes its command and environment to `dump`.
pub(crate) fn dumping_to(dump: &std::path::Path) -> String {
    let dump = dump.display();
    format!(
        "printf '%s\\n' \"$@\" > {dump}\nenv >> {dump}\nprintf '{DONE}' >> {dump}\nexec sleep 30"
    )
}

/// What a script from [`dumping_to`] wrote, once it has.
pub(crate) fn read_dump(dump: &std::path::Path) -> String {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    loop {
        let text = std::fs::read_to_string(dump).unwrap_or_default();
        if text.ends_with(DONE) || std::time::Instant::now() >= deadline {
            return text;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
}

/// A shell script in `dir` standing in for the helper.
#[cfg(unix)]
pub(crate) fn helper_script(dir: &std::path::Path, body: &str) -> std::path::PathBuf {
    use std::os::unix::fs::PermissionsExt;

    let path = dir.join("fake-rqbit");
    std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();
    path
}

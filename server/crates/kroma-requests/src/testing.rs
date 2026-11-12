//! A fake TMDB, for the tests of what goes through it, here and in the core.

use std::sync::Arc;

use kroma_module_host::HostStorage;

use crate::model::{MediaRequest, RequestStatus};
use crate::tmdb::test_override;

/// The notification a request's transition raises, through `state`'s own delivery.
pub fn notify_requester<S: HostStorage>(
    state: &S,
    req: &MediaRequest,
    status: RequestStatus,
    link: &str,
) {
    crate::lifecycle::notify_requester(state, req, status, link);
}

/// A fake TMDB, for the services that go through it.
///
/// The base is a test-only override on [`crate::tmdb`], so the real client code
/// runs - the api_key param, the JSON decode - against a server on localhost.
/// Points itself at the current thread on construction and releases it on drop,
/// so parallel tests never share a base.
pub struct FakeTmdb {
    base: String,
    seen: Arc<std::sync::Mutex<Vec<String>>>,
    gate: Option<std::sync::MutexGuard<'static, ()>>,
}

static SHARED_TMDB: std::sync::Mutex<()> = std::sync::Mutex::new(());

impl FakeTmdb {
    /// `route` maps a request path (e.g. `/movie/603`) to `(status, body)`.
    pub fn start(route: impl Fn(&str) -> (u16, serde_json::Value) + Send + 'static) -> Self {
        let (base, seen) = serve_json(route);
        test_override::set(&base);
        Self {
            base,
            seen,
            gate: None,
        }
    }

    /// Like [`FakeTmdb::start`], but visible to threads the code under test
    /// spawns. Holds a process-wide gate, so tests using it run one at a time.
    pub fn start_shared(route: impl Fn(&str) -> (u16, serde_json::Value) + Send + 'static) -> Self {
        let gate = SHARED_TMDB
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let (base, seen) = serve_json(route);
        test_override::set_shared(Some(&base));
        Self {
            base,
            seen,
            gate: Some(gate),
        }
    }

    /// Every request path this fake received, query string included.
    pub fn requests(&self) -> Vec<String> {
        self.seen.lock().unwrap().clone()
    }

    /// Where this fake listens.
    pub fn base(&self) -> &str {
        &self.base
    }
}

impl Drop for FakeTmdb {
    fn drop(&mut self) {
        if self.gate.is_some() {
            test_override::set_shared(None);
        }
        test_override::clear();
    }
}

type Seen = Arc<std::sync::Mutex<Vec<String>>>;

/// A local HTTP server answering every GET with `route(path)`, as JSON. Returns
/// its base URL and every request target it received, query string included.
pub fn serve_json(
    route: impl Fn(&str) -> (u16, serde_json::Value) + Send + 'static,
) -> (String, Seen) {
    serve_bytes(move |path| {
        let (status, body) = route(path);
        (status, body.to_string().into_bytes())
    })
}

/// Like [`serve_json`], but answering with the raw bytes `route(path)` returns.
pub fn serve_bytes(route: impl Fn(&str) -> (u16, Vec<u8>) + Send + 'static) -> (String, Seen) {
    use std::io::Write;

    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
    let port = listener.local_addr().unwrap().port();
    let seen = Arc::new(std::sync::Mutex::new(Vec::new()));
    let log = Arc::clone(&seen);

    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { break };
            let Some(full) = read_request_target(&stream) else {
                continue;
            };
            // "/movie/603?api_key=x" -> "/movie/603"
            let path = full.split('?').next().unwrap_or("").to_string();
            log.lock().unwrap().push(full);

            let (status, payload) = route(&path);
            let head = format!(
                "HTTP/1.1 {status} X\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n",
                payload.len()
            );
            let _ = stream.write_all(head.as_bytes());
            let _ = stream.write_all(&payload);
            let _ = stream.flush();
        }
    });

    (format!("http://127.0.0.1:{port}"), seen)
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

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub(crate) struct RecordedRequest {
    pub(crate) target: String,
    headers: Vec<(String, String)>,
    pub(crate) body: String,
}

impl RecordedRequest {
    pub(crate) fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }
}

pub(crate) struct RecordingServer {
    base: String,
    seen: Arc<Mutex<Vec<RecordedRequest>>>,
}

impl RecordingServer {
    pub(crate) fn replying(status: u16, body: &str) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().unwrap().port();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let log = Arc::clone(&seen);
        let body = body.to_string();

        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { break };
                let Some(request) = read_request(&stream) else {
                    continue;
                };
                log.lock().unwrap().push(request);
                write_reply(&mut stream, status, &body);
            }
        });

        Self {
            base: format!("http://127.0.0.1:{port}"),
            seen,
        }
    }

    pub(crate) fn base(&self) -> &str {
        &self.base
    }

    pub(crate) fn requests(&self) -> Vec<RecordedRequest> {
        self.seen.lock().unwrap().clone()
    }
}

fn read_request(stream: &TcpStream) -> Option<RecordedRequest> {
    let mut reader = BufReader::new(stream.try_clone().ok()?);
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).unwrap_or(0) == 0 {
        return None;
    }
    let target = request_line.split_whitespace().nth(1)?.to_string();

    let mut headers = Vec::new();
    let mut length = 0usize;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            let (name, value) = (name.trim().to_string(), value.trim().to_string());
            if name.eq_ignore_ascii_case("content-length") {
                length = value.parse().unwrap_or(0);
            }
            headers.push((name, value));
        }
    }

    let mut body = vec![0u8; length];
    let _ = reader.read_exact(&mut body);
    Some(RecordedRequest {
        target,
        headers,
        body: String::from_utf8_lossy(&body).into_owned(),
    })
}

fn write_reply(stream: &mut TcpStream, status: u16, body: &str) {
    let head = format!(
        "HTTP/1.1 {status} X\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(body.as_bytes());
    let _ = stream.flush();
}

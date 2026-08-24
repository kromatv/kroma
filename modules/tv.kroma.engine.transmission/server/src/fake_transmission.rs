use serde_json::{json, Value};
use std::sync::Mutex;

use crate::types::{AddTorrentReq, ClientDef};

use crate::rpc::SESSION_HEADER;
use crate::{Transmission, KIND};

// `Fetch` shells out to curl, so a socket is the only seam there is: these
// drive the connector's real requests, CSRF handshake included.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::sync::Arc;

#[derive(Clone)]
pub(crate) struct Call {
    pub(crate) method: String,
    pub(crate) args: Value,
    pub(crate) session: Option<String>,
    pub(crate) auth: Option<String>,
}

pub(crate) struct Reply {
    status: u16,
    session: Option<String>,
    body: String,
}

impl Reply {
    pub(crate) fn ok(arguments: Value) -> Self {
        Self {
            status: 200,
            session: None,
            body: json!({ "result": "success", "arguments": arguments }).to_string(),
        }
    }

    // 200 with a non-"success" result: how Transmission reports most errors.
    pub(crate) fn refuses(result: &str) -> Self {
        Self {
            status: 200,
            session: None,
            body: json!({ "result": result }).to_string(),
        }
    }

    // The CSRF challenge: 409 carrying the session id to replay with.
    pub(crate) fn challenge(sid: &str) -> Self {
        Self {
            status: 409,
            session: Some(sid.to_string()),
            body: "Conflict".into(),
        }
    }

    pub(crate) fn raw(status: u16, body: &str) -> Self {
        Self {
            status,
            session: None,
            body: body.into(),
        }
    }
}

pub(crate) struct FakeTransmission {
    base: String,
    calls: Arc<Mutex<Vec<Call>>>,
}

#[derive(Default)]
pub(crate) struct Headers {
    len: usize,
    session: Option<String>,
    auth: Option<String>,
}

pub(crate) fn read_headers(reader: &mut impl BufRead) -> Option<Headers> {
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).unwrap_or(0) == 0 {
        return None;
    }
    let mut out = Headers::default();
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
            return Some(out);
        }
        let lower = line.to_ascii_lowercase();
        let value = || line.split_once(':').map(|(_, v)| v.trim().to_string());
        if let Some(v) = lower.strip_prefix("content-length:") {
            out.len = v.trim().parse().unwrap_or(0);
        } else if lower.starts_with("x-transmission-session-id:") {
            out.session = value();
        } else if lower.starts_with("authorization:") {
            out.auth = value();
        }
    }
}

pub(crate) fn write_reply(stream: &mut impl Write, reply: Reply) {
    let handshake = reply
        .session
        .map(|s| format!("{SESSION_HEADER}: {s}\r\n"))
        .unwrap_or_default();
    let reason = if reply.status == 200 { "OK" } else { "ERR" };
    let resp = format!(
        "HTTP/1.1 {} {reason}\r\nContent-Length: {}\r\nContent-Type: application/json\r\n{handshake}Connection: close\r\n\r\n{}",
        reply.status,
        reply.body.len(),
        reply.body,
    );
    let _ = stream.write_all(resp.as_bytes());
    let _ = stream.flush();
}

impl FakeTransmission {
    // `route` maps an RPC method plus the 1-based call count for that method to
    // a reply.
    pub(crate) fn start(route: impl Fn(&str, &Value, usize) -> Reply + Send + 'static) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().unwrap().port();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let log = Arc::clone(&calls);

        std::thread::spawn(move || {
            let mut counts: std::collections::HashMap<String, usize> =
                std::collections::HashMap::new();
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { break };
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let Some(headers) = read_headers(&mut reader) else {
                    continue;
                };

                let mut body = vec![0u8; headers.len];
                if headers.len > 0 {
                    let _ = reader.read_exact(&mut body);
                }

                let sent: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
                let method = sent
                    .get("method")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let args = sent.get("arguments").cloned().unwrap_or(Value::Null);

                let n = counts.entry(method.clone()).or_insert(0);
                *n += 1;
                let reply = route(&method, &args, *n);
                log.lock().unwrap().push(Call {
                    method,
                    args,
                    session: headers.session,
                    auth: headers.auth,
                });
                write_reply(&mut stream, reply);
            }
        });

        Self {
            base: format!("http://127.0.0.1:{port}"),
            calls,
        }
    }

    pub(crate) fn client(&self) -> Transmission {
        Transmission::new(&ClientDef {
            kind: KIND.into(),
            url: self.base.clone(),
            username: "admin".into(),
            password: "secret".into(),
        })
    }

    pub(crate) fn anonymous(&self) -> Transmission {
        Transmission::new(&ClientDef {
            kind: KIND.into(),
            url: self.base.clone(),
            username: String::new(),
            password: String::new(),
        })
    }

    pub(crate) fn calls(&self) -> Vec<Call> {
        self.calls.lock().unwrap().clone()
    }
}

pub(crate) fn add_req<'a>(magnet: &'a str, label: &'a str) -> AddTorrentReq<'a> {
    AddTorrentReq {
        magnet_or_url: magnet,
        download_dir: Some("/data/incoming"),
        label,
        only_files: None,
        torrent_bytes: None,
    }
}

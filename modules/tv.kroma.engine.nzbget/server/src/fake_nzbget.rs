use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};

use crate::{ClientDef, NzbGet};

#[derive(Clone)]
pub(crate) struct Call {
    pub(crate) method: String,
    pub(crate) params: Value,
    pub(crate) auth: Option<String>,
}

pub(crate) struct Reply {
    status: u16,
    body: String,
}

impl Reply {
    pub(crate) fn ok(result: Value) -> Self {
        Self {
            status: 200,
            body: json!({ "version": "1.1", "id": 1, "result": result }).to_string(),
        }
    }

    pub(crate) fn fault(message: &str) -> Self {
        Self {
            status: 200,
            body: json!({ "version": "1.1", "error": { "name": "JSONRPCError", "code": 1, "message": message } })
                .to_string(),
        }
    }

    pub(crate) fn raw(status: u16, body: &str) -> Self {
        Self {
            status,
            body: body.into(),
        }
    }
}

pub(crate) struct FakeNzbGet {
    base: String,
    calls: Arc<Mutex<Vec<Call>>>,
}

#[derive(Default)]
struct Headers {
    len: usize,
    auth: Option<String>,
}

fn read_headers(reader: &mut impl BufRead) -> Option<Headers> {
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
        if let Some(v) = lower.strip_prefix("content-length:") {
            out.len = v.trim().parse().unwrap_or(0);
        } else if lower.starts_with("authorization:") {
            out.auth = line.split_once(':').map(|(_, v)| v.trim().to_string());
        }
    }
}

fn read_call(reader: &mut impl BufRead) -> Option<Call> {
    let headers = read_headers(reader)?;
    let mut body = vec![0u8; headers.len];
    reader.read_exact(&mut body).ok()?;
    let sent: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
    Some(Call {
        method: sent["method"].as_str().unwrap_or_default().to_string(),
        params: sent["params"].clone(),
        auth: headers.auth,
    })
}

fn write_reply(stream: &mut impl Write, reply: Reply) {
    let reason = if reply.status == 200 { "OK" } else { "ERR" };
    let resp = format!(
        "HTTP/1.1 {} {reason}\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{}",
        reply.status,
        reply.body.len(),
        reply.body,
    );
    let _ = stream.write_all(resp.as_bytes());
    let _ = stream.flush();
}

impl FakeNzbGet {
    pub(crate) fn start(route: impl Fn(&str, &Value) -> Reply + Send + 'static) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().unwrap().port();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let log = Arc::clone(&calls);

        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { break };
                let Some(call) = read_call(&mut BufReader::new(stream.try_clone().unwrap())) else {
                    continue;
                };
                let reply = route(&call.method, &call.params);
                log.lock().unwrap().push(call);
                write_reply(&mut stream, reply);
            }
        });

        Self {
            base: format!("http://127.0.0.1:{port}"),
            calls,
        }
    }

    pub(crate) fn client(&self) -> NzbGet {
        NzbGet::new(&ClientDef {
            url: format!("{}/", self.base),
            username: "admin".into(),
            password: "secret".into(),
        })
    }

    pub(crate) fn anonymous(&self) -> NzbGet {
        NzbGet::new(&ClientDef {
            url: self.base.clone(),
            ..ClientDef::default()
        })
    }

    pub(crate) fn calls(&self) -> Vec<Call> {
        self.calls.lock().unwrap().clone()
    }
}

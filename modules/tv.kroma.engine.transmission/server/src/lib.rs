//! Transmission RPC connector (`/transmission/rpc`, JSON over curl). The
//! protocol's CSRF handshake: any request may answer 409 with a fresh
//! `X-Transmission-Session-Id`, which we cache and replay once.

use std::sync::Mutex;

use anyhow::{anyhow, bail, Result};
use serde_json::{json, Value};

use kroma_module_sdk::ports::{AddTorrentReq, ClientDef, DownloadClient, TorrentState, TorrentStatus};

const SESSION_HEADER: &str = "X-Transmission-Session-Id";
const STATUS_FIELDS: &[&str] = &[
    "hashString",
    "name",
    "percentDone",
    "status",
    "rateDownload",
    "rateUpload",
    "peersConnected",
    "totalSize",
    "downloadDir",
    "files",
    "errorString",
];

pub struct Transmission {
    url: String,
    username: String,
    password: String,
    session_id: Mutex<String>,
}

impl Transmission {
    pub fn new(def: &ClientDef) -> Self {
        let base = def.url.trim_end_matches('/');
        let url = if base.ends_with("/transmission/rpc") {
            base.to_string()
        } else {
            format!("{base}/transmission/rpc")
        };
        Self {
            url,
            username: def.username.clone(),
            password: def.password.clone(),
            session_id: Mutex::new(String::new()),
        }
    }

    fn fetch(&self) -> kroma_module_sdk::http::Fetch {
        let mut f = kroma_module_sdk::http::Fetch::new().max_time(60);
        let sid = self.session_id.lock().unwrap().clone();
        if !sid.is_empty() {
            f = f.header(SESSION_HEADER, sid);
        }
        if !self.username.is_empty() {
            let credentials = base64(format!("{}:{}", self.username, self.password).as_bytes());
            f = f.header("authorization", format!("Basic {credentials}"));
        }
        f
    }

    fn rpc(&self, method: &str, arguments: Value) -> Result<Value> {
        let body = json!({ "method": method, "arguments": arguments });
        let mut resp = self.fetch().post_json(&self.url, &body)?;
        if resp.status == 409 {
            let sid = resp
                .header(SESSION_HEADER)
                .ok_or_else(|| anyhow!("409 without a {SESSION_HEADER} header"))?
                .to_string();
            *self.session_id.lock().unwrap() = sid;
            resp = self.fetch().post_json(&self.url, &body)?;
        }
        if resp.status == 401 {
            bail!("authentication failed (check username/password)");
        }
        let v: Value = resp.ensure_ok()?.json()?;
        match v.get("result").and_then(Value::as_str) {
            Some("success") => Ok(v.get("arguments").cloned().unwrap_or(Value::Null)),
            Some(other) => bail!("transmission error: {other}"),
            None => bail!("malformed transmission response"),
        }
    }
}

impl DownloadClient for Transmission {
    fn kind(&self) -> &'static str {
        "transmission"
    }

    fn test(&self) -> Result<String> {
        let args = self.rpc("session-get", json!({}))?;
        let version = args.get("version").and_then(Value::as_str).unwrap_or("?");
        Ok(format!("Transmission {version}"))
    }

    fn add(&self, req: &AddTorrentReq) -> Result<String> {
        let mut arguments = json!({ "filename": req.magnet_or_url });
        if let Some(dir) = req.download_dir {
            arguments["download-dir"] = json!(dir);
        }
        if !req.label.is_empty() {
            arguments["labels"] = json!([req.label]);
        }
        let args = self.rpc("torrent-add", arguments);
        // Transmission < 4 rejects unknown fields like `labels`: retry bare.
        let args = match args {
            Ok(a) => a,
            Err(_) => {
                let mut bare = json!({ "filename": req.magnet_or_url });
                if let Some(dir) = req.download_dir {
                    bare["download-dir"] = json!(dir);
                }
                self.rpc("torrent-add", bare)?
            }
        };
        let added = args.get("torrent-added").or_else(|| args.get("torrent-duplicate"));
        added
            .and_then(|t| t.get("hashString"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| anyhow!("torrent-add returned no hash"))
    }

    fn status(&self, client_ref: &str) -> Result<Option<TorrentStatus>> {
        let args = self.rpc(
            "torrent-get",
            json!({ "ids": [client_ref], "fields": STATUS_FIELDS }),
        )?;
        let Some(t) = args.get("torrents").and_then(Value::as_array).and_then(|a| a.first()) else {
            return Ok(None);
        };
        let progress = t.get("percentDone").and_then(Value::as_f64).unwrap_or(0.0);
        // https://github.com/transmission/transmission docs: 0 stopped, 1-2
        // verify, 3-4 download (queued/active), 5-6 seed (queued/active).
        let code = t.get("status").and_then(Value::as_i64).unwrap_or(0);
        let error = t
            .get("errorString")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let state = if error.is_some() {
            TorrentState::Error
        } else {
            match code {
                0 if progress >= 1.0 => TorrentState::Completed,
                0 => TorrentState::Paused,
                1 | 2 => TorrentState::Queued,
                3 | 4 => TorrentState::Downloading,
                _ => TorrentState::Seeding,
            }
        };
        let files = t
            .get("files")
            .and_then(Value::as_array)
            .map(|fs| {
                fs.iter()
                    .filter_map(|f| f.get("name").and_then(Value::as_str))
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default();
        Ok(Some(TorrentStatus {
            client_ref: client_ref.to_string(),
            name: t.get("name").and_then(Value::as_str).unwrap_or_default().to_string(),
            info_hash: t.get("hashString").and_then(Value::as_str).map(str::to_string),
            progress,
            state,
            down_bps: t.get("rateDownload").and_then(Value::as_u64).unwrap_or(0),
            up_bps: t.get("rateUpload").and_then(Value::as_u64).unwrap_or(0),
            peers: t.get("peersConnected").and_then(Value::as_u64).unwrap_or(0) as u32,
            // Transmission doesn't split discovered vs connected here.
            peers_seen: t.get("peersConnected").and_then(Value::as_u64).unwrap_or(0) as u32,
            size_bytes: t.get("totalSize").and_then(Value::as_u64).unwrap_or(0),
            save_path: t.get("downloadDir").and_then(Value::as_str).map(str::to_string),
            files,
            error,
        }))
    }

    fn pause(&self, client_ref: &str) -> Result<()> {
        self.rpc("torrent-stop", json!({ "ids": [client_ref] })).map(|_| ())
    }

    fn resume(&self, client_ref: &str) -> Result<()> {
        self.rpc("torrent-start", json!({ "ids": [client_ref] })).map(|_| ())
    }

    fn reannounce(&self, client_ref: &str) -> Result<()> {
        self.rpc("torrent-reannounce", json!({ "ids": [client_ref] })).map(|_| ())
    }

    fn remove(&self, client_ref: &str, delete_data: bool) -> Result<()> {
        self.rpc(
            "torrent-remove",
            json!({ "ids": [client_ref], "delete-local-data": delete_data }),
        )
        .map(|_| ())
    }
}

fn base64(input: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        let chars = [
            ALPHABET[(n >> 18) as usize & 63],
            ALPHABET[(n >> 12) as usize & 63],
            ALPHABET[(n >> 6) as usize & 63],
            ALPHABET[n as usize & 63],
        ];
        // n input bytes yield n+1 real chars; the rest is padding.
        let keep = chunk.len() + 1;
        for (i, c) in chars.iter().enumerate() {
            out.push(if i < keep { *c as char } else { '=' });
        }
    }
    out
}

pub const KIND: &str = "transmission";

/// Registers the Transmission factory (called by the engine module's ServerModule on enable).
pub fn register(reg: &mut kroma_module_sdk::ports::DownloadClientRegistry) {
    reg.register(KIND, |def, _ctx| {
        Ok(Box::new(Transmission::new(def)) as Box<dyn DownloadClient>)
    });
}

pub const MODULE_ID: &str = "tv.kroma.engine.transmission";

use kroma_module_sdk::EmbeddedModule;
pub const MODULE: EmbeddedModule = kroma_module_sdk::embedded_module!();

/// Lifecycle-only [`ServerModule`]: registers/unregisters the Transmission
/// download-client kind on enable/disable, reaching the host's registry so the
/// binary itself wires nothing.
pub struct TransmissionModule;

#[kroma_module_sdk::host::async_trait]
impl<S: kroma_module_sdk::host::HostCtx + Clone + Send + Sync + 'static>
    kroma_module_sdk::host::ServerModule<S> for TransmissionModule
{
    fn id(&self) -> &'static str {
        MODULE_ID
    }

    async fn on_enable(&self, host: std::sync::Arc<dyn kroma_module_sdk::host::HostCtx>) {
        if let Some(dm) = kroma_module_sdk::host::resolve_port::<dyn kroma_module_sdk::ports::DownloadClientHost>(host.as_ref()) {
            dm.register_engine(register);
        }
    }

    async fn on_disable(&self, host: std::sync::Arc<dyn kroma_module_sdk::host::HostCtx>) {
        if let Some(dm) = kroma_module_sdk::host::resolve_port::<dyn kroma_module_sdk::ports::DownloadClientHost>(host.as_ref()) {
            dm.unregister_engine(KIND);
        }
    }
}

/// This module's backend behavior, for the host's generic module roster.
pub fn server_module<S: kroma_module_sdk::host::HostCtx + Clone + Send + Sync + 'static>(
) -> Box<dyn kroma_module_sdk::host::ServerModule<S>> {
    Box::new(TransmissionModule)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_reference() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"a"), "YQ==");
        assert_eq!(base64(b"ab"), "YWI=");
        assert_eq!(base64(b"abc"), "YWJj");
        assert_eq!(base64(b"user:pass"), "dXNlcjpwYXNz");
    }

    #[test]
    fn base64_extra_vectors_and_padding() {
        // Canonical RFC 4648 test vectors.
        assert_eq!(base64(b"Man"), "TWFu");
        assert_eq!(base64(b"hello world"), "aGVsbG8gd29ybGQ=");
        assert_eq!(base64(b"any carnal pleasure."), "YW55IGNhcm5hbCBwbGVhc3VyZS4=");
        // All-bits-set uses the tail of the alphabet ('/'), single zero byte pads.
        assert_eq!(base64(&[0xFF, 0xFF, 0xFF]), "////");
        assert_eq!(base64(&[0x00]), "AA==");
    }

    #[test]
    fn url_normalization_appends_rpc_path() {
        let def = |url: &str| ClientDef {
            kind: "transmission".into(),
            url: url.into(),
            username: String::new(),
            password: String::new(),
        };
        assert_eq!(Transmission::new(&def("http://nas:9091")).url, "http://nas:9091/transmission/rpc");
        assert_eq!(
            Transmission::new(&def("http://nas:9091/transmission/rpc")).url,
            "http://nas:9091/transmission/rpc"
        );
        // A trailing slash is trimmed before the rpc path is appended.
        assert_eq!(
            Transmission::new(&def("http://nas:9091/")).url,
            "http://nas:9091/transmission/rpc"
        );
        // ...and an already-suffixed URL with a trailing slash is left as the path.
        assert_eq!(
            Transmission::new(&def("http://nas:9091/transmission/rpc/")).url,
            "http://nas:9091/transmission/rpc"
        );
    }

    #[test]
    fn new_stores_credentials() {
        let t = Transmission::new(&ClientDef {
            kind: "transmission".into(),
            url: "http://nas:9091".into(),
            username: "admin".into(),
            password: "secret".into(),
        });
        assert_eq!(t.username, "admin");
        assert_eq!(t.password, "secret");
        // The session id starts empty (populated by the 409 handshake).
        assert!(t.session_id.lock().unwrap().is_empty());
    }

    // `Fetch` shells out to curl, so a socket is the only seam there is: these
    // drive the connector's real requests, CSRF handshake included.

    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;
    use std::sync::Arc;

    #[derive(Clone)]
    struct Call {
        method: String,
        args: Value,
        session: Option<String>,
        auth: Option<String>,
    }

    struct Reply {
        status: u16,
        session: Option<String>,
        body: String,
    }

    impl Reply {
        fn ok(arguments: Value) -> Self {
            Self {
                status: 200,
                session: None,
                body: json!({ "result": "success", "arguments": arguments }).to_string(),
            }
        }

        // 200 with a non-"success" result: how Transmission reports most errors.
        fn refuses(result: &str) -> Self {
            Self { status: 200, session: None, body: json!({ "result": result }).to_string() }
        }

        // The CSRF challenge: 409 carrying the session id to replay with.
        fn challenge(sid: &str) -> Self {
            Self { status: 409, session: Some(sid.to_string()), body: "Conflict".into() }
        }

        fn raw(status: u16, body: &str) -> Self {
            Self { status, session: None, body: body.into() }
        }
    }

    struct FakeTransmission {
        base: String,
        calls: Arc<Mutex<Vec<Call>>>,
    }

    #[derive(Default)]
    struct Headers {
        len: usize,
        session: Option<String>,
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

    fn write_reply(stream: &mut impl Write, reply: Reply) {
        let handshake =
            reply.session.map(|s| format!("{SESSION_HEADER}: {s}\r\n")).unwrap_or_default();
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
        fn start(route: impl Fn(&str, &Value, usize) -> Reply + Send + 'static) -> Self {
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
                    let Some(headers) = read_headers(&mut reader) else { continue };

                    let mut body = vec![0u8; headers.len];
                    if headers.len > 0 {
                        let _ = reader.read_exact(&mut body);
                    }

                    let sent: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
                    let method =
                        sent.get("method").and_then(Value::as_str).unwrap_or_default().to_string();
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

            Self { base: format!("http://127.0.0.1:{port}"), calls }
        }

        fn client(&self) -> Transmission {
            Transmission::new(&ClientDef {
                kind: KIND.into(),
                url: self.base.clone(),
                username: "admin".into(),
                password: "secret".into(),
            })
        }

        fn anonymous(&self) -> Transmission {
            Transmission::new(&ClientDef {
                kind: KIND.into(),
                url: self.base.clone(),
                username: String::new(),
                password: String::new(),
            })
        }

        fn calls(&self) -> Vec<Call> {
            self.calls.lock().unwrap().clone()
        }
    }

    fn add_req<'a>(magnet: &'a str, label: &'a str) -> AddTorrentReq<'a> {
        AddTorrentReq {
            magnet_or_url: magnet,
            download_dir: Some("/data/incoming"),
            label,
            only_files: None,
            torrent_bytes: None,
        }
    }

    #[test]
    fn test_reports_the_server_version() {
        let fake = FakeTransmission::start(|method, _, _| match method {
            "session-get" => Reply::ok(json!({ "version": "4.0.5" })),
            other => Reply::refuses(other),
        });
        assert_eq!(fake.client().test().unwrap(), "Transmission 4.0.5");
    }

    #[test]
    fn a_server_that_hides_its_version_still_counts_as_reachable() {
        // The point of `test` is "can I talk to it", so a missing version field
        // is not a failure - reporting reachability matters more than the number.
        let fake = FakeTransmission::start(|_, _, _| Reply::ok(json!({})));
        assert_eq!(fake.client().test().unwrap(), "Transmission ?");
    }

    #[test]
    fn the_409_handshake_is_replayed_once_and_then_remembered() {
        // Transmission answers the FIRST request of a session with 409 + a fresh
        // session id. Failing to cache it would mean every call costs two round
        // trips; failing to replay would surface a 409 as a user-visible error.
        let fake = FakeTransmission::start(|method, _, n| match (method, n) {
            ("session-get", 1) => Reply::challenge("Zx9-token"),
            ("session-get", _) => Reply::ok(json!({ "version": "4.0.5" })),
            (other, _) => Reply::refuses(other),
        });
        let client = fake.client();
        assert_eq!(client.test().unwrap(), "Transmission 4.0.5");
        assert_eq!(client.test().unwrap(), "Transmission 4.0.5");

        let calls = fake.calls();
        assert_eq!(calls.len(), 3, "challenge, replay, then one plain call");
        assert_eq!(calls[0].session, None, "nothing to send before the challenge");
        assert_eq!(calls[1].session.as_deref(), Some("Zx9-token"), "replayed with the id");
        assert_eq!(calls[2].session.as_deref(), Some("Zx9-token"), "and it stuck");
    }

    #[test]
    fn a_409_without_the_session_header_is_an_error() {
        // Nothing to replay with, so retrying would just loop.
        let fake = FakeTransmission::start(|_, _, _| Reply::raw(409, "Conflict"));
        let err = fake.client().test().unwrap_err().to_string();
        assert!(err.contains(SESSION_HEADER), "{err}");
    }

    #[test]
    fn a_401_names_the_credentials_and_the_request_carried_basic_auth() {
        let fake = FakeTransmission::start(|_, _, _| Reply::raw(401, "Unauthorized"));
        let err = fake.client().test().unwrap_err().to_string();
        assert!(err.contains("username/password"), "{err}");
        // base64("admin:secret") - the header has to be right for the 401 to mean
        // what the message says it means.
        assert_eq!(fake.calls()[0].auth.as_deref(), Some("Basic YWRtaW46c2VjcmV0"));
    }

    #[test]
    fn a_client_without_credentials_sends_no_authorization_header() {
        // Sending `Basic Og==` (":") to an open server is a needless 401 risk.
        let fake = FakeTransmission::start(|_, _, _| Reply::ok(json!({ "version": "3.0" })));
        fake.anonymous().test().unwrap();
        assert_eq!(fake.calls()[0].auth, None);
    }

    #[test]
    fn a_refusal_is_surfaced_verbatim_despite_the_200() {
        // Transmission reports most errors as 200 + result != "success", so the
        // status alone never decides.
        let fake = FakeTransmission::start(|_, _, _| Reply::refuses("torrent-add: invalid or corrupt"));
        let err = fake.client().test().unwrap_err().to_string();
        assert!(err.contains("invalid or corrupt"), "{err}");
    }

    #[test]
    fn a_reply_without_a_result_field_is_malformed() {
        // Typically a reverse proxy's own JSON, not Transmission's.
        let fake = FakeTransmission::start(|_, _, _| Reply::raw(200, r#"{"ok":true}"#));
        let err = fake.client().test().unwrap_err().to_string();
        assert!(err.contains("malformed"), "{err}");
    }

    #[test]
    fn status_maps_a_live_torrent_onto_the_port_shape() {
        let fake = FakeTransmission::start(|method, args, _| {
            assert_eq!(method, "torrent-get");
            assert_eq!(args["ids"][0], "abc123");
            Reply::ok(json!({
                "torrents": [{
                    "hashString": "abc123",
                    "name": "Some.Show.S01E01",
                    "percentDone": 0.25,
                    "status": 4,
                    "rateDownload": 1_500_000,
                    "rateUpload": 90_000,
                    "peersConnected": 12,
                    "totalSize": 4_000_000_000u64,
                    "downloadDir": "/data/incoming",
                    "files": [{ "name": "Some.Show.S01E01.mkv" }, { "name": "readme.txt" }],
                    "errorString": "",
                }]
            }))
        });
        let got = fake.client().status("abc123").unwrap().expect("a known torrent");
        assert_eq!(got.client_ref, "abc123");
        assert_eq!(got.info_hash.as_deref(), Some("abc123"));
        assert_eq!(got.name, "Some.Show.S01E01");
        assert_eq!(got.progress, 0.25);
        assert_eq!(got.state, TorrentState::Downloading);
        assert_eq!(got.down_bps, 1_500_000);
        assert_eq!(got.up_bps, 90_000);
        assert_eq!(got.peers, 12);
        assert_eq!(got.size_bytes, 4_000_000_000);
        assert_eq!(got.save_path.as_deref(), Some("/data/incoming"));
        assert_eq!(got.files, vec!["Some.Show.S01E01.mkv", "readme.txt"]);
        assert_eq!(got.error, None, "an empty errorString is not an error");
    }

    #[test]
    fn status_asks_for_every_field_it_reads() {
        // The RPC only returns what it is asked for, so a field dropped from
        // STATUS_FIELDS silently becomes a default in the UI.
        let fake = FakeTransmission::start(|_, args, _| {
            let asked: Vec<&str> =
                args["fields"].as_array().unwrap().iter().filter_map(Value::as_str).collect();
            for field in STATUS_FIELDS {
                assert!(asked.contains(field), "{field} not requested");
            }
            Reply::ok(json!({ "torrents": [] }))
        });
        fake.client().status("abc123").unwrap();
    }

    #[test]
    fn status_is_none_for_a_hash_the_server_does_not_know() {
        // A torrent removed out of band is a normal state, not an error.
        let fake = FakeTransmission::start(|_, _, _| Reply::ok(json!({ "torrents": [] })));
        assert!(fake.client().status("gone").unwrap().is_none());
    }

    #[test]
    fn a_sparse_torrent_falls_back_to_zeroes_rather_than_failing() {
        // Older servers omit fields they have no value for; the row still has to
        // render.
        let fake = FakeTransmission::start(|_, _, _| {
            Reply::ok(json!({ "torrents": [{ "hashString": "abc123" }] }))
        });
        let got = fake.client().status("abc123").unwrap().unwrap();
        assert_eq!(got.name, "");
        assert_eq!(got.progress, 0.0);
        assert_eq!(got.down_bps, 0);
        assert_eq!(got.peers, 0);
        assert_eq!(got.size_bytes, 0);
        assert_eq!(got.save_path, None);
        assert!(got.files.is_empty());
        assert_eq!(got.state, TorrentState::Paused, "status 0 with no progress");
    }

    #[test]
    fn state_follows_the_transmission_status_codes() {
        // The client_ref doubles as the fixture: "<status>@<percentDone>".
        let fake = FakeTransmission::start(|_, args, _| {
            let id = args["ids"][0].as_str().unwrap_or_default().to_string();
            let (code, done) = id.split_once('@').unwrap();
            Reply::ok(json!({
                "torrents": [{
                    "status": code.parse::<i64>().unwrap(),
                    "percentDone": done.parse::<f64>().unwrap(),
                }]
            }))
        });
        let client = fake.client();
        for (fixture, want) in [
            ("0@1.0", TorrentState::Completed),
            ("0@0.4", TorrentState::Paused),
            ("1@0.0", TorrentState::Queued),
            ("2@0.0", TorrentState::Queued),
            ("3@0.0", TorrentState::Downloading),
            ("4@0.5", TorrentState::Downloading),
            ("5@1.0", TorrentState::Seeding),
            ("6@1.0", TorrentState::Seeding),
        ] {
            let got = client.status(fixture).unwrap().unwrap();
            assert_eq!(got.state, want, "status code {fixture}");
        }
    }

    #[test]
    fn an_errored_torrent_carries_its_state_as_the_error() {
        // The error outranks the status code: a tracker failure on a torrent
        // still marked "seeding" must not read as healthy.
        let fake = FakeTransmission::start(|_, _, _| {
            Reply::ok(json!({
                "torrents": [{
                    "status": 6,
                    "percentDone": 1.0,
                    "errorString": "Tracker gave HTTP response code 403",
                }]
            }))
        });
        let got = fake.client().status("abc123").unwrap().unwrap();
        assert_eq!(got.state, TorrentState::Error);
        assert_eq!(got.error.as_deref(), Some("Tracker gave HTTP response code 403"));
    }

    #[test]
    fn add_returns_the_hash_the_server_assigned() {
        let fake = FakeTransmission::start(|method, args, _| {
            assert_eq!(method, "torrent-add");
            assert_eq!(args["filename"], "magnet:?xt=urn:btih:deadbeef");
            assert_eq!(args["download-dir"], "/data/incoming");
            assert_eq!(args["labels"], json!(["kroma"]));
            Reply::ok(json!({ "torrent-added": { "hashString": "deadbeef" } }))
        });
        let hash = fake.client().add(&add_req("magnet:?xt=urn:btih:deadbeef", "kroma")).unwrap();
        assert_eq!(hash, "deadbeef");
    }

    #[test]
    fn adding_a_torrent_the_server_already_has_succeeds() {
        // Transmission answers `torrent-duplicate` instead of `torrent-added`.
        // Treating that as a failure would break every re-grab of a download the
        // user still has seeding.
        let fake = FakeTransmission::start(|_, _, _| {
            Reply::ok(json!({ "torrent-duplicate": { "hashString": "deadbeef" } }))
        });
        let hash = fake.client().add(&add_req("magnet:?xt=urn:btih:deadbeef", "kroma")).unwrap();
        assert_eq!(hash, "deadbeef");
    }

    #[test]
    fn add_retries_without_labels_when_the_server_rejects_them() {
        // Transmission < 4 has no `labels` argument and refuses the whole call.
        let fake = FakeTransmission::start(|_, _, n| match n {
            1 => Reply::refuses("labels: unsupported argument"),
            _ => Reply::ok(json!({ "torrent-added": { "hashString": "deadbeef" } })),
        });
        let hash = fake.client().add(&add_req("magnet:?xt=urn:btih:deadbeef", "kroma")).unwrap();
        assert_eq!(hash, "deadbeef");

        let calls = fake.calls();
        assert_eq!(calls.len(), 2);
        assert!(calls[0].args.get("labels").is_some());
        assert!(calls[1].args.get("labels").is_none(), "the retry has to drop them");
        assert_eq!(calls[1].args["download-dir"], "/data/incoming", "but keep the directory");
    }

    #[test]
    fn a_label_free_request_never_sends_the_argument() {
        let fake = FakeTransmission::start(|_, _, _| {
            Reply::ok(json!({ "torrent-added": { "hashString": "deadbeef" } }))
        });
        fake.client().add(&add_req("magnet:?xt=urn:btih:deadbeef", "")).unwrap();
        assert!(fake.calls()[0].args.get("labels").is_none());
    }

    #[test]
    fn add_fails_loudly_when_the_reply_carries_no_hash() {
        // Without a hash there is nothing to track the download by, so returning
        // Ok would leave the ledger pointing at a torrent nobody can find again.
        let fake = FakeTransmission::start(|_, _, _| Reply::ok(json!({ "torrent-added": {} })));
        let err = fake.client().add(&add_req("magnet:?xt=urn:btih:deadbeef", "kroma"))
            .unwrap_err()
            .to_string();
        assert!(err.contains("no hash"), "{err}");
        // The call itself succeeded, so the labels retry is not involved: the
        // reply is well-formed and simply useless.
        assert_eq!(fake.calls().len(), 1);
    }

    #[test]
    fn the_lifecycle_verbs_hit_their_methods() {
        let fake = FakeTransmission::start(|_, _, _| Reply::ok(json!({})));
        let client = fake.client();
        client.pause("abc123").unwrap();
        client.resume("abc123").unwrap();
        client.reannounce("abc123").unwrap();
        client.remove("abc123", false).unwrap();
        client.remove("abc123", true).unwrap();

        let calls = fake.calls();
        let methods: Vec<&str> = calls.iter().map(|c| c.method.as_str()).collect();
        assert_eq!(
            methods,
            ["torrent-stop", "torrent-start", "torrent-reannounce", "torrent-remove", "torrent-remove"]
        );
        for call in &calls {
            assert_eq!(call.args["ids"], json!(["abc123"]), "{} lost its id", call.method);
        }
        // The flag is the difference between freeing disk and losing the file.
        assert_eq!(calls[3].args["delete-local-data"], json!(false));
        assert_eq!(calls[4].args["delete-local-data"], json!(true));
    }

    #[test]
    fn a_failing_verb_is_not_swallowed() {
        // Each verb maps its result to `()`, which is exactly where an error can
        // get lost.
        let fake = FakeTransmission::start(|_, _, _| Reply::refuses("torrent-stop: no such torrent"));
        let client = fake.client();
        assert!(client.pause("gone").is_err());
        assert!(client.resume("gone").is_err());
        assert!(client.reannounce("gone").is_err());
        assert!(client.remove("gone", true).is_err());
    }

    #[test]
    fn kind_is_the_registry_key() {
        let fake = FakeTransmission::start(|_, _, _| Reply::ok(json!({})));
        assert_eq!(fake.client().kind(), KIND);
        assert_eq!(KIND, "transmission");
    }
}

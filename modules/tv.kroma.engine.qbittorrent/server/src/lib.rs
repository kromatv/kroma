//! qBittorrent WebUI connector (`/api/v2`, cookie-authenticated form posts
//! over curl). The SID cookie lives in a per-endpoint jar file; a 403 answer
//! re-logs-in once and replays. qBittorrent's add endpoint returns no hash, so
//! the ref comes from the magnet URI, else from diffing the KROMA category
//! before/after the add.

use std::path::PathBuf;

use anyhow::{anyhow, bail, Result};
use serde_json::Value;

pub mod port;
pub mod types;

pub use types::{
    cookie_jar_path, magnet_info_hash, AddTorrentReq, ClientDef, TorrentState, TorrentStatus,
};

pub struct QBittorrent {
    base: String,
    username: String,
    password: String,
    jar: PathBuf,
}

impl QBittorrent {
    pub fn new(def: &ClientDef, jar: PathBuf) -> Self {
        Self {
            base: def.url.trim_end_matches('/').to_string(),
            username: def.username.clone(),
            password: def.password.clone(),
            jar,
        }
    }

    fn fetch(&self) -> kroma_module_sdk::http::Fetch {
        kroma_module_sdk::http::Fetch::new()
            .max_time(60)
            .cookie_jar(&self.jar)
    }

    fn login(&self) -> Result<()> {
        let resp = self.fetch().post_form(
            &format!("{}/api/v2/auth/login", self.base),
            &[("username", &self.username), ("password", &self.password)],
        )?;
        let resp = resp.ensure_ok()?;
        if !resp.text().contains("Ok") {
            bail!("authentication failed (check username/password)");
        }
        Ok(())
    }

    fn get(&self, path: &str, params: &[(&str, &str)]) -> Result<kroma_module_sdk::http::Response> {
        let url = format!("{}{path}", self.base);
        let build = || {
            let mut f = self.fetch();
            for (k, v) in params {
                f = f.query(k, v.to_string());
            }
            f
        };
        let resp = build().get(&url)?;
        if resp.status == 403 {
            self.login()?;
            return build().get(&url)?.ensure_ok();
        }
        resp.ensure_ok()
    }

    fn post(
        &self,
        path: &str,
        fields: &[(&str, &str)],
    ) -> Result<kroma_module_sdk::http::Response> {
        let url = format!("{}{path}", self.base);
        let resp = self.fetch().post_form(&url, fields)?;
        if resp.status == 403 {
            self.login()?;
            return self.fetch().post_form(&url, fields)?.ensure_ok();
        }
        resp.ensure_ok()
    }

    fn torrents_info(&self, params: &[(&str, &str)]) -> Result<Vec<Value>> {
        let resp = self.get("/api/v2/torrents/info", params)?;
        resp.json::<Vec<Value>>()
    }
}

fn state_of(qbit_state: &str, progress: f64) -> TorrentState {
    match qbit_state {
        "error" | "missingFiles" => TorrentState::Error,
        "pausedDL" | "stoppedDL" => TorrentState::Paused,
        "pausedUP" | "stoppedUP" => TorrentState::Completed,
        "uploading" | "stalledUP" | "queuedUP" | "forcedUP" => TorrentState::Seeding,
        "checkingDL" | "checkingUP" | "checkingResumeData" | "metaDL" | "queuedDL"
        | "allocating" => TorrentState::Queued,
        _ if progress >= 1.0 => TorrentState::Seeding,
        _ => TorrentState::Downloading,
    }
}

/// The engine itself. [`port`] serves these over the `download-client` point;
/// nothing here implements a trait another crate owns.
impl QBittorrent {
    pub fn test(&self) -> Result<String> {
        self.login()?;
        let version = self.get("/api/v2/app/version", &[])?.text();
        Ok(format!("qBittorrent {}", version.trim()))
    }

    pub fn add(&self, req: &AddTorrentReq) -> Result<String> {
        // Known hash up-front for magnets; otherwise diff the category.
        let known = magnet_info_hash(req.magnet_or_url);
        let before: Vec<String> = if known.is_none() {
            self.torrents_info(&[("category", req.label)])?
                .iter()
                .filter_map(|t| t.get("hash").and_then(Value::as_str))
                .map(str::to_string)
                .collect()
        } else {
            Vec::new()
        };

        let mut fields: Vec<(&str, &str)> =
            vec![("urls", req.magnet_or_url), ("category", req.label)];
        if let Some(dir) = req.download_dir {
            fields.push(("savepath", dir));
        }
        let resp = self.post("/api/v2/torrents/add", &fields)?;
        if resp.text().contains("Fails") {
            bail!("qBittorrent rejected the torrent");
        }
        if let Some(hash) = known {
            return Ok(hash);
        }
        // .torrent-URL adds return no hash: poll the category for the new one.
        for _ in 0..10 {
            std::thread::sleep(std::time::Duration::from_millis(700));
            let now = self.torrents_info(&[("category", req.label)])?;
            if let Some(hash) = now
                .iter()
                .filter_map(|t| t.get("hash").and_then(Value::as_str))
                .find(|h| !before.iter().any(|b| b == h))
            {
                return Ok(hash.to_string());
            }
        }
        Err(anyhow!(
            "added, but could not identify the new torrent's hash"
        ))
    }

    pub fn status(&self, client_ref: &str) -> Result<Option<TorrentStatus>> {
        let torrents = self.torrents_info(&[("hashes", client_ref)])?;
        let Some(t) = torrents.first() else {
            return Ok(None);
        };
        let progress = t.get("progress").and_then(Value::as_f64).unwrap_or(0.0);
        let qstate = t.get("state").and_then(Value::as_str).unwrap_or("");
        let files: Vec<String> = self
            .get("/api/v2/torrents/files", &[("hash", client_ref)])
            .and_then(|r| r.json::<Vec<Value>>())
            .map(|fs| {
                fs.iter()
                    .filter_map(|f| f.get("name").and_then(Value::as_str))
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default();
        Ok(Some(TorrentStatus {
            client_ref: client_ref.to_string(),
            name: t
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            info_hash: Some(client_ref.to_string()),
            progress,
            state: state_of(qstate, progress),
            down_bps: t.get("dlspeed").and_then(Value::as_u64).unwrap_or(0),
            up_bps: t.get("upspeed").and_then(Value::as_u64).unwrap_or(0),
            // Connected leechers + seeds currently in swarm.
            peers: (t.get("num_leechs").and_then(Value::as_u64).unwrap_or(0)
                + t.get("num_seeds").and_then(Value::as_u64).unwrap_or(0))
                as u32,
            // Total swarm size the tracker reported (incl. not-connected).
            peers_seen: (t.get("num_incomplete").and_then(Value::as_u64).unwrap_or(0)
                + t.get("num_complete").and_then(Value::as_u64).unwrap_or(0))
                as u32,
            size_bytes: t.get("size").and_then(Value::as_u64).unwrap_or(0),
            save_path: t
                .get("save_path")
                .and_then(Value::as_str)
                .map(str::to_string),
            files,
            error: matches!(qstate, "error" | "missingFiles").then(|| format!("state: {qstate}")),
        }))
    }

    pub fn pause(&self, client_ref: &str) -> Result<()> {
        self.post("/api/v2/torrents/pause", &[("hashes", client_ref)])
            .map(|_| ())
    }

    pub fn resume(&self, client_ref: &str) -> Result<()> {
        self.post("/api/v2/torrents/resume", &[("hashes", client_ref)])
            .map(|_| ())
    }

    pub fn reannounce(&self, client_ref: &str) -> Result<()> {
        self.post("/api/v2/torrents/reannounce", &[("hashes", client_ref)])
            .map(|_| ())
    }

    pub fn remove(&self, client_ref: &str, delete_data: bool) -> Result<()> {
        self.post(
            "/api/v2/torrents/delete",
            &[
                ("hashes", client_ref),
                ("deleteFiles", if delete_data { "true" } else { "false" }),
            ],
        )
        .map(|_| ())
    }
}

/// The client `kind` this module answers for, and the instance name the
/// download module resolves it under. It is declared in `module.json` as well,
/// which is what the supervisor reads.
pub const KIND: &str = "qbittorrent";

pub const MODULE_ID: &str = "tv.kroma.engine.qbittorrent";

use kroma_module_sdk::EmbeddedModule;
pub const MODULE: EmbeddedModule = kroma_module_sdk::embedded_module!();

/// The qBittorrent engine has no lifecycle and no admin routes of its own: being
/// installed and enabled IS the registration, because the download module
/// resolves whoever answers the point when it needs an engine. Disabling it stops
/// the process, and the point stops resolving to it.
pub struct QbittorrentModule;

#[kroma_module_sdk::host::async_trait]
impl<S: kroma_module_sdk::host::HostCtx + Clone + Send + Sync + 'static>
    kroma_module_sdk::host::ServerModule<S> for QbittorrentModule
{
    fn id(&self) -> &'static str {
        MODULE_ID
    }
}

/// This module's backend behavior, for the host's generic module roster.
pub fn server_module<S: kroma_module_sdk::host::HostCtx + Clone + Send + Sync + 'static>(
) -> Box<dyn kroma_module_sdk::host::ServerModule<S>> {
    Box::new(QbittorrentModule)
}

#[cfg(test)]
mod tests {
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};

    use super::*;

    // `Fetch` shells out to curl, so this has to be a real socket rather than a
    // mocked client - which exercises the connector's actual request/response
    // handling, cookie jar included.
    struct FakeQbit {
        base: String,
        seen: Arc<Mutex<Vec<String>>>,
        jar_dir: kroma_testing::TempDir,
    }

    // (status, body)
    type Reply = (u16, String);

    fn read_request(reader: &mut impl BufRead) -> Option<(String, usize)> {
        let mut first = String::new();
        if reader.read_line(&mut first).unwrap_or(0) == 0 {
            return None;
        }
        // "GET /path?query HTTP/1.1" -> "GET /path"
        let mut parts = first.split_whitespace();
        let method = parts.next().unwrap_or("").to_string();
        let path = parts
            .next()
            .unwrap_or("")
            .split('?')
            .next()
            .unwrap_or("")
            .to_string();

        let mut len = 0usize;
        loop {
            let mut line = String::new();
            if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
                return Some((format!("{method} {path}"), len));
            }
            if let Some(v) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                len = v.trim().parse().unwrap_or(0);
            }
        }
    }

    fn write_reply(stream: &mut impl Write, (status, body): Reply) {
        let reason = if status == 200 { "OK" } else { "ERR" };
        let resp = format!(
            "HTTP/1.1 {status} {reason}\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        let _ = stream.write_all(resp.as_bytes());
        let _ = stream.flush();
    }

    impl FakeQbit {
        // `route` maps a request line ("POST /api/v2/auth/login") plus the 1-based
        // call count for that route to a reply.
        fn start(route: impl Fn(&str, usize) -> Reply + Send + 'static) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
            let port = listener.local_addr().unwrap().port();
            let seen = Arc::new(Mutex::new(Vec::new()));
            let log = Arc::clone(&seen);

            std::thread::spawn(move || {
                let mut counts: std::collections::HashMap<String, usize> =
                    std::collections::HashMap::new();
                for stream in listener.incoming() {
                    let Ok(mut stream) = stream else { break };
                    let mut reader = BufReader::new(stream.try_clone().unwrap());
                    let Some((key, len)) = read_request(&mut reader) else {
                        continue;
                    };

                    // Drain the body so curl sees a clean close.
                    if len > 0 {
                        let mut body = vec![0u8; len];
                        let _ = reader.read_exact(&mut body);
                    }

                    let n = counts.entry(key.clone()).or_insert(0);
                    *n += 1;
                    let reply = route(&key, *n);
                    log.lock().unwrap().push(key);
                    write_reply(&mut stream, reply);
                }
            });

            Self {
                base: format!("http://127.0.0.1:{port}"),
                seen,
                jar_dir: kroma_testing::temp_dir("qbit-jar"),
            }
        }

        fn client(&self) -> QBittorrent {
            let def = ClientDef {
                kind: "qbittorrent".into(),
                url: self.base.clone(),
                username: "u".into(),
                password: "p".into(),
            };
            QBittorrent::new(&def, self.jar_dir.path().join("cookies.txt"))
        }

        fn requests(&self) -> Vec<String> {
            self.seen.lock().unwrap().clone()
        }
    }

    fn healthy(key: &str, _n: usize) -> Reply {
        match key {
            "POST /api/v2/auth/login" => (200, "Ok.".into()),
            "GET /api/v2/app/version" => (200, "v4.6.0".into()),
            "GET /api/v2/torrents/info" => (
                200,
                r#"[{"hash":"abc","name":"A Film","progress":0.5,"state":"downloading",
                     "dlspeed":100,"upspeed":10,"num_leechs":2,"num_seeds":3,
                     "num_incomplete":5,"num_complete":7,"size":1234,"save_path":"/d"}]"#
                    .into(),
            ),
            "GET /api/v2/torrents/files" => (200, r#"[{"name":"a.mkv"}]"#.into()),
            _ => (200, "Ok.".into()),
        }
    }

    #[test]
    fn test_reports_the_server_version() {
        let s = FakeQbit::start(healthy);
        // Exercises login + GET over a real socket, cookie jar included.
        assert_eq!(s.client().test().unwrap(), "qBittorrent v4.6.0");
        assert!(s
            .requests()
            .contains(&"POST /api/v2/auth/login".to_string()));
    }

    #[test]
    fn a_login_the_server_does_not_confirm_is_an_error() {
        // qBittorrent answers 200 with "Fails." on bad credentials, so the STATUS
        // is not enough - the body has to be read.
        let s = FakeQbit::start(|key, _| match key {
            "POST /api/v2/auth/login" => (200, "Fails.".into()),
            _ => (200, String::new()),
        });
        let err = s.client().test().unwrap_err().to_string();
        assert!(err.contains("authentication failed"), "{err}");
    }

    #[test]
    fn a_403_re_logs_in_and_replays_the_request() {
        // The SID cookie expires; the connector must recover silently rather than
        // surfacing a 403 to the user mid-download.
        let s = FakeQbit::start(|key, n| match (key, n) {
            ("POST /api/v2/auth/login", _) => (200, "Ok.".into()),
            ("GET /api/v2/torrents/info", 1) => (403, "Forbidden".into()),
            ("GET /api/v2/torrents/info", _) => {
                (200, r#"[{"hash":"abc","state":"downloading"}]"#.into())
            }
            _ => (200, String::new()),
        });
        let status = s.client().status("abc").unwrap();
        assert!(status.is_some(), "the replay after re-login must succeed");

        let reqs = s.requests();
        // Exactly the shape of the recovery: 403, login, retry.
        assert_eq!(reqs[0], "GET /api/v2/torrents/info");
        assert_eq!(reqs[1], "POST /api/v2/auth/login");
        assert_eq!(reqs[2], "GET /api/v2/torrents/info");
    }

    #[test]
    fn status_maps_a_live_torrent_onto_the_port_shape() {
        let s = FakeQbit::start(healthy);
        let st = s.client().status("abc").unwrap().expect("a status");

        assert_eq!(st.name, "A Film");
        assert_eq!(st.progress, 0.5);
        assert_eq!(st.state, TorrentState::Downloading);
        assert_eq!((st.down_bps, st.up_bps), (100, 10));
        // Connected peers vs the swarm the tracker reported - two different
        // numbers the UI shows side by side.
        assert_eq!(st.peers, 5);
        assert_eq!(st.peers_seen, 12);
        assert_eq!(st.size_bytes, 1234);
        assert_eq!(st.files, vec!["a.mkv".to_string()]);
        assert!(st.error.is_none());
    }

    #[test]
    fn status_is_none_for_a_hash_the_server_does_not_know() {
        let s = FakeQbit::start(|key, _| match key {
            "GET /api/v2/torrents/info" => (200, "[]".into()),
            _ => (200, "Ok.".into()),
        });
        // None, not an error: a torrent removed out of band is a normal state the
        // caller reconciles, not a failure.
        assert!(s.client().status("gone").unwrap().is_none());
    }

    #[test]
    fn an_errored_torrent_carries_its_state_as_the_error() {
        let s = FakeQbit::start(|key, _| match key {
            "GET /api/v2/torrents/info" => (
                200,
                r#"[{"hash":"abc","state":"missingFiles","progress":0.9}]"#.into(),
            ),
            _ => (200, "Ok.".into()),
        });
        let st = s.client().status("abc").unwrap().unwrap();
        assert_eq!(st.state, TorrentState::Error);
        assert_eq!(st.error.as_deref(), Some("state: missingFiles"));
    }

    #[test]
    fn add_takes_the_hash_straight_from_a_magnet() {
        let s = FakeQbit::start(healthy);
        let req = AddTorrentReq {
            magnet_or_url: "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567",
            label: "kroma",
            download_dir: Some("/downloads"),
            only_files: None,
            torrent_bytes: None,
        };
        let hash = s.client().add(&req).unwrap();

        assert_eq!(hash, "0123456789abcdef0123456789abcdef01234567");
        // A known hash means NO before/after category diff - that polling loop
        // sleeps for seconds and is only for .torrent URLs.
        assert!(!s
            .requests()
            .iter()
            .any(|r| r == "GET /api/v2/torrents/info"));
    }

    #[test]
    fn add_fails_loudly_when_the_server_rejects_the_torrent() {
        let s = FakeQbit::start(|key, _| match key {
            "POST /api/v2/torrents/add" => (200, "Fails.".into()),
            _ => (200, "Ok.".into()),
        });
        let req = AddTorrentReq {
            magnet_or_url: "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567",
            label: "kroma",
            download_dir: None,
            only_files: None,
            torrent_bytes: None,
        };
        // Another 200-with-a-failure-body: silently returning a hash here would
        // leave the ledger tracking a download that never started.
        let err = s.client().add(&req).unwrap_err().to_string();
        assert!(err.contains("rejected"), "{err}");
    }

    #[test]
    fn the_lifecycle_verbs_hit_their_endpoints() {
        let s = FakeQbit::start(healthy);
        let c = s.client();
        c.pause("abc").unwrap();
        c.resume("abc").unwrap();
        c.reannounce("abc").unwrap();
        c.remove("abc", true).unwrap();

        let reqs = s.requests();
        for path in [
            "POST /api/v2/torrents/pause",
            "POST /api/v2/torrents/resume",
            "POST /api/v2/torrents/reannounce",
            "POST /api/v2/torrents/delete",
        ] {
            assert!(
                reqs.contains(&path.to_string()),
                "{path} not called: {reqs:?}"
            );
        }
    }

    #[test]
    fn cookie_jars_are_stable_and_distinct() {
        let a = ClientDef {
            kind: "qbittorrent".into(),
            url: "http://a:8080".into(),
            username: "u".into(),
            password: String::new(),
        };
        let b = ClientDef {
            url: "http://b:8080".into(),
            ..a.clone()
        };
        let dir = std::path::Path::new("/tmp");
        assert_eq!(cookie_jar_path(dir, &a), cookie_jar_path(dir, &a));
        assert_ne!(cookie_jar_path(dir, &a), cookie_jar_path(dir, &b));
        // Same URL, different user -> a distinct jar.
        let c = ClientDef {
            username: "other".into(),
            ..a.clone()
        };
        assert_ne!(cookie_jar_path(dir, &a), cookie_jar_path(dir, &c));
        // The tag is a 16-hex suffix on the `qbit-` prefix.
        let name = cookie_jar_path(dir, &a)
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        assert!(name.starts_with("qbit-") && name.ends_with(".cookies"));
    }

    #[test]
    fn state_mapping_covers_every_qbit_state() {
        assert_eq!(state_of("error", 0.5), TorrentState::Error);
        assert_eq!(state_of("missingFiles", 0.5), TorrentState::Error);
        assert_eq!(state_of("pausedDL", 0.3), TorrentState::Paused);
        assert_eq!(state_of("stoppedDL", 0.3), TorrentState::Paused);
        assert_eq!(state_of("pausedUP", 1.0), TorrentState::Completed);
        assert_eq!(state_of("stoppedUP", 1.0), TorrentState::Completed);
        for s in ["uploading", "stalledUP", "queuedUP", "forcedUP"] {
            assert_eq!(state_of(s, 1.0), TorrentState::Seeding, "{s}");
        }
        for s in [
            "checkingDL",
            "checkingUP",
            "checkingResumeData",
            "metaDL",
            "queuedDL",
            "allocating",
        ] {
            assert_eq!(state_of(s, 0.0), TorrentState::Queued, "{s}");
        }
        // Unknown state falls back on progress: complete -> seeding, else downloading.
        assert_eq!(state_of("downloading", 0.5), TorrentState::Downloading);
        assert_eq!(state_of("weird", 1.0), TorrentState::Seeding);
        assert_eq!(state_of("weird", 0.99), TorrentState::Downloading);
    }

    #[test]
    fn new_trims_trailing_slash_from_base() {
        let def = ClientDef {
            kind: "qbittorrent".into(),
            url: "http://host:8080/".into(),
            username: "u".into(),
            password: "p".into(),
        };
        let q = QBittorrent::new(&def, std::path::PathBuf::from("/tmp/j.cookies"));
        assert_eq!(q.base, "http://host:8080");
        assert_eq!(q.username, "u");
        assert_eq!(q.password, "p");
    }

    #[test]
    fn magnet_hash_extraction() {
        // 40-char hex info-hash, returned lowercased.
        let h =
            magnet_info_hash("magnet:?xt=urn:btih:ABCDEF0123456789ABCDEF0123456789ABCDEF01&dn=x");
        assert_eq!(
            h.as_deref(),
            Some("abcdef0123456789abcdef0123456789abcdef01")
        );
        // 32-char base32 info-hash is also accepted.
        assert_eq!(
            magnet_info_hash("magnet:?xt=urn:btih:ABCDEFGHIJKLMNOPQRSTUVWXYZ234567").as_deref(),
            Some("abcdefghijklmnopqrstuvwxyz234567")
        );
        // A plain http URL / a wrong-length hash -> None.
        assert_eq!(magnet_info_hash("http://x/a.torrent"), None);
        assert_eq!(magnet_info_hash("magnet:?xt=urn:btih:tooShort"), None);
    }
}

//! Transmission RPC connector (`/transmission/rpc`, JSON over curl). The
//! protocol's CSRF handshake: any request may answer 409 with a fresh
//! `X-Transmission-Session-Id`, which we cache and replay once.

use std::sync::Mutex;

use anyhow::{anyhow, Result};
use serde_json::{json, Value};

use kroma_module_sdk::ports::{AddTorrentReq, ClientDef, DownloadClient, TorrentState, TorrentStatus};

mod base64;
mod rpc;

#[cfg(test)]
mod fake_transmission;
#[cfg(test)]
mod it_download_client;

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

    async fn on_enable(&self, host: S) {
        if let Some(dm) = kroma_module_sdk::host::resolve_port::<dyn kroma_module_sdk::ports::DownloadClientHost>(&host) {
            dm.register_engine(register);
        }
    }

    async fn on_disable(&self, host: S) {
        if let Some(dm) = kroma_module_sdk::host::resolve_port::<dyn kroma_module_sdk::ports::DownloadClientHost>(&host) {
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
}

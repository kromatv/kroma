//! NZBGet JSON-RPC connector (`/jsonrpc`, HTTP basic auth), serving the
//! `download-client` point for Usenet.

use anyhow::{anyhow, bail, Result};
use serde_json::json;

pub mod port;
pub mod types;

pub use types::{AddReq, ClientDef, JobState, JobStatus};

mod jobs;
mod rpc;

#[cfg(test)]
mod fake_nzbget;
#[cfg(test)]
mod it_download_client;
#[cfg(test)]
mod it_queue;

pub const MODULE_ID: &str = "tv.kroma.engine.nzbget";

pub const PROTOCOL: &str = "usenet";

use kroma_module_sdk::EmbeddedModule;
pub const MODULE: EmbeddedModule = kroma_module_sdk::embedded_module!();

pub struct NzbGet {
    url: String,
    username: String,
    password: String,
}

impl NzbGet {
    pub fn new(def: &ClientDef) -> Self {
        let base = def.url.trim_end_matches('/');
        let url = if base.ends_with("/jsonrpc") {
            base.to_string()
        } else {
            format!("{base}/jsonrpc")
        };
        Self {
            url,
            username: def.username.clone(),
            password: def.password.clone(),
        }
    }

    pub fn test(&self) -> Result<String> {
        let version: String = self.rpc("version", json!([]))?;
        Ok(format!("NZBGet {version}"))
    }

    pub fn add(&self, req: &AddReq) -> Result<String> {
        if req.protocol != PROTOCOL {
            let got = if req.protocol.is_empty() { "torrent" } else { req.protocol };
            bail!("NZBGet downloads usenet releases only, not {got}");
        }
        if !req.url.starts_with("http://") && !req.url.starts_with("https://") {
            bail!("NZBGet fetches an http(s) link, not {}", req.url);
        }
        let filename = if req.name.is_empty() {
            String::new()
        } else {
            format!("{}.nzb", req.name.replace(['/', '\\'], "_"))
        };
        let id: i64 = self.rpc(
            "append",
            json!([filename, req.url, req.label, 0, false, false, "", 0, "SCORE", false]),
        )?;
        if id <= 0 {
            bail!("NZBGet refused the release (append returned {id})");
        }
        Ok(id.to_string())
    }

    pub fn status(&self, client_ref: &str) -> Result<Option<JobStatus>> {
        let Ok(id) = client_ref.parse::<i64>() else {
            return Ok(None);
        };
        let groups: Vec<jobs::Group> = self.rpc("listgroups", json!([0]))?;
        if let Some(group) = groups.into_iter().find(|g| g.id == id) {
            let rate = if group.is_downloading() {
                self.rpc::<jobs::ServerStatus>("status", json!([]))?
                    .download_rate()
            } else {
                0
            };
            return Ok(Some(group.into_status(rate)));
        }
        let history: Vec<jobs::HistoryItem> = self.rpc("history", json!([false]))?;
        Ok(history
            .into_iter()
            .find(|h| h.id == id)
            .map(jobs::HistoryItem::into_status))
    }

    pub fn pause(&self, client_ref: &str) -> Result<()> {
        self.edit_accepted("GroupPause", client_ref)
    }

    pub fn resume(&self, client_ref: &str) -> Result<()> {
        self.edit_accepted("GroupResume", client_ref)
    }

    pub fn remove(&self, client_ref: &str, delete_data: bool) -> Result<()> {
        let (queue, history) = if delete_data {
            ("GroupFinalDelete", "HistoryFinalDelete")
        } else {
            ("GroupDelete", "HistoryDelete")
        };
        self.edit(queue, client_ref)?;
        self.edit(history, client_ref)?;
        Ok(())
    }

    fn edit_accepted(&self, command: &str, client_ref: &str) -> Result<()> {
        if self.edit(command, client_ref)? {
            Ok(())
        } else {
            bail!("NZBGet did not accept {command} for {client_ref}")
        }
    }

    fn edit(&self, command: &str, client_ref: &str) -> Result<bool> {
        let id: i64 = client_ref
            .parse()
            .map_err(|_| anyhow!("{client_ref:?} is not an NZBGet id"))?;
        self.rpc::<bool>("editqueue", json!([command, "", [id]]))
    }
}

pub struct NzbGetModule;

#[kroma_module_sdk::host::async_trait]
impl<S: kroma_module_sdk::host::HostCtx + Clone + Send + Sync + 'static>
    kroma_module_sdk::host::ServerModule<S> for NzbGetModule
{
    fn id(&self) -> &'static str {
        MODULE_ID
    }
}

pub fn server_module<S: kroma_module_sdk::host::HostCtx + Clone + Send + Sync + 'static>(
) -> Box<dyn kroma_module_sdk::host::ServerModule<S>> {
    Box::new(NzbGetModule)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url_of(url: &str) -> String {
        NzbGet::new(&ClientDef {
            url: url.into(),
            ..ClientDef::default()
        })
        .url
    }

    #[test]
    fn the_rpc_path_is_appended_once_with_or_without_a_trailing_slash() {
        assert_eq!(url_of("http://nas:6789"), "http://nas:6789/jsonrpc");
        assert_eq!(url_of("http://nas:6789/"), "http://nas:6789/jsonrpc");
        assert_eq!(url_of("http://nas:6789/jsonrpc"), "http://nas:6789/jsonrpc");
        assert_eq!(url_of("http://nas:6789/jsonrpc/"), "http://nas:6789/jsonrpc");
    }
}

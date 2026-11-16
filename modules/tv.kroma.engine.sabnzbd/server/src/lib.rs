//! SABnzbd connector: GET calls on `{url}/api?mode=...&apikey=...&output=json`.
//! SABnzbd answers a failure with a 200 and `{"status": false, "error": "..."}`,
//! so the body is read before the call is called good. A job is in the queue
//! until it is downloaded, then in the history through every post-processing
//! stage, which is where it turns `completed`.

use anyhow::{anyhow, bail, Result};
use serde_json::Value;

mod jobs;
pub mod port;
pub mod types;

#[cfg(all(test, not(target_family = "wasm")))]
mod fake;

pub use types::{api_base, AddNzbReq, ClientDef, JobState, JobStatus};

pub const USENET: &str = "usenet";

pub struct Sabnzbd {
    base: String,
    api_key: String,
}

impl Sabnzbd {
    pub fn new(def: &ClientDef) -> Self {
        Self {
            base: api_base(&def.url),
            api_key: def.api_key.trim().to_string(),
        }
    }

    fn call(&self, mode: &str, params: &[(&str, &str)]) -> Result<Value> {
        if self.api_key.is_empty() {
            bail!("the SABnzbd API key is not set");
        }
        let mut fetch = kroma_module_sdk::http::Fetch::new()
            .purpose("download-client")
            .max_time(60)
            .query("mode", mode)
            .query("apikey", self.api_key.as_str())
            .query("output", "json");
        for (key, value) in params {
            fetch = fetch.query(key, *value);
        }
        let body: Value = fetch
            .get(&format!("{}/api", self.base))?
            .ensure_ok()?
            .json()?;
        if let Some(reason) = body.get("error").and_then(Value::as_str) {
            bail!("SABnzbd: {reason}");
        }
        Ok(body)
    }

    pub fn test(&self) -> Result<String> {
        let version = self.call("version", &[])?;
        self.call("queue", &[("limit", "0")])?;
        let version = version
            .get("version")
            .and_then(Value::as_str)
            .unwrap_or("unknown");
        Ok(format!("SABnzbd {version}"))
    }

    pub fn add(&self, req: &AddNzbReq) -> Result<String> {
        if req.protocol != USENET {
            let protocol = if req.protocol.is_empty() {
                "torrent"
            } else {
                req.protocol
            };
            bail!("SABnzbd downloads usenet releases only, this one is {protocol}");
        }
        let category = if req.label.is_empty() { "*" } else { req.label };
        let mut params = vec![("name", req.url), ("cat", category)];
        if !req.name.is_empty() {
            params.push(("nzbname", req.name));
        }
        let body = self.call("addurl", &params)?;
        body.get("nzo_ids")
            .and_then(Value::as_array)
            .and_then(|ids| ids.first())
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| anyhow!("SABnzbd did not accept the NZB"))
    }

    pub fn status(&self, client_ref: &str) -> Result<Option<JobStatus>> {
        let queue: jobs::QueueReply =
            serde_json::from_value(self.call("queue", &[("nzo_ids", client_ref)])?)?;
        if let Some(job) = jobs::from_queue(&queue.queue, client_ref) {
            return Ok(Some(job));
        }
        let history: jobs::HistoryReply =
            serde_json::from_value(self.call("history", &[("nzo_ids", client_ref)])?)?;
        Ok(jobs::from_history(&history.history, client_ref))
    }

    pub fn pause(&self, client_ref: &str) -> Result<()> {
        self.call("queue", &[("name", "pause"), ("value", client_ref)])
            .map(drop)
    }

    pub fn resume(&self, client_ref: &str) -> Result<()> {
        self.call("queue", &[("name", "resume"), ("value", client_ref)])
            .map(drop)
    }

    pub fn remove(&self, client_ref: &str, delete_data: bool) -> Result<()> {
        let del_files = if delete_data { "1" } else { "0" };
        for mode in ["queue", "history"] {
            self.call(
                mode,
                &[("name", "delete"), ("value", client_ref), ("del_files", del_files)],
            )?;
        }
        Ok(())
    }
}

pub const MODULE_ID: &str = "tv.kroma.engine.sabnzbd";

use kroma_module_sdk::EmbeddedModule;
pub const MODULE: EmbeddedModule = kroma_module_sdk::embedded_module!();

/// The SABnzbd engine has no lifecycle and no admin routes of its own: being
/// installed and enabled IS the registration, because the download module
/// resolves whoever answers the point when it needs an engine.
pub struct SabnzbdModule;

#[kroma_module_sdk::host::async_trait]
impl<S: kroma_module_sdk::host::HostCtx + Clone + Send + Sync + 'static>
    kroma_module_sdk::host::ServerModule<S> for SabnzbdModule
{
    fn id(&self) -> &'static str {
        MODULE_ID
    }
}

/// This module's backend behavior, for the host's generic module roster.
pub fn server_module<S: kroma_module_sdk::host::HostCtx + Clone + Send + Sync + 'static>(
) -> Box<dyn kroma_module_sdk::host::ServerModule<S>> {
    Box::new(SabnzbdModule)
}

#[cfg(all(test, not(target_family = "wasm")))]
mod tests;

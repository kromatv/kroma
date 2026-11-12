use std::path::Path;

use anyhow::Result;
use kroma_module_sdk::http::Fetch;
use serde_json::Value;

pub(crate) const PURPOSE: &str = "trailer";
const PROFILES_PURPOSE: &str = "trailer-profiles";
const MAX_PROFILE_BYTES: u64 = 64 * 1024;

pub(crate) trait Web: Send + Sync {
    fn post_json(&self, url: &str, headers: &[(&str, String)], body: &Value) -> Result<Value>;
    fn download(&self, url: &str, user_agent: &str, dest: &Path) -> Result<()>;
    fn profiles(&self, url: &str) -> Result<String>;
}

pub(crate) struct Live;

impl Web for Live {
    fn post_json(&self, url: &str, headers: &[(&str, String)], body: &Value) -> Result<Value> {
        let mut request = Fetch::new().purpose(PURPOSE).https_only().max_time(20);
        for (name, value) in headers {
            request = request.header(name, value.clone());
        }
        request.post_json(url, body)?.ensure_ok()?.json()
    }

    fn download(&self, url: &str, user_agent: &str, dest: &Path) -> Result<()> {
        Fetch::new()
            .purpose(PURPOSE)
            .https_only()
            .max_time(180)
            .header("User-Agent", user_agent)
            .download(url, dest)?
            .ensure_ok()
            .map(|_| ())
    }

    fn profiles(&self, url: &str) -> Result<String> {
        let response = Fetch::new()
            .purpose(PROFILES_PURPOSE)
            .https_only()
            .max_time(10)
            .max_bytes(MAX_PROFILE_BYTES)
            .get(url)?
            .ensure_ok()?;
        Ok(response.text())
    }
}

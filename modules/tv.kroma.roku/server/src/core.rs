//! The core's HTTP API, called back with the channel's own bearer: the
//! sidecar shapes what the Roku shows, and the core decides what that
//! account may see.

use anyhow::{Context, Result};
use serde_json::Value;

use kroma_module_sdk::http::Fetch;

#[derive(Clone)]
pub struct Core {
    base: String,
    bearer: String,
}

impl Core {
    pub fn from_env(bearer: String) -> Result<Self> {
        let base = std::env::var("KROMA_CORE_URL").context("KROMA_CORE_URL not set")?;
        Ok(Self {
            base: base.trim_end_matches('/').to_string(),
            bearer,
        })
    }

    pub async fn get(&self, path: &str) -> Result<Value> {
        let url = format!("{}/api{path}", self.base);
        let fetch = Fetch::new().header("Authorization", format!("Bearer {}", self.bearer));
        tokio::task::spawn_blocking(move || fetch.get_json::<Value>(&url))
            .await
            .context("core call")?
    }

    pub async fn get_or_null(&self, path: &str) -> Value {
        self.get(path).await.unwrap_or(Value::Null)
    }
}

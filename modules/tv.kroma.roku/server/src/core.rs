//! The core's HTTP API, called back with the channel's own bearer on the
//! core's web listener, the door every client uses: the sidecar shapes what
//! the Roku shows, and the core decides what that account may see.

use anyhow::{Context, Result};
use serde_json::Value;

use kroma_module_sdk::http::Loopback;

#[derive(Clone)]
pub struct Core {
    base: String,
    bearer: String,
}

impl Core {
    pub fn from_env(bearer: String) -> Result<Self> {
        let named = std::env::var("KROMA_CORE_PORT").context("KROMA_CORE_PORT not set")?;
        let port = crate::lan::core_port(&named).context("KROMA_CORE_PORT is not a port")?;
        Ok(Self {
            base: format!("http://127.0.0.1:{port}"),
            bearer,
        })
    }

    pub async fn get(&self, path: &str) -> Result<Value> {
        let url = format!("{}/api{path}", self.base);
        let fetch = Loopback::new().header("Authorization", format!("Bearer {}", self.bearer));
        tokio::task::spawn_blocking(move || fetch.get_json::<Value>(&url))
            .await
            .context("core call")?
    }

    pub async fn get_or_null(&self, path: &str) -> Value {
        self.get(path).await.unwrap_or(Value::Null)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_core_is_reached_on_the_port_the_server_names_and_never_on_a_guess() {
        std::env::set_var("KROMA_CORE_PORT", "4040");
        let named = Core::from_env("channel".into()).map(|core| core.base);
        std::env::remove_var("KROMA_CORE_PORT");
        let unnamed = Core::from_env("channel".into()).map(|core| core.base);

        assert_eq!(named.unwrap(), "http://127.0.0.1:4040");
        assert!(unnamed.is_err());
        assert!(
            crate::lan::server_url().is_none(),
            "no port, no address for the Roku"
        );
    }
}

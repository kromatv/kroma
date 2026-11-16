use anyhow::{anyhow, bail, Result};
use serde::de::DeserializeOwned;
use serde_json::{json, Value};

use crate::NzbGet;

impl NzbGet {
    fn fetch(&self) -> kroma_module_sdk::http::Fetch {
        let mut f = kroma_module_sdk::http::Fetch::new()
            .purpose("download-client")
            .max_time(60);
        if !self.username.is_empty() || !self.password.is_empty() {
            f = f.basic_auth(&self.username, &self.password);
        }
        f
    }

    pub(crate) fn rpc<T: DeserializeOwned>(&self, method: &str, params: Value) -> Result<T> {
        let body = json!({ "method": method, "params": params, "id": 1 });
        let resp = self.fetch().post_json(&self.url, &body)?;
        if resp.status == 401 || resp.status == 403 {
            bail!("authentication failed (check username/password)");
        }
        let v: Value = resp.ensure_ok()?.json()?;
        if let Some(error) = v.get("error").filter(|e| !e.is_null()) {
            let message = error
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("unknown error");
            bail!("nzbget error: {message}");
        }
        let result = v
            .get("result")
            .cloned()
            .ok_or_else(|| anyhow!("malformed nzbget response"))?;
        serde_json::from_value(result).map_err(|e| anyhow!("unexpected {method} reply: {e}"))
    }
}

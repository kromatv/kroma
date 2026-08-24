use std::process::Command;

use anyhow::{bail, Context, Result};
use serde_json::Value;

// Network budget for one completion (LLMs can be slow, especially local CPU).
const MAX_TIME_SECS: &str = "180";

// `None` when blank and the provider has no default (base URL required).
pub(super) fn resolve_base(base_url: &str, default: Option<&str>) -> Option<String> {
    let base = base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        default.map(str::to_string)
    } else {
        Some(base.to_string())
    }
}

pub(super) fn curl_post(url: &str, headers: &[(&str, String)], body: &Value) -> Result<Value> {
    let body = serde_json::to_string(body)?;
    let mut cmd = Command::new("curl");
    cmd.args(["-s", "-S", "--max-time", MAX_TIME_SECS, "-X", "POST"]);
    for (k, v) in headers {
        cmd.arg("-H").arg(format!("{k}: {v}"));
    }
    cmd.arg("--data-binary").arg(&body).arg("--").arg(url);
    run_curl(cmd, "LLM request")
}

pub(super) fn curl_get(url: &str, headers: &[(&str, String)]) -> Result<Value> {
    let mut cmd = Command::new("curl");
    cmd.args(["-s", "-S", "--max-time", "20"]);
    for (k, v) in headers {
        cmd.arg("-H").arg(format!("{k}: {v}"));
    }
    cmd.arg("--").arg(url);
    run_curl(cmd, "model list")
}

fn run_curl(mut cmd: Command, what: &str) -> Result<Value> {
    let out = cmd
        .output()
        .with_context(|| format!("spawn curl for {what}"))?;
    if !out.status.success() {
        bail!(
            "curl exit {}: {}",
            out.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    serde_json::from_slice(&out.stdout).with_context(|| {
        format!(
            "parse {what} response: {}",
            String::from_utf8_lossy(&out.stdout)
                .chars()
                .take(200)
                .collect::<String>()
        )
    })
}

// A present-but-`null` `error` field (some OpenAI-compatible servers include
// it on success) is not an error.
pub(super) fn check_error(v: &Value) -> Result<()> {
    if let Some(err) = v.get("error").filter(|e| !e.is_null()) {
        let msg = err
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or_else(|| err.as_str().unwrap_or("unknown error"));
        bail!("LLM API error: {msg}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_base_url_shaped_like_a_curl_flag_is_never_read_as_one() {
        let data = kroma_testing::temp_dir("llm-curl-flag");
        let probe = data.path().join("written-by-curl");
        let config = data.path().join("curl.conf");
        std::fs::write(
            &config,
            format!(
                "output = \"{}\"\nurl = \"file:///dev/null\"\n",
                probe.display()
            ),
        )
        .expect("curl config");

        let out = curl_get(&format!("-K{}", config.display()), &[]);

        assert!(out.is_err());
        assert!(
            !probe.exists(),
            "the base URL was read as a curl config-file flag"
        );
    }
}

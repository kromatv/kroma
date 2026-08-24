//! Running the `curl` process and reading its header dump back.

use std::process::Command;

use anyhow::{bail, Context, Result};

use crate::config::option_line;
use crate::response::Response;

// Every option travels on stdin: argv is world-readable through `ps`, and these
// requests carry an indexer's API key in a header and the download client's
// password in a form field.
fn curl_command() -> Command {
    let mut cmd = Command::new("curl");
    cmd.arg("--config").arg("-");
    cmd
}

// Writing the config on this thread is safe because curl reads it whole before
// making the request, so it never deadlocks on a full stdout pipe.
pub(crate) fn run(mut config: String) -> Result<Response> {
    use std::io::Write;

    // A guard, not a path: every `?` below returns before the read, and a dump
    // left behind on a failed spawn is one file per attempt forever.
    let hdr = tempfile::Builder::new()
        .prefix("kroma-http-hdr-")
        .tempfile()
        .context("create the curl header dump")?;
    let hdr_path = hdr.path().to_path_buf();
    config.push_str(&option_line("dump-header", &hdr_path.to_string_lossy()));

    let mut child = curl_command()
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .context("spawn curl")?;
    let mut stdin = child.stdin.take().context("curl stdin was not piped")?;
    let written = stdin.write_all(config.as_bytes());
    // Closes the pipe so curl sees EOF. A curl that already gave up breaks it,
    // so reap the child before reporting that write.
    drop(stdin);
    let out = child.wait_with_output().context("wait for curl")?;
    if out.status.success() {
        written.context("write the curl config")?;
    }
    let raw_headers = std::fs::read_to_string(&hdr_path).unwrap_or_default();
    if !out.status.success() {
        bail!(
            "curl exit {}: {}",
            out.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    let (status, headers) = parse_last_block(&raw_headers)?;
    Ok(Response {
        status,
        headers,
        body: out.stdout,
    })
}

// With `-L`, curl appends one header block per hop to the dump; only the
// final block describes the response whose body we hold.
fn parse_last_block(raw: &str) -> Result<(u16, Vec<(String, String)>)> {
    let mut status = None;
    let mut headers = Vec::new();
    for line in raw.lines() {
        let line = line.trim_end_matches('\r');
        if let Some(rest) = line.strip_prefix("HTTP/") {
            // New block: "HTTP/1.1 200 OK" or "HTTP/2 302". Reset accumulation.
            status = rest
                .split_whitespace()
                .nth(1)
                .and_then(|c| c.parse::<u16>().ok());
            headers.clear();
        } else if let Some((k, v)) = line.split_once(':') {
            headers.push((k.trim().to_string(), v.trim().to_string()));
        }
    }
    let status =
        status.ok_or_else(|| anyhow::anyhow!("no HTTP status line in curl header dump"))?;
    Ok((status, headers))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_single_block() {
        let raw = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nX-Thing: a\r\n\r\n";
        let (status, headers) = parse_last_block(raw).unwrap();
        assert_eq!(status, 200);
        assert_eq!(headers.len(), 2);
        assert_eq!(
            headers[0],
            ("Content-Type".to_string(), "application/json".to_string())
        );
    }

    #[test]
    fn keeps_only_the_final_redirect_block() {
        let raw = concat!(
            "HTTP/1.1 302 Found\r\nLocation: https://elsewhere\r\n\r\n",
            "HTTP/2 200\r\ncontent-type: text/xml\r\n\r\n",
        );
        let (status, headers) = parse_last_block(raw).unwrap();
        assert_eq!(status, 200);
        assert_eq!(
            headers,
            vec![("content-type".to_string(), "text/xml".to_string())]
        );
    }

    #[test]
    fn parse_last_block_errors_without_a_status_line() {
        let err = parse_last_block("Content-Type: text/plain\r\n\r\n").unwrap_err();
        assert!(err.to_string().contains("no HTTP status line"), "{err}");
    }

    #[test]
    fn the_argv_carries_nothing_but_the_config_pipe() {
        let args: Vec<String> = curl_command()
            .get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert_eq!(args, vec!["--config".to_string(), "-".to_string()]);
    }
}

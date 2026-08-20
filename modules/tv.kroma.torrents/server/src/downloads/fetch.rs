use anyhow::{anyhow, bail, Result};

use kroma_module_sdk::host::HostCtx;

use crate::db;

pub(super) fn fetch_torrent_for(host: &dyn HostCtx, row: &db::DownloadRow) -> Result<Vec<u8>> {
    // Trackers behind Cloudflare intermittently drop the TLS connection
    // (`curl (35) SSL_ERROR_ZERO_RETURN`, reset, timeout) and a fresh attempt
    // almost always succeeds. Content errors are NOT retried.
    let mut last = None;
    for attempt in 0..3u64 {
        if attempt > 0 {
            std::thread::sleep(std::time::Duration::from_millis(600 * attempt));
        }
        match fetch_torrent_once(host, row) {
            Ok(bytes) => return Ok(bytes),
            Err(e) if is_transient_fetch(&e) => {
                tracing::warn!(id = %row.id, attempt = attempt + 1, error = %format!("{e:#}"), "torrent fetch transient failure; retrying");
                last = Some(e);
            }
            Err(e) => return Err(e),
        }
    }
    Err(last.unwrap_or_else(|| anyhow!("torrent fetch failed")))
}

// Private trackers cookie-gate the download, so a built-in indexer is fetched
// through its authenticated Cardigann session rather than plainly.
fn fetch_torrent_once(host: &dyn HostCtx, row: &db::DownloadRow) -> Result<Vec<u8>> {
    if let Some(indexer_id) = &row.indexer_id {
        if let Some(bytes) =
            crate::port::indexers::fetch_torrent(host, indexer_id, &row.magnet_or_url)?
        {
            return Ok(bytes);
        }
    }
    fetch_torrent_file(&row.magnet_or_url)
}

fn is_transient_fetch(err: &anyhow::Error) -> bool {
    let msg = format!("{err:#}");
    msg.contains("curl exit")
        || msg.contains("SSL")
        || msg.contains("timed out")
        || msg.contains("Connection reset")
        || msg.contains("empty response")
}

pub(super) fn fetch_torrent_file(url: &str) -> Result<Vec<u8>> {
    let resp = kroma_module_sdk::http::Fetch::new().max_time(30).get(url)?.ensure_ok()?;
    if resp.body.is_empty() {
        bail!("indexer returned an empty response");
    }
    // A tracker error page is HTML/JSON, not a bencoded torrent (starts with 'd').
    if resp.body.first() != Some(&b'd') {
        bail!("indexer did not return a .torrent file (got: {})", snippet(&resp.body));
    }
    Ok(resp.body)
}

fn snippet(body: &[u8]) -> String {
    String::from_utf8_lossy(body).chars().take(120).collect::<String>().replace('\n', " ")
}

use anyhow::{anyhow, bail, Result};

use kroma_module_sdk::host::HostCtx;
use kroma_module_sdk::http::address::web_target;
use kroma_module_sdk::http::Fetch;

use super::gate::{active_proxy_url, vpn_sealed_expected};
use crate::db;

const PURPOSE: &str = "torrent-file";

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
    fetch_torrent_file(host, &row.magnet_or_url)
}

fn is_transient_fetch(err: &anyhow::Error) -> bool {
    let msg = format!("{err:#}");
    msg.contains("curl exit")
        || msg.contains("SSL")
        || msg.contains("timed out")
        || msg.contains("Connection reset")
        || msg.contains("empty response")
}

pub(super) fn fetch_torrent_file(host: &dyn HostCtx, url: &str) -> Result<Vec<u8>> {
    let resp = route(host, url)?.max_time(30).get(url)?.ensure_ok()?;
    if resp.body.is_empty() {
        bail!("indexer returned an empty response");
    }
    // A tracker error page is HTML/JSON, not a bencoded torrent (starts with 'd').
    if resp.body.first() != Some(&b'd') {
        bail!(
            "indexer did not return a .torrent file (got: {})",
            snippet(&resp.body)
        );
    }
    Ok(resp.body)
}

// The URL carries the indexer's passkey, so an error names its host only.
fn route(host: &dyn HostCtx, url: &str) -> Result<Fetch> {
    let target = web_target(url).ok_or_else(|| anyhow!("not an http or https link"))?;
    if target.is_local() {
        return Ok(Fetch::new().purpose(PURPOSE));
    }
    match active_proxy_url(host) {
        Some(proxy) => Ok(Fetch::new().purpose(PURPOSE).socks5(proxy)),
        None if vpn_sealed_expected(host) => bail!(
            "the VPN is configured but not running, so {} is not fetched directly",
            target.host
        ),
        None => Ok(Fetch::new().purpose(PURPOSE)),
    }
}

fn snippet(body: &[u8]) -> String {
    String::from_utf8_lossy(body)
        .chars()
        .take(120)
        .collect::<String>()
        .replace('\n', " ")
}

#[cfg(test)]
mod tests {
    use kroma_module_sdk::host::testing::StubHost;
    use serde_json::json;

    use super::*;

    const PRIVATE_LINK: &str = "https://tracker.example.org/download.php?id=1&passkey=SECRET";

    fn vpn_configured_but_down() -> StubHost {
        StubHost::new()
            .with_module_enabled(true)
            .with_setting("vpnWgConfig", json!("[Interface]\nPrivateKey = K"))
    }

    #[test]
    fn a_torrent_link_is_not_fetched_directly_while_the_vpn_is_configured_but_down() {
        let host = vpn_configured_but_down();

        let err = route(&host, PRIVATE_LINK).err().unwrap().to_string();

        assert!(err.contains("tracker.example.org"), "{err}");
        assert!(!err.contains("SECRET"), "{err}");
    }

    #[test]
    fn an_indexer_on_the_local_network_stays_reachable_while_the_vpn_is_down() {
        let host = vpn_configured_but_down();

        assert!(route(&host, "http://192.168.1.20:9117/dl/x.torrent?apikey=K").is_ok());
        assert!(route(&host, "http://jackett:9117/dl/x.torrent").is_ok());
    }

    #[test]
    fn without_a_vpn_a_torrent_link_goes_out_directly() {
        assert!(route(&StubHost::new(), PRIVATE_LINK).is_ok());
    }

    #[test]
    fn a_link_that_is_not_a_web_address_is_refused() {
        assert!(route(&StubHost::new(), "file:///etc/passwd").is_err());
    }
}

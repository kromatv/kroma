//! The registry client: fetching a catalog and an artifact under hard byte
//! ceilings, and the URL and checksum rules a download is held to.

use serde_json::Value;

use super::Supervisor;

// A registry catalog is a small JSON index (the first-party one is a few kB);
// anything approaching this is a misconfigured or hostile host, not a catalog.
const MAX_CATALOG_BYTES: u64 = 4 * 1024 * 1024;
const CATALOG_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);
/// Ceiling on an installable `.kmod`: a sidecar binary plus a small frontend
/// bundle. The upload route bounds its body with this too, so a bundle that can
/// be uploaded can also be fetched by URL.
pub const MAX_BUNDLE_BYTES: u64 = 64 * 1024 * 1024;
const ARTIFACT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);
// Long enough to cover one admin interaction (plan, toggle, install), short
// enough that a freshly published catalog shows up on the next page visit.
const CATALOG_CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(15);

/// Byte-progress callback for a bounded fetch: `(received, total)` where
/// `total` is the advisory Content-Length when the server sent one.
pub type FetchProgress<'a> = &'a (dyn Fn(u64, Option<u64>) + Send + Sync);

/// Read a response body with a hard ceiling, enforced as it arrives.
///
/// Content-Length is advisory (absent under chunked encoding), so the header
/// check is only an early exit; the running total is what actually bounds it.
async fn fetch_bounded(
    client: &reqwest::Client,
    url: &str,
    max_bytes: u64,
    on_progress: Option<FetchProgress<'_>>,
) -> anyhow::Result<Vec<u8>> {
    let mut response = client.get(url).send().await?.error_for_status()?;
    let total = response.content_length();
    if let Some(len) = total {
        if len > max_bytes {
            anyhow::bail!("response is {len} bytes (max {max_bytes})");
        }
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        body.extend_from_slice(&chunk);
        if body.len() as u64 > max_bytes {
            anyhow::bail!("response exceeds {max_bytes} bytes");
        }
        if let Some(progress) = on_progress {
            progress(body.len() as u64, total);
        }
    }
    Ok(body)
}

/// Follow redirects, but never from https down to http: the catalog carries
/// both an artifact URL and the checksum that vouches for it, so a downgrade
/// would hand an on-path attacker each half and make the verification empty.
fn no_downgrade() -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(|attempt| {
        let came_from_https = attempt.previous().iter().any(|u| u.scheme() == "https");
        if came_from_https && attempt.url().scheme() != "https" {
            return attempt.error("redirect from https to http refused");
        }
        if attempt.previous().len() > 10 {
            return attempt.stop();
        }
        attempt.follow()
    })
}

impl Supervisor {
    /// Download a `.kmod` artifact, streaming byte progress to `on_progress`,
    /// and verify it against the published checksum before returning the bytes.
    /// A blank/absent `expected_sha256` skips verification (the caller decides
    /// whether that is acceptable; registry installs never allow it).
    pub async fn download_artifact(
        &self,
        url: &str,
        expected_sha256: Option<&str>,
        on_progress: FetchProgress<'_>,
    ) -> anyhow::Result<Vec<u8>> {
        let bytes = fetch_bounded(
            self.artifact_client(),
            url,
            MAX_BUNDLE_BYTES,
            Some(on_progress),
        )
        .await?;
        if let Some(expected) = expected_sha256.map(str::trim).filter(|s| !s.is_empty()) {
            verify_sha256(&bytes, expected)?;
        }
        Ok(bytes)
    }

    /// Fetch and parse a registry catalog.
    ///
    /// A catalog URL is operator-supplied and may point at a third-party host,
    /// so the request is bounded on both axes: a total timeout (an unresponsive
    /// host must not hang the admin page) and a size cap read BEFORE parsing (a
    /// schema cannot reject bytes it has not read).
    ///
    /// The URL may be a document or a registry's ROOT: a contract with a
    /// well-known path does not need the site to say where its documents are,
    /// so anything not ending in `.json` gets [`DESCRIPTOR_PATH`] appended. That
    /// is also why nothing here reads HTML - the page an operator pastes is
    /// attacker-controlled, and parsing it to find a URL to fetch was a trust
    /// boundary the contract removed the need for.
    pub async fn fetch_catalog(&self, url: &str) -> anyhow::Result<Value> {
        if let Some((at, value)) = self.catalog_cache.read().unwrap().get(url) {
            if at.elapsed() < CATALOG_CACHE_TTL {
                return Ok(value.clone());
            }
        }
        let value = self.fetch_catalog_uncached(url).await?;
        let mut cache = self.catalog_cache.write().unwrap();
        cache.retain(|_, (at, _)| at.elapsed() < CATALOG_CACHE_TTL);
        cache.insert(url.to_string(), (std::time::Instant::now(), value.clone()));
        Ok(value)
    }

    async fn fetch_catalog_uncached(&self, url: &str) -> anyhow::Result<Value> {
        let target = registry_document_url(url);
        let body = fetch_bounded(self.catalog_client(), &target, MAX_CATALOG_BYTES, None).await?;
        serde_json::from_slice(&body)
            .map_err(|e| anyhow::anyhow!("{target} is not a registry document: {e}"))
    }

    fn catalog_client(&self) -> &reqwest::Client {
        self.catalog_client.get_or_init(|| {
            reqwest::Client::builder()
                .timeout(CATALOG_TIMEOUT)
                .redirect(no_downgrade())
                .build()
                .unwrap_or_default()
        })
    }

    // https_only: the artifact produces an executable, and a redirect from https
    // to http would otherwise undo the caller's scheme check.
    fn artifact_client(&self) -> &reqwest::Client {
        self.artifact_client.get_or_init(|| {
            reqwest::Client::builder()
                .timeout(ARTIFACT_TIMEOUT)
                .https_only(true)
                .build()
                .unwrap_or_default()
        })
    }
}

/// The document at a registry ROOT. Named once because the operator's setting,
/// the sibling lookup and the error messages must all agree on it.
pub const DESCRIPTOR_PATH: &str = "registry.json";

/// The document an operator's registry URL names: itself when it already points
/// at one, else the descriptor at the well-known path beneath it.
pub fn registry_document_url(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/');
    if trimmed
        .rsplit('/')
        .next()
        .is_some_and(|last| last.ends_with(".json"))
    {
        return trimmed.to_string();
    }
    format!("{trimmed}/{DESCRIPTOR_PATH}")
}

/// Resolve `relative` against the URL a document was actually fetched from, so a
/// sibling document (a registry's index beside its descriptor) is reached
/// without trusting a URL that document declares about itself.
pub fn sibling_url(fetched_from: &str, relative: &str) -> anyhow::Result<String> {
    Ok(reqwest::Url::parse(fetched_from)?
        .join(relative)?
        .to_string())
}

/// Verify `bytes` against a hex SHA-256. Refusing on mismatch is what keeps a
/// tampered or truncated registry download out of [`Supervisor::install`].
pub fn verify_sha256(bytes: &[u8], expected: &str) -> anyhow::Result<()> {
    use sha2::Digest;
    let actual = hex::encode(sha2::Sha256::digest(bytes));
    anyhow::ensure!(
        actual.eq_ignore_ascii_case(expected.trim()),
        "bundle checksum mismatch (expected {expected}, got {actual}); refusing to install"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::registry_document_url;

    #[test]
    fn a_registry_root_resolves_to_the_descriptor_at_the_well_known_path() {
        for root in [
            "https://mods.example.com",
            "https://mods.example.com/",
            "  https://mods.example.com  ",
        ] {
            assert_eq!(
                registry_document_url(root),
                "https://mods.example.com/registry.json"
            );
        }
        assert_eq!(
            registry_document_url("https://example.com/kroma/"),
            "https://example.com/kroma/registry.json",
        );
    }

    #[test]
    fn a_url_that_already_names_a_document_is_left_alone() {
        for doc in [
            "https://mods.example.com/registry.json",
            "https://mods.example.com/index.json",
            "https://mods.example.com/m/tv.kroma.torrents.json",
        ] {
            assert_eq!(registry_document_url(doc), doc);
        }
    }
}

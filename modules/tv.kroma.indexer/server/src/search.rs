//! Running a search against one indexer row, and turning a chosen release into a
//! download link.
//!
//! Both dispatch on the row's `kind`: a `builtin` row runs the Cardigann engine in
//! this process, anything else goes out over the `torznab` point. The caller names
//! the indexer and never the engine behind it.

use kroma_module_sdk::host::HostStorage;

use crate::db::IndexerRow;
use crate::port::{DownloadTarget, SearchOutcome};
use crate::DownloadTarget as NativeTarget;
use crate::{admin, peers, Query, Release};

/// Search one indexer over `categories`.
pub fn run<S: HostStorage>(
    host: &S,
    row: &IndexerRow,
    query: &Query,
    categories: &[u32],
) -> anyhow::Result<SearchOutcome> {
    tracing::info!(
        indexer = %row.name,
        id = %row.id,
        kind = %row.kind,
        categories = ?categories,
        "indexer search",
    );
    if row.kind == admin::KIND_BUILTIN {
        let session = admin::builtin_session(host, row)?;
        let outcome = session.search(query, categories);
        return Ok(SearchOutcome {
            releases: outcome.releases,
            errors: outcome.errors,
        });
    }
    let caps = admin::indexer_caps(host, host.store(), row)?;
    let releases = peers::search(host, &row.kind, &admin::endpoint_of(row), query, &caps)?;
    tracing::info!(indexer = %row.name, releases = releases.len(), "engine answered");
    Ok(SearchOutcome {
        releases,
        errors: Vec::new(),
    })
}

/// The link to hand a download engine for one release. A magnet needs no
/// resolving; a `.torrent` URL on a built-in indexer does, because the tracker
/// gates it behind the session's cookies.
pub fn resolve_download<S: HostStorage>(
    host: &S,
    row: &IndexerRow,
    title: &str,
    details_url: Option<&str>,
    magnet_or_url: &str,
) -> anyhow::Result<DownloadTarget> {
    if magnet_or_url.starts_with("magnet:") {
        return Ok(DownloadTarget::Magnet(magnet_or_url.to_string()));
    }
    let session = admin::builtin_session(host, row)?;
    let release = Release {
        title: title.to_string(),
        link: magnet_or_url
            .starts_with("http")
            .then(|| magnet_or_url.to_string()),
        details_url: details_url.map(str::to_string),
        ..Default::default()
    };
    Ok(match session.resolve_download(&release)? {
        NativeTarget::Magnet(m) => DownloadTarget::Magnet(m),
        NativeTarget::TorrentUrl(u) => DownloadTarget::TorrentUrl(u),
    })
}

/// The `.torrent` bytes for `url` through the indexer's authenticated session.
/// `None` when this indexer needs no authenticated fetch, so the caller does a
/// plain HTTP GET; an error means the authenticated fetch itself failed, which a
/// plain GET would not fix.
pub fn fetch_torrent<S: HostStorage>(
    host: &S,
    indexer_id: &str,
    url: &str,
) -> anyhow::Result<Option<Vec<u8>>> {
    let row = {
        let conn = host.store().get()?;
        crate::db::get_indexer(&conn, indexer_id)?
    };
    // Only built-in indexers cookie-gate their downloads; an external endpoint's
    // link is fetched by the caller.
    let Some(row) = row.filter(|row| row.kind == admin::KIND_BUILTIN) else {
        return Ok(None);
    };
    let session = admin::builtin_session(host, &row)?;
    session.fetch_torrent(url).map(Some)
}

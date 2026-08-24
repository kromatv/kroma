//! The two indexer points this module calls: the authenticated `.torrent` fetch,
//! and the indexer names the download queue labels its rows with.

use serde::Deserialize;
use serde_json::json;

use kroma_module_sdk::host::{call, pinned_resolver, HostCtx, Resolver};

/// Fetching a `.torrent` through an indexer's authenticated session.
pub const TORRENT_FETCH: &str = "tv.kroma.indexer/torrent-fetch";

/// The configured indexers.
pub const INDEXER_DB: &str = "tv.kroma.indexer/db";

/// Only the two fields the queue draws: an id to join on and a name to show.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct IndexerName {
    pub id: String,
    pub name: String,
}

/// The `.torrent` bytes for `url` through the indexer's authenticated session, or
/// `None` when this indexer needs no authenticated fetch and the caller should do
/// a plain GET. An error means the authenticated fetch itself failed, which a
/// plain GET would not fix, so it must not be swallowed.
pub fn fetch_torrent(
    host: &dyn HostCtx,
    indexer_id: &str,
    url: &str,
) -> anyhow::Result<Option<Vec<u8>>> {
    let Some(resolve) = resolve(host, TORRENT_FETCH) else {
        return Ok(None);
    };
    call(
        &resolve,
        &format!("{TORRENT_FETCH}/fetch"),
        &json!({ "indexer_id": indexer_id, "url": url }),
    )
}

/// Every configured indexer's id and name, for labelling the queue. An absent
/// indexer module leaves the rows unlabelled rather than failing the page.
pub fn names(host: &dyn HostCtx) -> Vec<IndexerName> {
    let Some(resolve) = resolve(host, INDEXER_DB) else {
        return Vec::new();
    };
    call::<_, Vec<IndexerName>>(&resolve, &format!("{INDEXER_DB}/list"), &json!({}))
        .unwrap_or_default()
}

fn resolve(host: &dyn HostCtx, point: &str) -> Option<Resolver> {
    pinned_resolver(host, point, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    use kroma_module_sdk::host::testing::StubHost;

    // No indexer module: a grab falls back to a plain fetch, and the queue draws
    // its rows with no indexer name. Neither is an error.
    #[test]
    fn an_absent_indexer_module_degrades_rather_than_failing() {
        let host = StubHost::new();

        assert_eq!(
            fetch_torrent(&host, "idx-1", "http://t/f.torrent").unwrap(),
            None
        );
        assert!(names(&host).is_empty());
    }

    // The provider sends the whole indexer reference; this module reads two fields
    // of it and ignores the rest.
    #[test]
    fn a_name_reads_two_fields_out_of_whatever_the_provider_sends() {
        let json = json!({ "id": "idx-1", "name": "Jackett", "kind": "torznab", "priority": 30 });

        let indexer: IndexerName = serde_json::from_value(json).unwrap();

        assert_eq!(indexer.id, "idx-1");
        assert_eq!(indexer.name, "Jackett");
    }
}

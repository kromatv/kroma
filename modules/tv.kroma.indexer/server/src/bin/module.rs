//! The Indexers module as a standalone process (its `.kmod` entrypoint). It
//! serves the `indexer-db`, `indexer-search` and `torrent-fetch` contracts; what
//! it consumes it resolves at the point of use.

use std::sync::Arc;

use kroma_module_runtime::RemoteHost;
use kroma_module_sdk::ports::{
    indexer_routes, IndexerDbPort, IndexerSearchPort, TorrentFetchPort,
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let db: Arc<dyn IndexerDbPort> = Arc::new(kroma_indexer::IndexerDb);
    let search: Arc<dyn IndexerSearchPort> = Arc::new(kroma_indexer::IndexerSearch);
    let fetch: Arc<dyn TorrentFetchPort> = Arc::new(kroma_indexer::IndexerTorrentFetch);

    kroma_module_runtime::serve(
        |_host| {},
        vec![kroma_indexer::server_module::<RemoteHost>()],
        indexer_routes(db, search, fetch),
    )
    .await
}

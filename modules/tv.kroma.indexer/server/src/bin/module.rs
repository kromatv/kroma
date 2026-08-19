//! The Indexers module as a standalone process (its `.kmod` entrypoint). It
//! serves the `indexer-db`, `indexer-search` and `torrent-fetch` contracts; what
//! it consumes it resolves at the point of use.

use std::sync::Arc;

use kroma_module_runtime::RemoteHost;
use kroma_module_sdk::host::HostStorage;
use kroma_module_sdk::ports::{
    indexer_routes, IndexerDbPort, IndexerSearchPort, TorrentFetchPort,
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    kroma_module_runtime::serve(
        |host| {
            // The `indexers` table is this module's own, in its own file. The
            // three providers hold that pool because the port contracts they
            // implement name only `HostCtx`: a consumer of a contract holds no
            // capability just because the provider does.
            let store = host.store().clone();
            let db: Arc<dyn IndexerDbPort> = Arc::new(kroma_indexer::IndexerDb::new(store.clone()));
            let search: Arc<dyn IndexerSearchPort> =
                Arc::new(kroma_indexer::IndexerSearch::new(store.clone()));
            let fetch: Arc<dyn TorrentFetchPort> =
                Arc::new(kroma_indexer::IndexerTorrentFetch::new(store));
            indexer_routes(db, search, fetch)
        },
        vec![kroma_indexer::server_module::<RemoteHost>()],
    )
    .await
}

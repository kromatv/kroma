//! The Indexers module as a standalone process (its `.kmod` entrypoint). It
//! answers the `indexer-db`, `indexer-search` and `torrent-fetch` points; what it
//! calls, it resolves at the point of use.

use kroma_module_runtime::RemoteHost;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    kroma_module_runtime::serve(
        |_host| kroma_indexer::port::routes(),
        vec![kroma_indexer::server_module::<RemoteHost>()],
    )
    .await
}

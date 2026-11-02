//! The Indexers module as a WebAssembly component (its `.kmod` entrypoint). It
//! answers the `indexer-db`, `indexer-search` and `torrent-fetch` points; what it
//! calls, it resolves at the point of use.

use kroma_module_runtime::RemoteHost;

kroma_module_runtime::module_main!(
    |_host: &RemoteHost| kroma_indexer::port::routes(),
    vec![kroma_indexer::server_module::<RemoteHost>()],
);

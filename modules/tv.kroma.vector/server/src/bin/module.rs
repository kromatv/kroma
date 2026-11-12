//! The Vector (embeddings) module's `.kmod` entrypoint: a port provider serving the
//! embedder over the port bridge (`/_port/embedder/*`), with no admin routes and no
//! `ServerModule`. The core resolves an `EmbedderClient` proxy to it and uses
//! `embed_batch` for the catalog-wide reembed pass.

use kroma_module_runtime::RemoteHost;

kroma_module_runtime::module_main!(
    |_host: &RemoteHost| kroma_vector::embedder_routes::<RemoteHost>(kroma_vector::default_embedder()),
    vec![],
);

//! The Torznab module as a standalone process (its `.kmod` entrypoint). It has no
//! admin routes: it exists to serve the `torznab` contract (Jackett/Prowlarr
//! search) to whoever consumes it.

use std::sync::Arc;

use kroma_module_sdk::ports::{torznab_routes, TorznabPort};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let engine: Arc<dyn TorznabPort> = Arc::new(kroma_torznab::TorznabEngine);
    kroma_module_runtime::serve(|_host| {}, vec![], torznab_routes(engine)).await
}

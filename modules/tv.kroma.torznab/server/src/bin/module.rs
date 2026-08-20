//! The Torznab module as a standalone process (its `.kmod` entrypoint). It has no
//! admin routes: it exists to answer the `torznab` point (Jackett/Prowlarr
//! search) for whoever consumes it.

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    kroma_module_runtime::serve(|_host| kroma_torznab::port::routes(), vec![]).await
}

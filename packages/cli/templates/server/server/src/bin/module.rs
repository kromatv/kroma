use kroma_module_runtime::RemoteHost;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    kroma_module_runtime::serve_one(|_host| {}, __CRATE_IDENT__::server_module::<RemoteHost>()).await
}

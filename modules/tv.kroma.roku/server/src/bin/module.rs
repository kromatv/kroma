use kroma_module_runtime::RemoteHost;
use kroma_module_sdk::host::HostCtx;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    kroma_module_runtime::serve_one(
        |host| host.register_service(kroma_roku::roku_service(host.data_dir())),
        kroma_roku::server_module::<RemoteHost>(),
    )
    .await
}

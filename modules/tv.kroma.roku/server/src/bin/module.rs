use kroma_module_runtime::RemoteHost;
use kroma_module_sdk::host::HostCtx;

kroma_module_runtime::module_main!(
    |host: &RemoteHost| {
        host.register_service(kroma_roku::roku_service(host.data_dir()));
        axum::Router::new()
    },
    vec![kroma_roku::server_module::<RemoteHost>()],
);

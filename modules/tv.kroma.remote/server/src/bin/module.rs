use kroma_module_runtime::RemoteHost;
use kroma_module_sdk::host::HostCtx;

kroma_module_runtime::module_main!(
    |host: &RemoteHost| {
        host.register_service(kroma_remote::RemoteAccess::new(
            host.data_dir().to_path_buf(),
        ));
        axum::Router::new()
    },
    vec![kroma_remote::server_module::<RemoteHost>()],
);

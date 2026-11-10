use kroma_module_runtime::RemoteHost;
use kroma_module_sdk::host::HostCtx;

kroma_module_runtime::module_main!(
    |host: &RemoteHost| {
        host.register_service(kroma_vpn::Vpn::new(host.data_dir().to_path_buf()));
        kroma_vpn::network::routes()
    },
    vec![kroma_vpn::server_module::<RemoteHost>()],
);

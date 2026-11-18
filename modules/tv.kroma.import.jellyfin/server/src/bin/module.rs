use kroma_module_runtime::RemoteHost;

kroma_module_runtime::module_main!(
    |_host: &RemoteHost| kroma_import_jellyfin::routes(),
    vec![kroma_import_jellyfin::server_module::<RemoteHost>()],
);

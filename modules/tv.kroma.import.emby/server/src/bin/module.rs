use kroma_module_runtime::RemoteHost;

kroma_module_runtime::module_main!(
    |_host: &RemoteHost| kroma_import_emby::routes(),
    vec![kroma_import_emby::server_module::<RemoteHost>()],
);

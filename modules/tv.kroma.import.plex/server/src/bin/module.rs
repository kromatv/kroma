use kroma_module_runtime::RemoteHost;

kroma_module_runtime::module_main!(
    |_host: &RemoteHost| kroma_module_plex::routes::<RemoteHost>(),
    vec![kroma_module_plex::server_module::<RemoteHost>()],
);

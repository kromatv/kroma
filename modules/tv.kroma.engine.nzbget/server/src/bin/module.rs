use kroma_module_runtime::RemoteHost;

kroma_module_runtime::module_main!(
    |_host| kroma_nzbget::port::routes(),
    vec![kroma_nzbget::server_module::<RemoteHost>()],
);

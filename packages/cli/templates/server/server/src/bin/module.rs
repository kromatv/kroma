use kroma_module_runtime::RemoteHost;

kroma_module_runtime::module_main!(
    |_host: &RemoteHost| axum::Router::new(),
    vec![__CRATE_IDENT__::server_module::<RemoteHost>()],
);

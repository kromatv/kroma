//! The mDNS module as a standalone process (its `.kmod` entrypoint). A
//! lifecycle-only module: no routes; `on_enable` starts advertising.

use kroma_module_runtime::RemoteHost;

kroma_module_runtime::module_main!(
    |_host: &RemoteHost| axum::Router::new(),
    vec![kroma_mdns::server_module::<RemoteHost>()],
);

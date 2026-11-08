use std::sync::Arc;

use kroma_module_runtime::RemoteHost;
use kroma_module_sdk::host::HostCtx;

kroma_module_runtime::module_main!(
    |host: &RemoteHost| kroma_trailers::routes::<RemoteHost>(Arc::new(
        kroma_trailers::Trailers::new(host.data_dir())
    )),
    vec![],
);

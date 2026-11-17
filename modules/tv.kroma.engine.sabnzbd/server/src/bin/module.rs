//! The SABnzbd engine as a standalone process (its `.kmod` entrypoint).

use kroma_module_runtime::RemoteHost;

kroma_module_runtime::module_main!(
        |_host| kroma_sabnzbd::port::routes(),
        vec![kroma_sabnzbd::server_module::<RemoteHost>()],);

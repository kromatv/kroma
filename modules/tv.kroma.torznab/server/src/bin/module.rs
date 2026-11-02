//! The Torznab module as a standalone process (its `.kmod` entrypoint). It has no
//! admin routes: it exists to answer the `torznab` point (Jackett/Prowlarr
//! search) for whoever consumes it.

kroma_module_runtime::module_main!(|_host| kroma_torznab::port::routes(), vec![]);

//! The Acquisition module as a component (its `.kmod` entrypoint).
//!
//! Serves its admin routes and contributes the search / import / match passes
//! as [`ServerModule::jobs`](kroma_module_sdk::host::ServerModule::jobs),
//! reachable via `/_job/run/{key}`. It wires up no peers: every contract it
//! consumes is resolved at the point of use, so a peer that is installed later
//! simply starts answering.

use kroma_module_runtime::RemoteHost;

kroma_module_runtime::module_main!(
    |_host: &RemoteHost| kroma_acquisition::acqsearch_routes::<RemoteHost>(),
    vec![kroma_acquisition::server_module::<RemoteHost>()],
);

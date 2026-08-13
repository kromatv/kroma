//! The Acquisition module as a standalone process (its `.kmod` entrypoint).
//!
//! Serves its admin routes and contributes the search / import / match passes
//! as [`ServerModule::jobs`](kroma_module_sdk::host::ServerModule::jobs),
//! reachable via `/_job/run/{key}`. It wires up no peers: every contract it
//! consumes is resolved at the point of use, so a peer that is installed later
//! simply starts answering.

use kroma_module_runtime::RemoteHost;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    kroma_module_runtime::serve(
        |_host| {},
        vec![kroma_acquisition::server_module::<RemoteHost>()],
        // Provider routes for the core's /api/requests/:id/search + /grab endpoints.
        kroma_acquisition::acqsearch_routes::<RemoteHost>(),
    )
    .await
}

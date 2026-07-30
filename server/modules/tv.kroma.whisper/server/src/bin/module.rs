//! The Whisper module's `.kmod` entrypoint: a sidecar serving transcription over
//! the port bridge, so candle inference and its Metal/CUDA deps stay out of the
//! core process. Progress and cancel flow through a shared `whisper_jobs` DB row.

use kroma_module_runtime::RemoteHost;
use kroma_module_sdk::host::HostCtx;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    kroma_module_runtime::serve(
        move |host| {
            // Make sure the coordination table exists before the core writes to it.
            kroma_whisper::ensure_jobs_table(host.db());
        },
        vec![],
        kroma_whisper::whisper_routes::<RemoteHost>(),
    )
    .await
}

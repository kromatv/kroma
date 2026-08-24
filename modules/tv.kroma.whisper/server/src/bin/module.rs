//! The Whisper module's `.kmod` entrypoint: a sidecar serving transcription over
//! the port bridge, so candle inference and its Metal/CUDA deps stay out of the
//! core process. Progress and cancel flow through a shared `whisper_jobs` DB row.

use kroma_module_runtime::RemoteHost;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    kroma_module_runtime::serve(
        |_host| kroma_whisper::whisper_routes::<RemoteHost>(),
        vec![],
    )
    .await
}

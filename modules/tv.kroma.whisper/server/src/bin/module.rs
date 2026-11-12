//! The Whisper module's `.kmod` entrypoint: serves transcription over the port
//! bridge. Progress and cancel flow through a shared `whisper_jobs` row.

use kroma_module_runtime::RemoteHost;

kroma_module_runtime::module_main!(
    |_host: &RemoteHost| kroma_whisper::whisper_routes::<RemoteHost>(),
    vec![],
);

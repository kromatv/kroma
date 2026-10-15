use crate::infra::subtitles;
use crate::state::SharedState;

/// The WebVTT of the `nth` text subtitle file beside `abs`, or `None` when there
/// is no such file.
///
/// It is converted once and cached under the sidecar's own path and mtime, so a
/// replaced `.srt` is read again and a re-encoded video does not throw the
/// conversion away.
pub(super) async fn nth_beside(state: &SharedState, abs: &str, nth: usize) -> Option<Vec<u8>> {
    let beside = state.external_subtitles.clone();
    let (abs, data_dir) = (abs.to_string(), state.config.data_dir.clone());
    tokio::task::spawn_blocking(move || {
        let found = beside.of(&abs).into_iter().nth(nth)?;
        let source = found.path.to_string_lossy().into_owned();
        let cache = subtitles::cache_path(&data_dir, &source, 0);
        if let Ok(bytes) = std::fs::read(&cache) {
            return Some(bytes);
        }
        match kroma_media::external_subtitles::to_vtt(&found.path, &cache, &|| false) {
            Ok(()) => std::fs::read(&cache).ok(),
            Err(reason) => {
                tracing::warn!(file = %source, error = %reason, "a subtitle file would not convert");
                None
            }
        }
    })
    .await
    .ok()
    .flatten()
}

use std::sync::Arc;

use kroma_module_sdk::media::external_subtitles::to_vtt;

use crate::DownloadManager;

use super::file::WatchedFile;
use super::source::Refusal;
use super::vtt::Vtt;
use super::Watch;

impl Watch {
    /// The cues of the `nth` subtitle file beside `watched`, converted once.
    ///
    /// A subtitle file is a few kilobytes, so nothing reads it in spans: it is
    /// answered whole or refused as not here yet. Its every byte has to be on
    /// disk first, which is the same thing that puts it in the listing.
    pub(super) async fn subtitle_beside(
        &self,
        manager: &Arc<DownloadManager>,
        watched: &WatchedFile,
        nth: usize,
    ) -> Result<Vtt, Refusal> {
        let asked = watched.clone();
        let downloads = Arc::clone(manager);
        let beside = tokio::task::spawn_blocking(move || {
            downloads
                .subtitles_beside(&asked.download, asked.file)
                .into_iter()
                .nth(nth)
        })
        .await
        .map_err(|_| Refusal::Failed("internal error".to_string()))?
        .ok_or_else(|| {
            Refusal::Unknown(format!("this file has no subtitle track {nth} beside it"))
        })?;
        if !beside.arrived {
            return Err(Refusal::NotYet(
                "this subtitle file has not arrived yet".to_string(),
            ));
        }
        let source = manager
            .file_on_disk(&watched.download, beside.file_index)
            .map_err(|e| Refusal::NotYet(format!("{e:#}")))?;
        let out = self
            .scratch_for(watched)
            .join("subs")
            .join(format!("beside-{nth}.vtt"));
        let body = tokio::task::spawn_blocking(move || {
            if let Ok(held) = std::fs::read_to_string(&out) {
                return Ok(held);
            }
            to_vtt(&source, &out, &|| false).and_then(|()| {
                std::fs::read_to_string(&out).map_err(|e| format!("could not read the cues: {e}"))
            })
        })
        .await
        .map_err(|_| Refusal::Failed("internal error".to_string()))?
        .map_err(Refusal::Failed)?;
        Ok(Vtt {
            body: Arc::new(body),
            partial: false,
        })
    }
}

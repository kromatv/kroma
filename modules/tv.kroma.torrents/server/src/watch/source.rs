use std::path::PathBuf;
use std::sync::Arc;

use axum::http::StatusCode;
use axum::response::Response;
use serde::Deserialize;

use kroma_module_sdk::host::json_error;

use crate::downloads::Granted;
use crate::engine::PieceLayout;
use crate::DownloadManager;

use super::file::WatchedFile;
use super::Watch;

/// The play token a media element carries, since it attaches no header of its
/// own.
#[derive(Debug, Default, Deserialize)]
pub(super) struct Presented {
    pub(super) t: Option<String>,
}

/// The token presented, once it has been checked to name THIS file of THIS
/// download: one minted for a sibling is no credential here.
pub(super) fn presented(
    carried: &Presented,
    downloads: &DownloadManager,
    watched: &WatchedFile,
) -> Result<String, Response> {
    let refused = || json_error(StatusCode::UNAUTHORIZED, "a play token is required");
    let token = carried.t.as_deref().ok_or_else(refused)?;
    match downloads.grants_file(token, &watched.download, watched.file) {
        true => Ok(token.to_string()),
        false => Err(refused()),
    }
}

#[derive(Debug)]
pub enum Refusal {
    Unknown(String),
    NotYet(String),
    Busy(String),
    Failed(String),
}

impl From<Refusal> for Response {
    fn from(refusal: Refusal) -> Self {
        match refusal {
            Refusal::Unknown(why) => json_error(StatusCode::NOT_FOUND, &why),
            Refusal::NotYet(why) => json_error(StatusCode::SERVICE_UNAVAILABLE, &why),
            Refusal::Busy(why) => json_error(StatusCode::CONFLICT, &why),
            Refusal::Failed(why) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &why),
        }
    }
}

impl Watch {
    pub(crate) async fn ticket(
        &self,
        manager: &Arc<DownloadManager>,
        watched: &WatchedFile,
    ) -> Result<Granted, Refusal> {
        let (manager, asked) = (Arc::clone(manager), watched.clone());
        tokio::task::spawn_blocking(move || manager.grant_play(&asked.download, asked.file))
            .await
            .map_err(|_| Refusal::Failed("internal error".to_string()))?
            .map_err(|e| Refusal::Unknown(format!("{e:#}")))
    }

    /// The URL ffmpeg reads `watched` from: this process's own byte route, so
    /// the pieces go from the engine to ffmpeg without crossing a proxy.
    pub async fn input(
        &self,
        manager: &Arc<DownloadManager>,
        watched: &WatchedFile,
    ) -> Result<String, Refusal> {
        Ok(self.read_from(&self.ticket(manager, watched).await?))
    }

    pub(super) fn read_from(&self, granted: &Granted) -> String {
        format!("{}/_read/{}", self.own_base, granted.token)
    }

    /// Reading that path is not reading the torrent: the engine preallocates
    /// the whole file, so a byte that has not arrived answers a zero rather
    /// than sending the piece picker after it. Whoever reads it asks the layout
    /// what it may read.
    pub(super) async fn on_disk(
        &self,
        manager: &Arc<DownloadManager>,
        watched: &WatchedFile,
    ) -> Result<(PieceLayout, PathBuf), Refusal> {
        let (manager, asked) = (Arc::clone(manager), watched.clone());
        tokio::task::spawn_blocking(move || {
            let layout = manager.file_layout(&asked.download, asked.file)?;
            let path = manager.file_on_disk(&asked.download, asked.file)?;
            anyhow::Ok((layout, path))
        })
        .await
        .map_err(|_| Refusal::Failed("internal error".to_string()))?
        .map_err(|e| Refusal::NotYet(format!("{e:#}")))
    }
}

#[cfg(test)]
mod tests {
    use kroma_module_sdk::host::testing::StubHost;

    use super::super::test_support::watch_engine;
    use super::*;
    use crate::downloads::test_support::{added, manager_over};

    #[test]
    fn a_token_granted_for_another_file_is_no_credential_for_this_one() {
        let (_host, downloads) = manager_over("watch-token-file", &[added("d1")]);
        let granted = downloads.grant_play("d1", 0).unwrap();
        let carried = Presented {
            t: Some(granted.token),
        };

        let taken = [0, 1].map(|file| {
            presented(
                &carried,
                &downloads,
                &WatchedFile::new("d1".into(), file).unwrap(),
            )
            .is_ok()
        });

        assert_eq!(taken, [true, false]);
        let none = WatchedFile::new("d1".into(), 0).unwrap();
        assert!(presented(&Presented::default(), &downloads, &none).is_err());
    }

    #[test]
    fn ffmpeg_reads_this_process_own_address_rather_than_the_core_proxy() {
        let host = StubHost::new();
        let engine = watch_engine(&host);

        assert!(engine.own_base.starts_with("http://127.0.0.1:"));
        assert!(!engine.own_base.contains("/api/module/"));
    }
}

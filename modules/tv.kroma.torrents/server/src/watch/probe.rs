use axum::extract::{Path, State};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};

use kroma_module_sdk::domain::Permission;
use kroma_module_sdk::host::{AuthUser, HostStorage};

use super::listing::{offered_to, watched_file};
use super::probe_view::ProbeView;
use super::{engine, manager};

pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new().route("/watch/{id}/files/{file}/probe", get(probe::<S>))
}

async fn probe<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Path((id, file)): Path<(String, usize)>,
) -> Result<Response, Response> {
    state.require(&user, Permission::WatchablePlay)?;
    let downloads = manager(&state)?;
    offered_to(&user, &downloads, &id).await?;
    let watched = watched_file(id, file)?;
    let probed = engine(&state)?.probe(&downloads, &watched).await?;
    let beside = downloads.subtitles_beside(&watched.download, watched.file);
    Ok(Json(ProbeView::of(probed.as_ref(), &beside)).into_response())
}

#[cfg(test)]
mod tests {
    use super::*;

    use axum::http::StatusCode;
    use kroma_module_sdk::host::testing::StubHost;

    use crate::db;
    use crate::downloads::test_support::{added, manager_over, offering};
    use crate::watch::test_support::{call, member, watch_engine, BEARER};

    fn served(tag: &str, status: &str) -> StubHost {
        let row = crate::db::DownloadRow {
            status: status.into(),
            ..added("d1")
        };
        let (host, downloads) = manager_over(tag, &[row]);
        db::mark_watch_starter(host.store(), "d1", &member().id).unwrap();
        offering(&downloads, "deadbeef", &[0]);
        let engine = watch_engine(&host);
        host.with_session(BEARER, member())
            .with_service(downloads)
            .with_service(engine)
    }

    #[tokio::test]
    async fn a_download_the_catalogue_has_taken_over_is_not_described_again() {
        let imported = served("watch-probe-imported", "imported");

        let (status, _) = call(routes(), imported, "GET", "/watch/d1/files/0/probe").await;

        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn a_grab_that_has_not_reached_the_engine_is_worth_asking_again() {
        let queued = served("watch-probe-queued", "queued");

        let (status, _) = call(routes(), queued, "GET", "/watch/d1/files/0/probe").await;

        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    }
}

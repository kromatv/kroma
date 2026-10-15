use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;

use kroma_module_sdk::domain::{Permission, User};
use kroma_module_sdk::host::{blocking, json_error, AuthUser, HostStorage};

use crate::DownloadManager;

use super::file::WatchedFile;
use super::probes::offered;
use super::source::Refusal;
use super::view::{TicketView, WatchableListView};
use super::viewer::Viewer;
use super::{engine, manager};

const DEFAULT_BUCKETS: u64 = 120;

pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/watch", get(list::<S>))
        .route("/watch/{id}", delete(cancel::<S>))
        .route("/watch/{id}/files/{file}/progress", get(progress::<S>))
        .route("/watch/{id}/files/{file}/ticket", post(ticket::<S>))
}

async fn list<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    state.require(&user, Permission::WatchablePlay)?;
    let downloads = manager(&state)?;
    let viewer = Viewer::of(&user);
    let entries = blocking(move || downloads.watchable(&viewer)).await?;
    Ok(Json(WatchableListView { entries }).into_response())
}

async fn cancel<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    state.require(&user, Permission::WatchablePlay)?;
    let downloads = manager(&state)?;
    offered_to(&user, &downloads, &id).await?;
    refusable(move || downloads.cancel_watch(&id)).await?;
    Ok(Json(json!({ "removed": true })).into_response())
}

/// Refuses every download this viewer was not offered, the same way one that
/// does not exist is refused: a member is answered about the watch downloads
/// they started and nothing else.
pub(super) async fn offered_to(
    user: &User,
    downloads: &Arc<DownloadManager>,
    id: &str,
) -> Result<(), Response> {
    let (viewer, asked, manager) = (Viewer::of(user), id.to_string(), Arc::clone(downloads));
    let offered = blocking(move || manager.watchable_by(&viewer, &asked)).await?;
    match offered {
        true => Ok(()),
        false => Err(json_error(StatusCode::NOT_FOUND, "no such download")),
    }
}

#[derive(Debug, Deserialize)]
struct ProgressParams {
    buckets: Option<u64>,
}

async fn progress<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Path((id, file)): Path<(String, usize)>,
    Query(params): Query<ProgressParams>,
) -> Result<Response, Response> {
    state.require(&user, Permission::WatchablePlay)?;
    let downloads = manager(&state)?;
    offered_to(&user, &downloads, &id).await?;
    let buckets = params.buckets.unwrap_or(DEFAULT_BUCKETS);
    let progress = refusable(move || {
        downloads
            .watch_progress(&id, file, buckets)
            .map_err(|e| Refusal::NotYet(format!("{e:#}")))
    })
    .await?;
    Ok(Json(progress).into_response())
}

async fn ticket<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Path((id, file)): Path<(String, usize)>,
) -> Result<Response, Response> {
    state.require(&user, Permission::WatchablePlay)?;
    let downloads = manager(&state)?;
    offered_to(&user, &downloads, &id).await?;
    let watched = watched_file(id, file)?;
    // Minting narrows the torrent to this file, so it is granted only for a
    // video file the listing offers: anything else would point the piece picker
    // at a subtitle or a text file somebody else's pack happens to carry.
    offered(&downloads, &watched).await?;
    let minted = engine(&state)?.ticket(&downloads, &watched).await?;
    Ok(Json(TicketView {
        url: format!("/api/module/{}/play/{}", crate::MODULE_ID, minted.token),
        token: minted.token,
        expires_at: minted.expires_at,
    })
    .into_response())
}

pub(super) fn watched_file(id: String, file: usize) -> Result<WatchedFile, Response> {
    WatchedFile::new(id, file).ok_or_else(|| json_error(StatusCode::NOT_FOUND, "no such download"))
}

async fn refusable<T: Send + 'static>(
    job: impl FnOnce() -> Result<T, Refusal> + Send + 'static,
) -> Result<T, Response> {
    match tokio::task::spawn_blocking(job).await {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(refusal)) => Err(refusal.into()),
        Err(_) => Err(json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal error",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use serde_json::Value;

    use kroma_module_sdk::host::testing::StubHost;

    use crate::db;
    use crate::downloads::test_support::{added, manager_over, offering};
    use crate::watch::test_support::{
        anonymous, call, call_as, member, other_member, watch_engine, BEARER, OTHER_BEARER,
    };

    fn served(tag: &str) -> StubHost {
        let (host, downloads) = manager_over(tag, &[added("d1")]);
        db::mark_watch_starter(host.store(), "d1", &member().id).unwrap();
        offering(&downloads, "deadbeef", &[0]);
        let engine = watch_engine(&host);
        host.with_session(BEARER, member())
            .with_session(OTHER_BEARER, other_member())
            .with_service(downloads)
            .with_service(engine)
    }

    async fn answer(host: StubHost, method: &str, path: &str) -> (StatusCode, Value) {
        call(routes(), host, method, path).await
    }

    fn every_route() -> axum::Router<StubHost> {
        crate::watch::routes()
    }

    #[tokio::test]
    async fn a_listing_answers_the_entries_key_a_client_reads() {
        let host = served("watch-list");

        let (status, listed) = answer(host, "GET", "/watch").await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(listed["entries"][0]["id"], "d1");
        assert_eq!(listed["entries"][0]["files"][0]["index"], 0);
    }

    #[tokio::test]
    async fn a_ticket_hands_over_the_token_as_well_as_the_url_it_is_already_in() {
        let host = served("watch-ticket");

        let (status, minted) = answer(host, "POST", "/watch/d1/files/0/ticket").await;

        assert_eq!(status, StatusCode::OK);
        let token = minted["token"].as_str().expect("a token").to_string();
        assert_eq!(
            minted["url"],
            serde_json::json!(format!("/api/module/tv.kroma.torrents/play/{token}"))
        );
        assert!(minted["expiresAt"].as_i64().unwrap() > 0);
    }

    #[tokio::test]
    async fn a_member_is_listed_only_the_watch_downloads_they_started() {
        let host = served("watch-list-mine");

        let (_, mine) = answer(host.clone(), "GET", "/watch").await;
        let (_, theirs) = call_as(routes(), host, OTHER_BEARER, "GET", "/watch").await;

        assert_eq!(mine["entries"][0]["id"], "d1");
        assert_eq!(theirs["entries"], serde_json::json!([]));
    }

    #[tokio::test]
    async fn every_route_answers_a_member_nothing_about_a_download_somebody_else_started() {
        let host = served("watch-other-member");

        let refused = [
            ("POST", "/watch/d1/files/0/ticket"),
            ("GET", "/watch/d1/files/0/progress"),
            ("GET", "/watch/d1/files/0/probe"),
            ("GET", "/watch/d1/files/0/storyboard"),
            ("DELETE", "/watch/d1"),
        ];

        for (method, path) in refused {
            let (status, _) =
                call_as(every_route(), host.clone(), OTHER_BEARER, method, path).await;
            assert_eq!(status, StatusCode::NOT_FOUND, "{method} {path}");
        }
    }

    #[tokio::test]
    async fn no_ticket_is_minted_for_a_file_the_listing_does_not_offer() {
        let host = served("watch-ticket-unoffered");

        let (status, refusal) = answer(host, "POST", "/watch/d1/files/9999/ticket").await;

        assert_eq!(status, StatusCode::NOT_FOUND);
        assert!(
            refusal["error"].as_str().unwrap().contains("no file 9999"),
            "{refusal}"
        );
    }

    #[tokio::test]
    async fn a_download_this_module_does_not_hold_is_not_found() {
        let host = served("watch-ticket-unknown");

        let (status, _) = answer(host, "POST", "/watch/d2/files/0/ticket").await;

        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn a_cancelled_watch_download_answers_that_it_was_removed() {
        let host = served("watch-cancel");
        db::mark_ephemeral(host.store(), "d1").unwrap();

        let (status, answered) = answer(host, "DELETE", "/watch/d1").await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(answered, serde_json::json!({ "removed": true }));
    }

    #[tokio::test]
    async fn cancelling_a_download_nobody_started_to_watch_is_a_conflict() {
        let host = served("watch-cancel-ordinary");

        let (status, _) = answer(host, "DELETE", "/watch/d1").await;

        assert_eq!(status, StatusCode::CONFLICT);
    }

    #[tokio::test]
    async fn a_call_arriving_before_the_engine_is_running_says_so_instead_of_panicking() {
        let bare = StubHost::new().with_session(BEARER, member());

        let (status, refusal) = answer(bare, "GET", "/watch").await;

        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
        assert!(
            refusal["error"].as_str().unwrap().contains("not running"),
            "{refusal}"
        );
    }

    #[tokio::test]
    async fn every_member_facing_route_checks_the_bearer_itself() {
        let host = served("watch-bearer");

        let refused = anonymous(routes(), host, "GET", "/watch").await;

        assert_eq!(refused, StatusCode::UNAUTHORIZED);
    }
}

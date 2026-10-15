use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;
use serde_json::json;

use kroma_module_sdk::domain::Permission;
use kroma_module_sdk::host::{json_error, AuthUser, HostStorage};

use super::file::WatchedFile;
use super::listing::{offered_to, watched_file};
use super::sheets::Drawn;
use super::source::{presented, Presented};
use super::{engine, manager};

/// `ready` is one character per cell, `1` where a picture is already there.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoryboardView {
    url: String,
    interval: f64,
    tile_w: u32,
    tile_h: u32,
    cols: u32,
    rows: u32,
    count: u32,
    duration: f64,
    complete: bool,
    ready: String,
}

pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/watch/{id}/files/{file}/storyboard", get(manifest::<S>))
        .route("/watch/{id}/files/{file}/storyboard.img", get(sheet::<S>))
}

async fn manifest<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Path((id, file)): Path<(String, usize)>,
) -> Result<Response, Response> {
    state.require(&user, Permission::WatchablePlay)?;
    let downloads = manager(&state)?;
    offered_to(&user, &downloads, &id).await?;
    let watched = watched_file(id, file)?;
    let watch = engine(&state)?;
    let Some(drawn) = watch.storyboard(&downloads, &watched).await? else {
        return Ok(pending());
    };
    let token = watch.ticket(&downloads, &watched).await?.token;
    Ok(Json(view(&drawn, &watched, &token)).into_response())
}

async fn sheet<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    Path((id, file)): Path<(String, usize)>,
    Query(carried): Query<Presented>,
) -> Result<Response, Response> {
    let watched = watched_file(id, file)?;
    let downloads = manager(&state)?;
    presented(&carried, &downloads, &watched)?;
    let bytes = engine(&state)?
        .sheet(&watched)
        .await
        .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "no sheet has been drawn yet"))?;
    Ok(Response::builder()
        .header(header::CONTENT_TYPE, "image/jpeg")
        // A sheet still gaining tiles is rewritten in place under the same
        // name; what tells the two apart is the `v` its manifest carries.
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(bytes))
        .unwrap_or_else(|_| json_error(StatusCode::INTERNAL_SERVER_ERROR, "internal error")))
}

fn pending() -> Response {
    let mut answer = Json(json!({ "status": "pending" })).into_response();
    *answer.status_mut() = StatusCode::ACCEPTED;
    answer.headers_mut().insert(
        header::CACHE_CONTROL,
        header::HeaderValue::from_static("no-store"),
    );
    answer
}

fn view(drawn: &Drawn, watched: &WatchedFile, token: &str) -> StoryboardView {
    let plan = drawn.plan;
    StoryboardView {
        url: format!(
            "/api/module/{}/watch/{}/files/{}/storyboard.img?t={token}&v={}",
            crate::MODULE_ID,
            watched.download,
            watched.file,
            drawn.version
        ),
        interval: f64::from(plan.interval),
        tile_w: kroma_module_sdk::media::storyboard::TILE_W,
        tile_h: kroma_module_sdk::media::storyboard::TILE_H,
        cols: plan.cols,
        rows: plan.rows,
        count: plan.count,
        duration: drawn.duration_ms as f64 / 1000.0,
        complete: drawn.complete,
        ready: drawn.ready.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use kroma_module_sdk::media::storyboard::Plan;

    fn drawn(ready: &str) -> Drawn {
        Drawn {
            plan: Plan::for_duration(658.0),
            complete: !ready.contains('0'),
            ready: ready.to_string(),
            version: 3,
            duration_ms: 658_080,
        }
    }

    #[test]
    fn a_manifest_names_a_sheet_a_client_can_fetch_as_it_stands() {
        let watched = WatchedFile::new("22e86113ba9a6db4".into(), 5).unwrap();

        let view = view(&drawn("110"), &watched, "dev.999.sig");

        assert_eq!(
            view.url,
            "/api/module/tv.kroma.torrents/watch/22e86113ba9a6db4/files/5/storyboard.img?t=dev.999.sig&v=3"
        );
        assert_eq!(view.ready, "110");
        assert!(!view.complete);
    }

    #[test]
    fn a_manifest_carries_the_same_grid_the_catalogue_draws() {
        let watched = WatchedFile::new("d1".into(), 0).unwrap();
        let plan = Plan::for_duration(658.0);

        let view = view(&drawn("1"), &watched, "t");

        assert_eq!(
            (view.cols, view.rows, view.count),
            (plan.cols, plan.rows, plan.count)
        );
        assert_eq!((view.tile_w, view.tile_h), (160, 90));
        assert_eq!(view.interval, f64::from(plan.interval));
        assert_eq!(view.duration, 658.08);
        assert!(view.complete);
    }

    #[test]
    fn a_sheet_with_no_tile_yet_is_pending_rather_than_missing() {
        let answer = pending();

        assert_eq!(answer.status(), StatusCode::ACCEPTED);
        assert_eq!(
            answer.headers().get(header::CACHE_CONTROL).unwrap(),
            "no-store"
        );
    }
}

//! What the box is re-encoding right now.

use axum::extract::State;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;

use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::state::SharedState;
use kroma_media::hls::{HlsEngine, Transcode};

/// Paths are relative to the `/api/admin` nest.
pub fn routes() -> Router<SharedState> {
    Router::new().route("/transcodes", get(transcodes))
}

/// The pipeline this host re-encodes on, and the sentence that explains it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hardware {
    pub accel: String,
    pub reason: String,
    pub accelerated: bool,
}

/// One live remux plus what the catalog and the sampler know about it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveTranscode {
    #[serde(flatten)]
    pub session: Transcode,
    pub title: Option<String>,
    pub show_title: Option<String>,
    pub season: Option<u32>,
    pub episode: Option<u32>,
    pub cpu: Option<f32>,
}

/// `GET /api/admin/transcodes` → every remux running now, the silicon they run
/// on, and what the cache they write is costing the disk.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transcodes {
    pub hardware: Hardware,
    pub sessions: Vec<LiveTranscode>,
    pub encoding: usize,
    pub cache_bytes: u64,
}

async fn transcodes(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    super::require_any_admin(&user)?;
    let live = state.hls.live().await;
    let ids: Vec<String> = live.iter().map(|t| t.item_id.clone()).collect();
    let titles = query(&state.db, move |pool| Ok(lookup(&pool, &ids))).await?;

    let encoding = live.iter().filter(|t| t.transcodes_video).count();
    let sessions = live
        .into_iter()
        .map(|session| {
            let named = titles.iter().find(|(id, _)| *id == session.item_id);
            let cpu = session.pid.and_then(|pid| state.metrics.process_cpu(pid));
            let item = named.and_then(|(_, item)| item.as_ref());
            LiveTranscode {
                title: item.map(|i| i.title.clone()),
                show_title: item.and_then(|i| i.show_title.clone()),
                season: item.and_then(|i| i.season),
                episode: item.and_then(|i| i.episode),
                cpu,
                session,
            }
        })
        .collect();

    let detected = HlsEngine::hardware();
    Ok(Json(Transcodes {
        hardware: Hardware {
            accel: detected.accel.label().to_owned(),
            reason: detected.reason.clone(),
            accelerated: detected.accel.is_device(),
        },
        sessions,
        encoding,
        cache_bytes: state.hls.cache_bytes(),
    })
    .into_response())
}

// One row per distinct id: two anchors of the same film are two sessions and one
// title. A miss is kept as `None` rather than dropped, so a session whose item
// left the catalog still reports its cost.
fn lookup(pool: &db::Pool, ids: &[String]) -> Vec<(String, Option<crate::model::MediaItem>)> {
    let mut seen: Vec<(String, Option<crate::model::MediaItem>)> = Vec::new();
    for id in ids {
        if seen.iter().any(|(known, _)| known == id) {
            continue;
        }
        seen.push((id.clone(), db::get_item(pool, id).ok().flatten()));
    }
    seen
}

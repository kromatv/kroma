//! What the box is re-encoding right now.
//!
//! A remux is a child ffmpeg, so from the dashboard it used to be invisible: the
//! server's CPU line stayed flat, no page named the title responsible, and
//! nothing said whether the encoder was keeping ahead of the player. This is the
//! one place that answers all three, plus the sentence explaining which silicon
//! the host settled on and why.

use axum::extract::State;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;

use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::infra::hls::{HlsEngine, Transcode};
use crate::state::SharedState;

/// Paths are relative to the `/api/admin` nest.
pub fn routes() -> Router<SharedState> {
    Router::new().route("/transcodes", get(transcodes))
}

/// The pipeline this host re-encodes on, and the sentence that explains it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hardware {
    /// `videotoolbox` | `qsv` | `vaapi` | `nvenc` | `software`.
    pub accel: String,
    /// Why that one: which device answered, or why every candidate was refused.
    pub reason: String,
    /// False means every frame is rebuilt by the CPU.
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
    /// Percent of the whole box this one ffmpeg is spending, where the sampler
    /// has seen its pid.
    pub cpu: Option<f32>,
}

/// `GET /api/admin/transcodes` → every remux running now, the silicon they run
/// on, and what the cache they write is costing the disk.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transcodes {
    pub hardware: Hardware,
    pub sessions: Vec<LiveTranscode>,
    /// How many of them are rebuilding the picture, which is the expensive axis.
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

//! Registering a subtitle generation and running it: the request, the blocking
//! model work behind it, and the progress the client polls.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::api::error::json_error;
use crate::api::util::query;
use crate::db;
use crate::services::settings;
use crate::services::subtitles::{self, GenMode, GenSpec, Quality};
use crate::state::SharedState;

use crate::boot::transcriber::TranscriberClient;
use super::transcriber_available;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateReq {
    #[serde(default)]
    pub mode: Option<String>,
    pub lang: String,
    #[serde(default)]
    pub spoken_lang: Option<String>,
    #[serde(default)]
    pub quality: Option<String>,
    #[serde(default)]
    pub audio_track: Option<u32>,
    #[serde(default)]
    pub source_track: Option<usize>,
    #[serde(default)]
    pub source_sub_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GenStarted {
    gen_id: String,
}

/// `POST /api/items/:id/subtitles/generate` → register + start a generation, return
/// its `genId`. The work runs on a blocking thread; poll `generations` for progress.
pub async fn generate(State(state): State<SharedState>, Path(id): Path<String>, Json(req): Json<GenerateReq>) -> Response {
    let item = match query(&state.db, {
        let id = id.clone();
        move |pool| db::get_item(&pool, &id)
    })
    .await
    {
        Ok(Some(it)) => it,
        Ok(None) => return json_error(StatusCode::NOT_FOUND, "item not found"),
        Err(resp) => return resp,
    };
    let Some(abs) = item.abs_path.clone() else {
        return json_error(StatusCode::NOT_FOUND, "no media file for item");
    };

    let mode = GenMode::parse(req.mode.as_deref().unwrap_or("transcribe"));

    // Cheap, synchronous config gates (no I/O) so the client gets a real error
    // instead of a genId that fails the instant it starts.
    if mode == GenMode::Transcribe && !transcriber_available(&state) {
        return json_error(StatusCode::BAD_REQUEST, "the Whisper module is not installed or not running");
    }
    if mode == GenMode::Translate && settings::default_provider(&state.settings).is_none() {
        return json_error(StatusCode::BAD_REQUEST, "no LLM provider configured for translation (admin IA page)");
    }

    let mode_label = if mode == GenMode::Translate { "translate" } else { "transcribe" };
    let target_lang = req.lang.trim().to_string();

    // Dedup: if an identical generation is already in flight (e.g. a double-click),
    // return its id instead of racing a second worker on the same output file/DB row.
    if let Some(existing) = state.subtitle_gen.find_running(&id, mode_label, &target_lang) {
        return (StatusCode::ACCEPTED, Json(GenStarted { gen_id: existing })).into_response();
    }

    let handle = state.subtitle_gen.start(&id, mode_label, Some(target_lang.clone()));
    let gen_id = handle.id().to_string();

    // Everything below runs OFF the request path: resolving Translate's source
    // WebVTT (a cached track or an embedded text track via ffmpeg) alone can take
    // up to `subtitles::TIMEOUT` (150s), and awaiting it here would break
    // fire-and-poll (nothing to poll, and a proxy/browser could time out).
    let item_id = id.clone();
    let spoken_lang = req.spoken_lang.clone().filter(|s| !s.trim().is_empty());
    let quality = Quality::parse(req.quality.as_deref().unwrap_or("balanced"));
    let audio_track = req.audio_track.unwrap_or(0);
    tokio::spawn(run_generation(GenTask {
        state: state.clone(),
        item_id,
        abs,
        req,
        mode,
        mode_label,
        target_lang,
        spoken_lang,
        quality,
        audio_track,
        handle,
    }));

    (StatusCode::ACCEPTED, Json(GenStarted { gen_id })).into_response()
}

struct GenTask {
    state: SharedState,
    item_id: String,
    abs: String,
    req: GenerateReq,
    mode: GenMode,
    mode_label: &'static str,
    target_lang: String,
    spoken_lang: Option<String>,
    quality: Quality,
    audio_track: u32,
    handle: subtitles::Handle,
}

// Marks the registry entry done/failed with the real reason once the model
// work (or, for Translate, source resolution first) completes.
async fn run_generation(t: GenTask) {
    let GenTask {
        state,
        item_id,
        abs,
        req,
        mode,
        mode_label,
        target_lang,
        spoken_lang,
        quality,
        audio_track,
        handle,
    } = t;
    let source_vtt = if mode == GenMode::Translate {
        match resolve_source(&state, &item_id, &abs, &req).await {
            Ok(vtt) => Some(vtt),
            Err(reason) => {
                handle.fail(&reason);
                return;
            }
        }
    } else {
        None
    };
    let spec = GenSpec { mode, target_lang, spoken_lang, quality, audio_track, source_vtt };
    let settings = state.settings.clone();
    let data_dir = state.config.data_dir.clone();
    let pool = state.db.clone();
    // The transcriber is the out-of-process sidecar proxy (registered as a
    // service in the composition root); translate-only generations don't need
    // it, so a missing one only fails a transcribe.
    let transcriber = kroma_module_host::service::<TranscriberClient>(&state);
    // The model (ffmpeg + Whisper / LLM) is blocking: run it on the blocking pool
    // and finalize the registry entry with its result.
    let _ = tokio::task::spawn_blocking(move || {
        let result = match transcriber.as_ref() {
            Some(transcriber) => subtitles::generate(
                &settings,
                &data_dir,
                &pool,
                &item_id,
                std::path::Path::new(&abs),
                &spec,
                &handle,
                &transcriber.step(),
            ),
            None => Err("no transcription module is installed".to_string()),
        };
        match result {
            Ok(sub) => handle.done(&sub.id),
            Err(_) if handle.cancelled() => handle.fail("cancelled"),
            Err(reason) => {
                // Surface the *real* reason (LLM/Whisper error, bad config, …) both
                // in the server log and on the polled generation, instead of a blank
                // "generation failed" the client can't act on.
                tracing::warn!(item = %item_id, mode = mode_label, "subtitle generation failed: {reason}");
                handle.fail(&reason);
            }
        }
    })
    .await;
}

// Runs in the background task, so the `Err` becomes a human message recorded
// via `handle.fail`, not an HTTP response.
async fn resolve_source(state: &SharedState, item_id: &str, abs: &str, req: &GenerateReq) -> Result<String, String> {
    if let Some(sub_id) = req.source_sub_id.as_deref().filter(|s| !s.trim().is_empty()) {
        let sub_id = sub_id.to_string();
        let sub = query(&state.db, move |pool| {
            let conn = pool.get()?;
            Ok(db::downloaded_sub(&conn, &sub_id)?)
        })
        .await
        .map_err(|_| "could not read the source subtitle from the database".to_string())?;
        let Some(sub) = sub else {
            return Err("source subtitle not found".to_string());
        };
        return match tokio::fs::read_to_string(&sub.path).await {
            Ok(text) => Ok(subtitles::to_vtt(&text)),
            Err(_) => Err("source subtitle file missing".to_string()),
        };
    }
    if let Some(track) = req.source_track {
        return match crate::api::stream::extract_webvtt(abs, track).await {
            Some(bytes) => Ok(subtitles::to_vtt(&String::from_utf8_lossy(&bytes))),
            None => Err("could not read the source subtitle track".to_string()),
        };
    }
    let _ = item_id;
    Err("translate needs a source subtitle (sourceTrack or sourceSubId)".to_string())
}

/// `GET /api/items/:id/subtitles/generations` → live + recently-finished generations.
pub async fn generations(State(state): State<SharedState>, Path(id): Path<String>) -> Response {
    Json(state.subtitle_gen.views_for(&id)).into_response()
}

/// `DELETE /api/items/:id/subtitles/generations/:gen` → request cancellation.
pub async fn cancel_generation(State(state): State<SharedState>, Path((_id, gen)): Path<(String, String)>) -> Response {
    if state.subtitle_gen.cancel(&gen) {
        StatusCode::NO_CONTENT.into_response()
    } else {
        json_error(StatusCode::NOT_FOUND, "generation not found")
    }
}

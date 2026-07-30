//! Per-element treatment views: the stages applied to one movie/episode
//! (`GET /pipeline/item/:id`) or a whole series (`GET /pipeline/show/:id`),
//! aggregated across seasons/episodes for shows. The status shown here is built
//! with the SAME rule as the elements list so the drawer never disagrees with
//! it. Reads need any admin capability.

use axum::extract::{Path as AxPath, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;

use crate::api::admin::require_any_admin;
use crate::api::error::json_error;
use crate::api::extract::AuthUser;
use crate::api::util::blocking;
use crate::model::{ElementProcessing, Kind, Treatment};
use crate::state::SharedState;

// Uses the SAME rule the elements list applies, so the drawer never disagrees
// with it. `assume_done` mirrors the list's per-stage assumption: stages whose
// absence isn't cheaply detectable are treated done when unledgered.
fn combine(ledger: Option<String>, artifact_done: bool, assume_done: bool) -> String {
    crate::services::pipeline::elements::resolve_status(ledger.as_deref(), artifact_done, assume_done)
        .to_string()
}

fn t(key: &str, status: String) -> Treatment {
    Treatment { key: key.to_string(), status, error: None }
}

/// `GET /api/admin/pipeline/item/:id` → the treatments applied to one movie or
/// episode. Movies get probe/metadata/storyboard/embed; episodes get
/// probe/storyboard/markers (their metadata/embedding live on the show).
pub async fn item_processing(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    AxPath(id): AxPath<String>,
) -> Result<Response, Response> {
    require_any_admin(&user)?;
    let out = blocking(move || {
        let db = &state.db;
        let Some(item) = crate::db::get_item(db, &id)? else {
            return Ok(None);
        };
        let files = crate::db::file_ids_for_item(db, &id)?;
        let mut ts = vec![t(
            "probe",
            combine(crate::db::pipeline::worst_status(db, "probe", &files)?, crate::db::item_probed(db, &id)?, false),
        )];
        if matches!(item.kind, Kind::Movie | Kind::Video) {
            ts.push(t("metadata", combine(crate::db::pipeline::task_status(db, "metadata", &id)?, item.metadata.is_some(), false)));
            ts.push(t("storyboard", combine(crate::db::pipeline::task_status(db, "storyboard", &id)?, state.storyboard.is_cached(&item), true)));
            ts.push(t("subtitles", combine(crate::db::pipeline::task_status(db, "subtitles", &id)?, false, true)));
            ts.push(t("embed", combine(crate::db::pipeline::task_status(db, "embed", &id)?, crate::db::has_vector(db, &id)?, false)));
        } else {
            ts.push(t("storyboard", combine(crate::db::pipeline::task_status(db, "storyboard", &id)?, state.storyboard.is_cached(&item), true)));
            ts.push(t("subtitles", combine(crate::db::pipeline::task_status(db, "subtitles", &id)?, false, true)));
            let season_ledger = match (item.show_id.as_deref(), item.season) {
                (Some(s), Some(n)) => crate::db::pipeline::task_status(db, "markers", &format!("{s}#{n}"))?,
                _ => None,
            };
            ts.push(t("markers", combine(season_ledger, crate::db::has_markers(db, &id)?, true)));
        }
        Ok(Some(ElementProcessing { treatments: ts }))
    })
    .await?;
    match out {
        Some(p) => Ok(Json(p).into_response()),
        None => Err(json_error(StatusCode::NOT_FOUND, "item not found")),
    }
}

/// `GET /api/admin/pipeline/show/:id` → the treatments applied to a whole series,
/// aggregated across its seasons/episodes (a stage is "done" only when every
/// episode's is).
pub async fn show_processing(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    AxPath(id): AxPath<String>,
) -> Result<Response, Response> {
    require_any_admin(&user)?;
    let out = blocking(move || {
        let db = &state.db;
        let Some(detail) = crate::db::get_show(db, &id)? else {
            return Ok(None);
        };
        let eps: Vec<&crate::model::MediaItem> =
            detail.seasons.iter().flat_map(|s| s.episodes.iter()).collect();
        let ep_ids: Vec<String> = eps.iter().map(|e| e.id.clone()).collect();
        let season_ids: Vec<String> =
            detail.seasons.iter().map(|s| format!("{id}#{}", s.number)).collect();
        let mut file_ids: Vec<String> = Vec::new();
        for e in &ep_ids {
            file_ids.extend(crate::db::file_ids_for_item(db, e)?);
        }
        let mut all_probed = !ep_ids.is_empty();
        for e in &ep_ids {
            all_probed &= crate::db::item_probed(db, e)?;
        }
        let all_cached = !eps.is_empty() && eps.iter().all(|e| state.storyboard.is_cached(e));
        let any_markers = ep_ids.iter().any(|e| crate::db::has_markers(db, e).unwrap_or(false));
        let treatments = vec![
            t("probe", combine(crate::db::pipeline::worst_status(db, "probe", &file_ids)?, all_probed, false)),
            t("metadata", combine(crate::db::pipeline::task_status(db, "metadata", &id)?, detail.show.metadata.is_some(), false)),
            t("storyboard", combine(crate::db::pipeline::worst_status(db, "storyboard", &ep_ids)?, all_cached, true)),
            t("subtitles", combine(crate::db::pipeline::worst_status(db, "subtitles", &ep_ids)?, false, true)),
            t("markers", combine(crate::db::pipeline::worst_status(db, "markers", &season_ids)?, any_markers, true)),
            t("embed", combine(crate::db::pipeline::task_status(db, "embed", &id)?, crate::db::has_vector(db, &id)?, false)),
        ];
        Ok(Some(ElementProcessing { treatments }))
    })
    .await?;
    match out {
        Some(p) => Ok(Json(p).into_response()),
        None => Err(json_error(StatusCode::NOT_FOUND, "show not found")),
    }
}

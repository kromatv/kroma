//! `GET /api/items/:id/ai-suggest` the per-title AI suggestions rail. Cached per
//! item; a miss starts background LLM generation and returns `null`, and the
//! client re-fetches until the cached row appears.

use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use axum::extract::{Path, State};
use axum::response::{IntoResponse, Response};
use axum::Json;

use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::i18n::{self, ReqLocale};
use crate::model::Section;
use crate::state::SharedState;
use axum::routing::get;
use axum::Router;

pub fn routes() -> Router<SharedState> {
    Router::new().route("/items/{id}/ai-suggest", get(ai_suggest))
}

// Seeds currently generating: de-dupes the client's polling while the LLM runs.
fn in_flight() -> &'static Mutex<HashSet<String>> {
    static IN_FLIGHT: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    IN_FLIGHT.get_or_init(|| Mutex::new(HashSet::new()))
}

// Last hard-failure time per seed: without it, every poll after a failure would
// launch a fresh (possibly paid) generation instead of backing off.
fn cooldowns() -> &'static Mutex<HashMap<String, Instant>> {
    static COOLDOWNS: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();
    COOLDOWNS.get_or_init(|| Mutex::new(HashMap::new()))
}

const RETRY_COOLDOWN: Duration = Duration::from_secs(60);

/// `null` means it is still generating and the client should keep polling; a
/// `Section`, even with empty `items`, is terminal.
pub async fn ai_suggest(
    State(state): State<SharedState>,
    AuthUser(_user): AuthUser,
    ReqLocale(locale): ReqLocale,
    Path(id): Path<String>,
) -> Response {
    let lookup_id = id.clone();
    let result = query(&state.db, move |pool| {
        let Some(row) = db::get_suggestion(&pool, &lookup_id)? else {
            return Ok(None);
        };
        let refs: Vec<&str> = row.item_ids.iter().map(String::as_str).collect();
        let items = db::entities_by_ids(&pool, &refs)?;
        Ok(Some((row, items)))
    })
    .await;

    match result {
        Ok(Some((row, items))) => {
            let title = i18n::t(locale, "content.aiSuggestions", &[]);
            let reason = pick_lang(&row.reasons, locale);
            Json(Some(Section { id: "ai:suggest".to_string(), title, reason, items })).into_response()
        }
        Ok(None) => {
            spawn_generation(state.clone(), id);
            Json::<Option<Section>>(None).into_response()
        }
        Err(resp) => resp,
    }
}

fn spawn_generation(state: SharedState, id: String) {
    if cooldowns()
        .lock()
        .unwrap()
        .get(&id)
        .is_some_and(|t| t.elapsed() < RETRY_COOLDOWN)
    {
        return;
    }
    if !in_flight().lock().unwrap().insert(id.clone()) {
        return; // already generating
    }
    tokio::task::spawn_blocking(move || {
        // A panic must not leak the in-flight reservation: the guard above would
        // then block every future attempt for this seed until a restart.
        let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| generate(&state, &id)));
        in_flight().lock().unwrap().remove(&id);
        if outcome.is_err() {
            tracing::error!(item = %id, "AI suggestion generation panicked");
        }
    });
}

fn generate(state: &SharedState, id: &str) {
    let llm = crate::infra::llm::from_settings(&state.settings);
    if !llm.available() {
        return; // no LLM → don't cache, so it retries once one is configured
    }
    // Floor the budget so the tool turns and the final JSON aren't truncated.
    let max_tokens = crate::services::settings::default_provider(&state.settings)
        .map(|p| p.max_tokens)
        .unwrap_or(900)
        .clamp(2048, 8192) as u32;
    match crate::services::llm::suggest_for(state, id, max_tokens) {
        Ok(Some(s)) => {
            cooldowns().lock().unwrap().remove(id);
            let _ = db::set_suggestion(&state.db, id, &s.ids, &s.reasons);
        }
        // Nothing usable → cache empty, which stops the client polling.
        Ok(None) => {
            cooldowns().lock().unwrap().remove(id);
            let _ = db::set_suggestion(&state.db, id, &[], &HashMap::new());
        }
        // Don't cache, so a later view retries, but record the time so polls
        // back off to one attempt per RETRY_COOLDOWN.
        Err(e) => {
            cooldowns().lock().unwrap().insert(id.to_string(), Instant::now());
            tracing::warn!(item = %id, error = %e, "AI suggestion generation failed");
        }
    }
}

fn pick_lang(map: &HashMap<String, String>, locale: &str) -> Option<String> {
    map.get(locale).or_else(|| map.get("en")).or_else(|| map.values().next()).cloned()
}

//! `GET /api/items/:id/ai-suggest` the per-title AI suggestions rail. Cached per
//! item; a miss starts background LLM generation and returns `null`, and the
//! client re-fetches until the cached row appears. A row generated before the
//! reader's language was asked for is a miss too, once.

use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use axum::extract::{Path, State};
use axum::response::{IntoResponse, Response};
use axum::Json;

use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::api::visibility;
use crate::db;
use crate::i18n::{self, ReqLocale};
use crate::model::Section;
use crate::services::llm;
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

// Each generation parks a blocking thread for as long as the LLM takes, and the
// DB layer shares that pool: without a ceiling a client polling many seeds fills
// it and every query behind it waits.
const MAX_CONCURRENT_GENERATIONS: usize = 2;

// A free slot for `id`, or `false` when the same seed is already generating or
// every slot is taken. A caller past the ceiling answers `null` like any other
// poll, so the next poll takes the slot a finished generation freed.
fn reserve(in_flight: &mut HashSet<String>, id: &str) -> bool {
    in_flight.len() < MAX_CONCURRENT_GENERATIONS && in_flight.insert(id.to_string())
}

/// `null` means it is still generating and the client should keep polling; a
/// `Section`, even with empty `items`, is terminal. Without a configured LLM
/// nothing can generate, so a miss is terminal and empty.
pub async fn ai_suggest(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    ReqLocale(locale): ReqLocale,
    Path(id): Path<String>,
) -> Response {
    if !seed_visible(&state, &user, &id).await {
        return section(locale, None, Vec::new());
    }
    let lookup_id = id.clone();
    let result = query(&state.db, move |pool| {
        let Some(row) = db::get_suggestion(&pool, &lookup_id)? else {
            // `suggest_for` resolves its seed the same way, so a seed it would
            // not find is one whose generation can only cache an empty row
            // under whatever id the caller put in the path.
            return Ok(match db::get_title(&pool, &lookup_id)? {
                Some(_) => Cached::Pending,
                None => Cached::UnknownSeed,
            });
        };
        let refs: Vec<&str> = row.item_ids.iter().map(String::as_str).collect();
        let items = db::entities_by_ids(&pool, &refs)?;
        Ok(Cached::Ready(row, items))
    })
    .await;

    let reads = i18n::content_locale(locale);
    match result {
        Ok(Cached::Ready(row, _)) if !llm::covers(&row, reads) && regenerating(&state, &id) => {
            Json::<Option<Section>>(None).into_response()
        }
        Ok(Cached::Ready(row, items)) => {
            let items = items
                .into_iter()
                .filter_map(|entry| visibility::keep_section_item(&user, Some(entry)))
                .collect();
            section(locale, i18n::pick(&row.reasons, locale).cloned(), items)
        }
        Ok(Cached::UnknownSeed) => section(locale, None, Vec::new()),
        Ok(Cached::Pending) if !crate::infra::llm::from_settings(&state.settings).available() => {
            section(locale, None, Vec::new())
        }
        Ok(Cached::Pending) => {
            spawn_generation(state.clone(), id);
            Json::<Option<Section>>(None).into_response()
        }
        Err(resp) => resp,
    }
}

async fn seed_visible(state: &SharedState, user: &crate::model::User, id: &str) -> bool {
    if user.sees_every_library() {
        return true;
    }
    let seed = id.to_string();
    let library = query(&state.db, move |pool| {
        Ok(match db::item_library(&pool, &seed)? {
            Some(library) => Some(library),
            None => db::show_library(&pool, &seed)?,
        })
    })
    .await;
    matches!(library, Ok(Some(library)) if user.sees_library(&library))
}

enum Cached {
    Ready(db::SuggestionRow, Vec<crate::model::SectionItem>),
    Pending,
    UnknownSeed,
}

fn section(
    locale: &str,
    reason: Option<String>,
    items: Vec<crate::model::SectionItem>,
) -> Response {
    let title = i18n::t(locale, "content.aiSuggestions", &[]);
    Json(Some(Section::rail("ai:suggest", title, reason, items)))
    .into_response()
}

// A cached row that was never asked for the reader's language is regenerated,
// unless that cannot be tried now: no model, or one that just failed. It is
// then served as it is, in the fallback text, rather than held back.
fn regenerating(state: &SharedState, id: &str) -> bool {
    if cooling_down(id) || !crate::infra::llm::from_settings(&state.settings).available() {
        return false;
    }
    spawn_generation(state.clone(), id.to_string());
    true
}

fn cooling_down(id: &str) -> bool {
    cooldowns()
        .lock()
        .unwrap()
        .get(id)
        .is_some_and(|t| t.elapsed() < RETRY_COOLDOWN)
}

fn spawn_generation(state: SharedState, id: String) {
    if cooling_down(&id) {
        return;
    }
    if !reserve(&mut in_flight().lock().unwrap(), &id) {
        return;
    }
    tokio::task::spawn_blocking(move || {
        // A panic must not leak the in-flight reservation: the guard above would
        // then block every future attempt for this seed until a restart.
        let outcome =
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| generate(&state, &id)));
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
    match llm::regenerate(state, id, max_tokens, i18n::content_locales()) {
        Ok(()) => {
            cooldowns().lock().unwrap().remove(id);
        }
        // Nothing was cached, so a later view retries, but record the time so
        // polls back off to one attempt per RETRY_COOLDOWN.
        Err(e) => {
            cooldowns()
                .lock()
                .unwrap()
                .insert(id.to_string(), Instant::now());
            tracing::warn!(item = %id, error = %e, "AI suggestion generation failed");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reasons(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
            .collect()
    }

    #[test]
    fn a_reason_falls_back_to_english_then_to_whatever_was_generated() {
        let read = |pairs: &[(&str, &str)]| i18n::pick(&reasons(pairs), "fr").cloned();

        assert_eq!(read(&[("fr", "parce que")]).as_deref(), Some("parce que"));
        assert_eq!(
            read(&[("en", "because"), ("de", "weil")]).as_deref(),
            Some("because")
        );
        assert_eq!(read(&[("de", "weil")]).as_deref(), Some("weil"));
        assert_eq!(read(&[]), None);
    }

    #[test]
    fn a_seed_already_generating_is_not_started_a_second_time() {
        let mut in_flight = HashSet::new();

        assert!(reserve(&mut in_flight, "the-matrix"));
        assert!(!reserve(&mut in_flight, "the-matrix"));
    }

    #[test]
    fn a_seed_past_the_concurrency_ceiling_waits_for_a_slot_to_free() {
        let mut in_flight: HashSet<String> = (0..MAX_CONCURRENT_GENERATIONS)
            .map(|n| format!("seed{n}"))
            .collect();

        assert!(!reserve(&mut in_flight, "one-too-many"));

        in_flight.remove("seed0");
        assert!(reserve(&mut in_flight, "one-too-many"));
    }
}

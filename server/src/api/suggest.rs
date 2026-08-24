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

    match result {
        Ok(Cached::Ready(row, items)) => section(locale, pick_lang(&row.reasons, locale), items),
        Ok(Cached::UnknownSeed) => section(locale, None, Vec::new()),
        Ok(Cached::Pending) => {
            spawn_generation(state.clone(), id);
            Json::<Option<Section>>(None).into_response()
        }
        Err(resp) => resp,
    }
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
    Json(Some(Section {
        id: "ai:suggest".to_string(),
        title,
        reason,
        items,
    }))
    .into_response()
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
            cooldowns()
                .lock()
                .unwrap()
                .insert(id.to_string(), Instant::now());
            tracing::warn!(item = %id, error = %e, "AI suggestion generation failed");
        }
    }
}

fn pick_lang(map: &HashMap<String, String>, locale: &str) -> Option<String> {
    map.get(locale)
        .or_else(|| map.get("en"))
        .or_else(|| map.values().next())
        .cloned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::test_support::{demo_item_id, get, test_app};
    use axum::http::StatusCode;

    fn reasons(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
            .collect()
    }

    #[test]
    fn a_reason_falls_back_to_english_then_to_whatever_was_generated() {
        assert_eq!(
            pick_lang(&reasons(&[("fr", "parce que")]), "fr").as_deref(),
            Some("parce que")
        );
        assert_eq!(
            pick_lang(&reasons(&[("en", "because"), ("de", "weil")]), "fr").as_deref(),
            Some("because")
        );
        assert_eq!(
            pick_lang(&reasons(&[("de", "weil")]), "fr").as_deref(),
            Some("weil")
        );
        assert_eq!(pick_lang(&reasons(&[]), "fr"), None);
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

    #[tokio::test]
    async fn a_seed_the_catalogue_does_not_hold_is_terminal_and_caches_nothing() {
        let t = test_app();

        let (status, body) =
            get(&t.app, "/api/items/no-such-item/ai-suggest", Some(&t.token)).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["id"], "ai:suggest");
        assert_eq!(body["items"].as_array().map(Vec::len), Some(0));
        assert!(db::get_suggestion(&t.state.db, "no-such-item")
            .unwrap()
            .is_none());
    }

    #[tokio::test]
    async fn a_seed_with_nothing_cached_yet_answers_null_so_the_client_keeps_polling() {
        let t = test_app();
        let id = demo_item_id("The Matrix");

        let (status, body) = get(
            &t.app,
            &format!("/api/items/{id}/ai-suggest"),
            Some(&t.token),
        )
        .await;

        assert_eq!(status, StatusCode::OK);
        assert!(body.is_null(), "{body}");
    }
}

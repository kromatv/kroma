//! `sections.personalize` the LLM-powered personalization pass: for every user
//! with enough watch history, cluster their taste, ask the configured LLM to name
//! a few sections + refine their taste profile, and cache the result. Served on
//! the home screen by [`crate::services::sections::build_home`]. Heavy + nightly.

use super::prelude::*;

/// Nightly: name per-account taste clusters into personalized rows.
pub(super) const SPEC: Builtin = Builtin {
    key: JobKey("sections.personalize"),
    category: Category::Recommendations,
    schedule: Some("30 5 * * *"),
    triggers: &[],
    run,
};

/// How many taste clusters (→ ~that many named sections) per user.
const PERSONALIZE_CLUSTERS: usize = 4;

pub(super) fn run(ctx: &JobContext) -> Result<()> {
    use crate::infra::events::ServerEvent;
    use crate::services::sections::{generate, taste};

    let state = &ctx.state;
    let llm = crate::infra::llm::from_settings(&state.settings);
    if !llm.available() {
        ctx.warn("no LLM configured enable one under Admin → Général → IA; skipping");
        return Ok(());
    }
    ctx.info(format!("personalizing with {}", llm.describe()));
    // Output cap from the default provider (per-provider since multi-provider).
    let max_tokens = crate::services::settings::default_provider(&state.settings)
        .map(|p| p.max_tokens)
        .unwrap_or(900)
        .clamp(64, 8192) as u32;
    state.vectors.refresh_if_stale(&state.db)?;

    let users = crate::db::all_users_with_lang(&state.db)?;
    let total = users.len();
    let mut generated = 0usize;
    for (i, (uid, lang)) in users.iter().enumerate() {
        if ctx.cancelled() {
            ctx.warn("cancellation requested stopping");
            break;
        }
        ctx.progress(i + 1, total);

        let watched = crate::db::recent_watched_ids(&state.db, uid).unwrap_or_default();
        let clusters = taste::cluster(&state.db, &state.vectors, &watched, PERSONALIZE_CLUSTERS);
        if clusters.is_empty() {
            let embedded = state.vectors.vectors_for(&watched).len();
            ctx.debug(format!(
                "{}: {} watched / {} with embeddings (< {} required) skipping",
                short_id(uid), watched.len(), embedded, taste::MIN_WATCHED
            ));
            continue;
        }
        let locale = lang.as_deref().and_then(crate::i18n::normalize).unwrap_or(crate::i18n::DEFAULT_LOCALE);
        let prev = crate::db::get_user_taste(&state.db, uid).ok().flatten().and_then(|(p, _)| p);
        let (system, user) = generate::build_prompt(locale, prev.as_deref(), &clusters);
        ctx.debug(format!(
            "{}: {} taste clusters → {} ({} prompt chars)",
            short_id(uid), clusters.len(), llm.describe(), system.len() + user.len()
        ));

        match llm.complete(&system, &user, max_tokens) {
            Ok(reply) => match generate::parse_response(&reply) {
                Ok((profile, sections)) if !sections.is_empty() => {
                    let json = serde_json::to_string(&sections).unwrap_or_else(|_| "[]".into());
                    crate::db::set_user_taste(&state.db, uid, Some(&profile), &json)?;
                    generated += 1;
                    ctx.info(format!("{}: {} sections", short_id(uid), sections.len()));
                }
                Ok(_) => ctx.error(format!(
                    "{}: model returned no usable sections reply: {}", short_id(uid), snippet(&reply)
                )),
                Err(e) => ctx.error(format!(
                    "{}: could not parse model reply: {e} reply: {}", short_id(uid), snippet(&reply)
                )),
            },
            Err(e) => ctx.error(format!("{}: LLM request failed: {e:#}", short_id(uid))),
        }
    }

    ctx.info(format!("personalized {generated}/{total} users"));
    // Tell live clients to refetch the home screen with their new rows.
    state.events.publish(ServerEvent::LibraryUpdated);
    Ok(())
}

/// First 8 chars of an id, for compact log lines.
fn short_id(id: &str) -> &str {
    &id[..id.len().min(8)]
}

#[cfg(test)]
mod tests {
    use super::{run, short_id};
    use crate::services::jobs::JobContext;
    use crate::state::SharedState;
    use crate::test_support::{seed_movie, seed_play, test_state, FakeLlm};

    /// Enough watched, embedded titles for `taste::cluster` to produce groups.
    fn seed_history(state: &SharedState, user: &str) {
        for n in 0..8 {
            let id = format!("itm-{n}");
            seed_movie(state, &id);
            // Two loose blobs so the clustering has something to separate.
            let v = if n < 4 { [1.0f32, 0.0] } else { [0.0f32, 1.0] };
            crate::db::set_item_vector(&state.db, &id, &v).unwrap();
            seed_play(state, user, &id, crate::test_support::now_secs() - n);
        }
    }

    fn user_of(state: &SharedState) -> String {
        kroma_db::create_user(&state.db, "ana@t.dev", "Ana", "h", &[]).unwrap().id
    }

    const GOOD_REPLY: &str = r#"{
        "profile": "Likes slow thrillers and 90s comedies.",
        "sections": [
            {"title": "Slow Burn Thrillers", "query": "tense patient thriller"},
            {"title": "90s Comfort Comedies", "query": "warm nineties comedy"}
        ]
    }"#;

    #[test]
    fn without_an_llm_the_pass_is_skipped_rather_than_failed() {
        // Most self-hosted installs never configure one; a nightly job that
        // errors would show up red forever.
        let state = test_state();
        let user = user_of(&state);
        seed_history(&state, &user);
        run(&JobContext::for_test(state.clone())).unwrap();
        assert!(crate::db::get_user_taste(&state.db, &user).unwrap().is_none());
    }

    #[test]
    fn a_named_taste_profile_is_cached_for_the_home_screen() {
        let state = test_state();
        let user = user_of(&state);
        seed_history(&state, &user);
        let llm = FakeLlm::always(GOOD_REPLY);
        llm.configure(&state);

        run(&JobContext::for_test(state.clone())).unwrap();

        let (profile, sections) = crate::db::get_user_taste(&state.db, &user).unwrap().unwrap();
        assert_eq!(profile.as_deref(), Some("Likes slow thrillers and 90s comedies."));
        assert!(sections.contains("Slow Burn Thrillers"), "{sections}");
        assert!(sections.contains("90s Comfort Comedies"), "{sections}");
        // One request per user with enough history - not one per cluster.
        assert_eq!(llm.requests().len(), 1);
    }

    #[test]
    fn a_user_with_no_history_is_skipped_without_asking_the_model() {
        // Asking would spend a request to name clusters that do not exist.
        let state = test_state();
        let user = user_of(&state);
        let llm = FakeLlm::always(GOOD_REPLY);
        llm.configure(&state);

        run(&JobContext::for_test(state.clone())).unwrap();
        assert!(crate::db::get_user_taste(&state.db, &user).unwrap().is_none());
        assert!(llm.requests().is_empty(), "the model was asked about an empty history");
    }

    #[test]
    fn a_reply_the_model_mangled_leaves_the_previous_profile_alone() {
        // Overwriting a good profile with nothing would empty someone's home
        // screen because of one bad night from the provider.
        let state = test_state();
        let user = user_of(&state);
        seed_history(&state, &user);
        crate::db::set_user_taste(&state.db, &user, Some("Previously known"), "[]").unwrap();

        for bad in [
            FakeLlm::always("I'd rather not."),                       // not JSON
            FakeLlm::always(r#"{"profile":"x","sections":[]}"#),      // no usable sections
            FakeLlm::failing(500),                                    // provider down
        ] {
            bad.configure(&state);
            run(&JobContext::for_test(state.clone())).unwrap();
            let (profile, _) = crate::db::get_user_taste(&state.db, &user).unwrap().unwrap();
            assert_eq!(profile.as_deref(), Some("Previously known"));
        }
    }

    #[test]
    fn the_previous_profile_is_offered_back_to_the_model() {
        // The profile is meant to be refined over time, not re-derived nightly
        // from scratch.
        let state = test_state();
        let user = user_of(&state);
        seed_history(&state, &user);
        crate::db::set_user_taste(&state.db, &user, Some("Fond of heist films"), "[]").unwrap();
        let llm = FakeLlm::always(GOOD_REPLY);
        llm.configure(&state);

        run(&JobContext::for_test(state.clone())).unwrap();
        let prompt = llm.requests()[0].to_string();
        assert!(prompt.contains("Fond of heist films"), "the prior profile was not sent");
    }

    #[test]
    fn a_cancelled_pass_stops_without_touching_the_rest() {
        let state = test_state();
        let user = user_of(&state);
        seed_history(&state, &user);
        let llm = FakeLlm::always(GOOD_REPLY);
        llm.configure(&state);

        let handle = std::sync::Arc::new(crate::services::jobs::RunHandle::new(
            "test-run".into(),
            "sections.personalize".into(),
        ));
        handle.request_cancel();
        run(&JobContext::from_handle(state.clone(), handle)).unwrap();
        assert!(crate::db::get_user_taste(&state.db, &user).unwrap().is_none());
        assert!(llm.requests().is_empty());
    }

    #[test]
    fn short_id_truncates_to_eight_bytes() {
        // It slices by bytes, so a short id must not panic the log line.
        assert_eq!(short_id("0123456789abcdef"), "01234567");
        assert_eq!(short_id("abc"), "abc");
        assert_eq!(short_id("01234567"), "01234567");
        assert_eq!(short_id(""), "");
    }
}

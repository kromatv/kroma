use super::super::engine::engine_for;
use super::super::episodes::{enrich_episodes, still_gone};
use super::support::*;
use crate::db;

#[test]
fn enrich_episodes_stores_text_in_every_language_and_the_guide() {
    let _tmdb = tmdb();
    let state = state_with_show();

    let eng = engine_for(&state, "key".into());
    let langs: Vec<&str> = crate::i18n::SUPPORTED_LOCALES.to_vec();
    enrich_episodes(
        &eng.pool,
        &eng.api_key,
        &eng.language,
        &langs,
        &eng.data_dir,
        &eng.bus,
        SHOW_ID,
        SHOW_TMDB,
    );

    let stale = db::translations::any_stale(&state.db, "episode", &[EPISODE_ID], &langs).unwrap();
    assert!(!stale);
    assert!(!db::episode_guide_stale(&state.db, SHOW_ID, 1).unwrap());
    assert_eq!(db::season_casts(&state.db, SHOW_ID).unwrap()[&1].len(), 1);
}

#[test]
fn enrich_episodes_on_an_unknown_show_does_nothing() {
    let tmdb = tmdb();
    let state = state();
    let eng = engine_for(&state, "key".into());

    enrich_episodes(
        &eng.pool,
        "key",
        "en-US",
        &["en"],
        &eng.data_dir,
        &eng.bus,
        "ghost",
        1,
    );

    assert!(tmdb.requests().is_empty());
}

#[test]
fn enrich_episodes_skips_a_season_tmdb_has_nothing_for() {
    let _tmdb = tmdb_with_nothing_found();
    let state = state_with_show();
    let eng = engine_for(&state, "key".into());

    enrich_episodes(
        &eng.pool,
        "key",
        "en-US",
        &["en"],
        &eng.data_dir,
        &eng.bus,
        SHOW_ID,
        SHOW_TMDB,
    );

    assert!(db::episode_guide_stale(&state.db, SHOW_ID, 1).unwrap());
}

#[test]
fn an_episode_without_a_still_counts_as_gone() {
    let state = state_with_show();
    let detail = db::get_show(&state.db, SHOW_ID).unwrap().unwrap();
    let episode = &detail.seasons[0].episodes[0];

    assert!(still_gone(&state.config.data_dir, episode));
}

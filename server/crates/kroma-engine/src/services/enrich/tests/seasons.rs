use std::collections::HashMap;

use super::super::engine::engine_for;
use super::super::episodes::enrich_episodes;
use super::super::seasons::Known;
use super::support::*;
use crate::db;
use crate::db::art_beside::SEASON;
use crate::infra::metadata::SeasonData;
use crate::model::Metadata;
use crate::state::SharedState;

fn known<'a>(state: &'a SharedState, langs: &'a [&'a str]) -> Known<'a> {
    Known {
        pool: &state.db,
        data_dir: &state.config.data_dir,
        show_id: SHOW_ID,
        langs,
        casts: db::season_casts(&state.db, SHOW_ID).unwrap(),
        gaps: db::season_gaps(&state.db, SHOW_ID).unwrap(),
    }
}

fn enriched_with_a_still(state: &SharedState) {
    let still = Metadata {
        backdrop_url: Some("https://img.example/still.jpg".into()),
        ..Metadata::blank()
    };
    db::set_item_metadata(&state.db, EPISODE_ID, &still).unwrap();
    let eng = engine_for(state, "key".into());
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
}

#[test]
fn a_season_whose_stills_cast_guide_and_text_are_kept_is_not_fetched_again() {
    let _tmdb = tmdb();
    let state = state_with_show();
    enriched_with_a_still(&state);
    let detail = db::get_show(&state.db, SHOW_ID).unwrap().unwrap();

    let needs = known(&state, &["en"]).needs(&detail.seasons[0]);

    assert!(needs.missing.is_empty());
    assert!(!needs.cast);
    assert!(!needs.any);
}

#[test]
fn a_language_added_since_has_a_kept_season_fetched_again() {
    let _tmdb = tmdb();
    let state = state_with_show();
    enriched_with_a_still(&state);
    let detail = db::get_show(&state.db, SHOW_ID).unwrap().unwrap();

    let needs = known(&state, &["en", "fr"]).needs(&detail.seasons[0]);

    assert!(needs.missing.is_empty());
    assert!(needs.any);
}

#[test]
fn a_season_s_poster_is_kept_in_each_language_tmdb_answered() {
    let state = state_with_show();
    let poster = SeasonData {
        poster_url: Some("/api/images/fr.webp".into()),
        ..SeasonData::default()
    };
    let per_lang = HashMap::from([("fr".into(), poster), ("en".into(), SeasonData::default())]);

    known(&state, &["en", "fr"]).store_posters(1, &per_lang);

    let fr = db::translations::resolve_one(&state.db, SEASON, "s1:1", "fr").unwrap();
    let stale = db::translations::any_stale(&state.db, SEASON, &["s1:1"], &["en", "fr"]).unwrap();
    assert_eq!(
        fr.unwrap().poster_url.as_deref(),
        Some("/api/images/fr.webp")
    );
    assert!(!stale);
}

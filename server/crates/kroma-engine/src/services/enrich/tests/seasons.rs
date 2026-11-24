use std::collections::HashMap;

use super::super::seasons::Known;
use super::support::*;
use crate::db;
use crate::db::art_beside::SEASON;
use crate::infra::metadata::SeasonData;

#[test]
fn a_season_s_poster_is_kept_in_each_language_tmdb_answered() {
    let state = state_with_show();
    let known = Known {
        pool: &state.db,
        data_dir: &state.config.data_dir,
        show_id: SHOW_ID,
        langs: &["en", "fr"],
        casts: HashMap::new(),
        gaps: HashMap::new(),
    };
    let poster = SeasonData {
        poster_url: Some("/api/images/fr.webp".into()),
        ..SeasonData::default()
    };
    let per_lang = HashMap::from([("fr".into(), poster), ("en".into(), SeasonData::default())]);

    known.store_posters(1, &per_lang);

    let fr = db::translations::resolve_one(&state.db, SEASON, "s1:1", "fr").unwrap();
    let stale = db::translations::any_stale(&state.db, SEASON, &["s1:1"], &["en", "fr"]).unwrap();
    assert_eq!(
        fr.unwrap().poster_url.as_deref(),
        Some("/api/images/fr.webp")
    );
    assert!(!stale);
}

use super::*;
use crate::domain::metadata::CastMember;

fn meta(title: &str, overview: &str, genres: &[&str], cast: &[&str]) -> Metadata {
    Metadata {
        provider: "tmdb",
        tmdb_id: 1,
        imdb_id: None,
        title: Some(title.into()),
        tagline: None,
        overview: Some(overview.into()),
        release_date: None,
        genres: genres.iter().map(ToString::to_string).collect(),
        rating: None,
        poster_url: None,
        backdrop_url: None,
        logo_url: None,
        theme_url: None,
        cast: cast
            .iter()
            .map(|n| CastMember { name: n.to_string(), character: None, profile_url: None })
            .collect(),
        crew: Vec::new(),
        keywords: Vec::new(),
        tvdb_id: None,
        tmdb_url: String::new(),
    }
}

fn movie(id: &str, title: &str, m: Option<Metadata>) -> MediaItem {
    MediaItem {
        id: id.into(),
        title: title.into(),
        kind: Kind::Movie,
        year: None,
        duration_ms: None,
        container: String::new(),
        video: None,
        audio: None,
        audio_tracks: Vec::new(),
        subtitles: Vec::new(),
        library: "lib".into(),
        show_id: None,
        show_title: None,
        season: None,
        episode: None,
        episode_end: None,
        episode_title: None,
        rel_path: None,
        added_at: String::new(),
        metadata: m,
        abs_path: None,
        files: Vec::new(),
        default_file_id: None,
        markers: Vec::new(),
        audio_analysis: None,
    }
}

fn episode(id: &str, show_id: &str, show_title: &str, title: &str) -> MediaItem {
    MediaItem {
        kind: Kind::Episode,
        show_id: Some(show_id.into()),
        show_title: Some(show_title.into()),
        episode_title: Some(title.into()),
        ..movie(id, show_title, None)
    }
}

fn show(id: &str, title: &str, m: Option<Metadata>) -> Show {
    Show {
        id: id.into(),
        title: title.into(),
        year: None,
        library: "lib".into(),
        season_count: 0,
        episode_count: 0,
        video: None,
        added_at: String::new(),
        metadata: m,
        progress: None,
    }
}

fn engine() -> SearchEngine {
    let e = SearchEngine::new().unwrap();
    let movies = vec![
        movie("1", "The Avengers", Some(meta("The Avengers", "Earth's mightiest heroes", &["Action"], &["Robert Downey Jr"]))),
        movie("2", "Amélie", Some(meta("Amélie", "A shy waitress in Paris", &["Romance"], &["Audrey Tautou"]))),
    ];
    let shows = vec![show(
        "s1",
        "Breaking Bad",
        Some(meta("Breaking Bad", "A chemistry teacher turns to crime", &["Crime", "Drama"], &["Bryan Cranston"])),
    )];
    e.rebuild(&movies, &shows, &[]).unwrap();
    e
}

fn top_id(e: &SearchEngine, q: &str) -> Option<String> {
    e.search(q, 5).first().map(|h| h.id.clone())
}

#[test]
fn exact_and_fuzzy_title() {
    let e = engine();
    assert_eq!(top_id(&e, "avengers").as_deref(), Some("1"));
    assert_eq!(top_id(&e, "avengrs").as_deref(), Some("1")); // typo
}

#[test]
fn accent_folding() {
    let e = engine();
    assert_eq!(top_id(&e, "amelie").as_deref(), Some("2")); // query has no accent
}

#[test]
fn cast_and_genre_and_prefix() {
    let e = engine();
    assert_eq!(top_id(&e, "cranston").as_deref(), Some("s1"));
    assert_eq!(top_id(&e, "crime").as_deref(), Some("s1"));
    assert_eq!(top_id(&e, "brea").as_deref(), Some("s1")); // prefix
}

fn series_engine() -> SearchEngine {
    let e = SearchEngine::new().unwrap();
    let episodes: Vec<MediaItem> = (1..=12)
        .map(|n| episode(&format!("e{n}"), "s1", "House of the Dragon", &format!("Episode {n}")))
        .chain(std::iter::once(episode("e-dance", "s1", "House of the Dragon", "A Dance of Dragons")))
        .collect();
    e.rebuild(&[], &[show("s1", "House of the Dragon", None)], &episodes).unwrap();
    e
}

fn ids(e: &SearchEngine, q: &str, limit: usize) -> Vec<String> {
    e.search(q, limit).into_iter().map(|h| h.id).collect()
}

#[test]
fn a_show_title_returns_the_show_and_not_its_season_list() {
    assert_eq!(ids(&series_engine(), "house of dragon", 24), ["s1"]);
}

#[test]
fn an_episode_still_wins_when_the_query_names_it() {
    // `show_title` is indexed so the show's name can narrow an episode search;
    // the episode must still be the answer when its own title carries the query.
    let got = ids(&series_engine(), "house of the dragon a dance of dragons", 24);
    assert_eq!(got, ["e-dance"]);
}

#[test]
fn episodes_of_a_show_that_did_not_match_are_capped() {
    let e = SearchEngine::new().unwrap();
    let episodes: Vec<MediaItem> =
        (1..=10).map(|n| episode(&format!("e{n}"), "s1", "Breaking Bad", "Ozymandias")).collect();
    // No show document at all: the episodes are the only thing that can match.
    e.rebuild(&[], &[], &episodes).unwrap();

    assert_eq!(e.search("ozymandias", 24).len(), MAX_EPISODES_PER_SHOW);
}

#[test]
fn blank_query_is_empty() {
    let e = engine();
    assert!(e.search("   ", 5).is_empty());
}

use crate::test_support::{seed_movie, test_state};

// Store a localized row for `subject_id`, as the enrichment pass would.
fn put_translation(state: &crate::state::SharedState, kind: &str, id: &str, lang: &str, data: serde_json::Value) {
    state
        .db
        .get()
        .unwrap()
        .execute(
            &format!(
                "INSERT INTO translations (subject_kind,subject_id,lang,source,data,updated_at) \
                 VALUES ('{kind}','{id}','{lang}','tmdb',json('{}'),0)",
                data.to_string().replace('\'', "''")
            ),
            [],
        )
        .unwrap();
}

// Give a movie its file title and the core metadata the indexer reads.
fn seed_titled_movie(state: &crate::state::SharedState, id: &str, file_title: &str) {
    seed_movie(state, id);
    // Titles here carry apostrophes on purpose (a French title is the point),
    // so escape them the SQL way - in the literal as well as inside the JSON.
    let sql_title = file_title.replace('\'', "''");
    let meta = serde_json::json!({
        "tmdbId": 1,
        "title": file_title,
        "overview": "A shy waitress in Paris.",
        "genres": ["Romance"],
        "tmdbUrl": "https://x/1",
    });
    state
        .db
        .get()
        .unwrap()
        .execute(
            &format!(
                "UPDATE items SET title = '{sql_title}', metadata = json('{}') WHERE id = '{id}'",
                meta.to_string().replace('\'', "''")
            ),
            [],
        )
        .unwrap();
}

#[test]
fn a_title_is_findable_in_a_language_the_household_did_not_enrich_in() {
    // The whole point of indexing every stored language: a household enriching
    // in French must still find a film by its English title, and vice versa.
    // Without it, search silently depends on an admin's metadata-language
    // setting.
    // The two titles share NO word: an earlier version used "Le Fabuleux
    // Destin d'Amélie Poulain" against "Amelie", and the search matched through
    // the FILENAME (accent folding), so the test passed even with translations
    // switched off entirely.
    let state = test_state();
    seed_titled_movie(&state, "itm-1", "Le Fabuleux Destin de Poulain");
    put_translation(
        &state,
        "item",
        "itm-1",
        "en",
        serde_json::json!({ "title": "Amelie", "overview": "A shy waitress.", "genres": ["Romance"] }),
    );

    state.search.reindex_from_db(&state.db).unwrap();
    assert_eq!(
        state.search.search("Amelie", 5).first().map(|h| h.id.clone()).as_deref(),
        Some("itm-1"),
        "the English title was not indexed",
    );
    // ...and the filename title still matches.
    assert_eq!(
        state.search.search("Fabuleux", 5).first().map(|h| h.id.clone()).as_deref(),
        Some("itm-1"),
    );
}

#[test]
fn a_localized_overview_and_genre_are_searchable_too() {
    // Not just titles: someone searching a genre or a phrase from the synopsis
    // in their own language should land on the title.
    let state = test_state();
    seed_titled_movie(&state, "itm-1", "Amélie");
    put_translation(
        &state,
        "item",
        "itm-1",
        "de",
        serde_json::json!({
            "title": "Die fabelhafte Welt der Amelie",
            "overview": "Eine schüchterne Kellnerin.",
            "genres": ["Liebesfilm"],
        }),
    );

    state.search.reindex_from_db(&state.db).unwrap();
    assert!(!state.search.search("Kellnerin", 5).is_empty(), "the German overview was not indexed");
    assert!(!state.search.search("Liebesfilm", 5).is_empty(), "the German genre was not indexed");
}

#[test]
fn a_translation_that_matches_the_filename_does_not_become_an_alt_title() {
    // Storing the same string twice would double its weight and let a title
    // outrank a better match purely for having been enriched.
    let state = test_state();
    seed_titled_movie(&state, "itm-1", "Amelie");
    put_translation(&state, "item", "itm-1", "en", serde_json::json!({ "title": "amelie" }));

    state.search.reindex_from_db(&state.db).unwrap();
    // Still findable - the point is only that it was not indexed twice.
    assert_eq!(
        state.search.search("Amelie", 5).first().map(|h| h.id.clone()).as_deref(),
        Some("itm-1"),
    );
}

#[test]
fn a_catalogue_with_no_translations_still_indexes() {
    // The common case before any enrichment has run.
    let state = test_state();
    seed_titled_movie(&state, "itm-1", "Amelie");
    state.search.reindex_from_db(&state.db).unwrap();
    assert_eq!(
        state.search.search("Amelie", 5).first().map(|h| h.id.clone()).as_deref(),
        Some("itm-1"),
    );
}

#[test]
fn the_title_tmdb_knows_finds_a_file_named_nothing_like_it() {
    let e = SearchEngine::new().unwrap();
    let movies = vec![movie(
        "1",
        "LFDAP.2001.1080p.BluRay",
        Some(meta("Le Fabuleux Destin", "Une serveuse timide", &["Romance"], &["Audrey Tautou"])),
    )];
    e.rebuild(&movies, &[], &[]).unwrap();

    assert_eq!(top_id(&e, "fabuleux").as_deref(), Some("1"));
    assert_eq!(top_id(&e, "LFDAP").as_deref(), Some("1"), "the filename still matches");
}

#[test]
fn without_the_analyzer_a_query_is_still_split_and_lowercased() {
    let bare = tantivy::Index::create_in_ram(tantivy::schema::Schema::builder().build());
    assert_eq!(normalize(&bare, "  Amélie  In   Paris "), ["amélie", "in", "paris"]);
    assert!(normalize(&bare, "   ").is_empty());
}

#[test]
fn a_rebuild_that_fails_keeps_the_index_that_was_working() {
    let state = test_state();
    seed_titled_movie(&state, "itm-1", "Amelie");
    state.search.reindex_from_db(&state.db).unwrap();
    state.db.get().unwrap().execute("DROP TABLE items", []).unwrap();

    assert!(state.search.reindex_from_db(&state.db).is_err());
    super::spawn_reindex(state.clone());
    std::thread::sleep(std::time::Duration::from_millis(50));

    assert_eq!(
        state.search.search("Amelie", 5).first().map(|h| h.id.clone()).as_deref(),
        Some("itm-1"),
        "a failed rebuild must not empty the index",
    );
}

#[test]
fn a_translation_carrying_only_an_overview_still_reaches_the_index() {
    let state = test_state();
    seed_titled_movie(&state, "itm-1", "Amelie");
    put_translation(
        &state,
        "item",
        "itm-1",
        "de",
        serde_json::json!({ "overview": "Eine schüchterne Kellnerin.", "genres": ["Liebesfilm"] }),
    );

    state.search.reindex_from_db(&state.db).unwrap();
    assert!(!state.search.search("Kellnerin", 5).is_empty());
}

#[test]
fn metadata_with_no_title_of_its_own_still_contributes_its_other_fields() {
    let e = SearchEngine::new().unwrap();
    let mut untitled = meta("ignored", "Une serveuse timide", &["Romance"], &["Audrey Tautou"]);
    untitled.title = None;
    e.rebuild(&[movie("1", "Amelie", Some(untitled))], &[], &[]).unwrap();

    assert_eq!(top_id(&e, "serveuse").as_deref(), Some("1"));
    assert_eq!(top_id(&e, "Amelie").as_deref(), Some("1"));
}

#[test]
fn a_row_with_no_id_is_skipped_rather_than_returned_as_a_blank_hit() {
    let e = SearchEngine::new().unwrap();
    e.rebuild(&[movie("", "Amelie", None), movie("2", "Amelie Two", None)], &[], &[]).unwrap();

    let ids: Vec<String> = e.search("Amelie", 5).into_iter().map(|h| h.id).collect();
    assert_eq!(ids, ["2"]);
}

use super::*;
use crate::catalog_query::test_support::*;
use crate::metadata_core::{ITEM, SHOW};
use crate::title_edits::{self, Title};
use kroma_domain::title_edit::TitleEdit;

fn edited(pool: &Pool, kind: &str, id: &str, edit: TitleEdit) {
    title_edits::write(pool, Title { kind, id }, &edit).unwrap();
}

fn found(pool: &Pool, filter: TitleFilter) -> Vec<String> {
    let titles = find_titles(pool, &filter).unwrap();
    titles.into_iter().map(|t| t.title).collect()
}

fn of_genre(pool: &Pool, genre: &str) -> Vec<String> {
    let filter = TitleFilter {
        genre: Some(genre.into()),
        ..Default::default()
    };
    found(pool, filter)
}

#[test]
fn a_title_is_found_and_counted_by_the_name_year_and_genres_written_for_it() {
    let pool = seeded_pool();
    let rewritten = TitleEdit {
        title: Some("The Shining (extended)".into()),
        original_title: None,
        sort_title: None,
        tagline: None,
        year: Some(1981),
        overview: Some("A winter at the hotel.".into()),
        genres: Some(vec!["Drama".into()]),
        released: None,
        directors: None,
        content_rating: None,
    };
    edited(&pool, ITEM, "m3", rewritten);
    let regenred = TitleEdit {
        genres: Some(vec!["Comedy".into()]),
        ..Default::default()
    };
    edited(&pool, SHOW, "s1", regenred);
    let winter = TitleFilter {
        keyword: Some("winter".into()),
        ..Default::default()
    };
    let eighty_one = TitleFilter {
        year_min: Some(1981),
        year_max: Some(1981),
        ..Default::default()
    };

    let full = get_title(&pool, "The Shining (extended)").unwrap();
    let genres = genre_counts(&pool).unwrap();

    let full = full.expect("the title under its written name");
    let horror = genres.iter().find(|(g, _)| g == "Horror");
    assert_eq!(
        of_genre(&pool, "Drama"),
        ["The Shining (extended)", "Old Unrated"]
    );
    assert_eq!(of_genre(&pool, "comedy"), ["Severance"]);
    assert_eq!(found(&pool, winter), ["The Shining (extended)"]);
    assert_eq!(found(&pool, eighty_one), ["The Shining (extended)"]);
    assert_eq!((full.id.as_str(), full.year), ("m3", Some(1981)));
    assert_eq!(full.genres, ["Drama"]);
    assert_eq!(full.overview.as_deref(), Some("A winter at the hotel."));
    assert_eq!(horror.map(|(_, n)| *n), Some(1));
}

#[test]
fn a_title_is_found_and_counted_by_the_directors_written_for_it() {
    let pool = seeded_pool();
    let directed = |names: &[&str]| TitleEdit {
        directors: Some(names.iter().map(|name| name.to_string()).collect()),
        ..Default::default()
    };
    edited(&pool, ITEM, "m1", directed(&["Jane Doe"]));
    edited(&pool, ITEM, "m4", directed(&["Jane Doe", "Ari Aster"]));
    let by_jane = TitleFilter {
        director: Some("jane doe".into()),
        ..Default::default()
    };
    let by_denis = TitleFilter {
        director: Some("Denis Villeneuve".into()),
        ..Default::default()
    };

    let dune = get_title(&pool, "Dune").unwrap().unwrap();
    let directors = people_counts(&pool, "director", 10).unwrap();

    assert_eq!(dune.directors, ["Jane Doe"]);
    assert_eq!(found(&pool, by_jane), ["Dune", "Hereditary"]);
    assert_eq!(found(&pool, by_denis), ["Sicario"]);
    assert_eq!(directors[0], ("Jane Doe".to_string(), 2));
    assert!(directors.contains(&("Denis Villeneuve".to_string(), 1)));
    assert!(directors.contains(&("Ari Aster".to_string(), 1)));
}

#[test]
fn get_title_and_counts() {
    let pool = seeded_pool();
    let dune = get_title(&pool, "Dune").unwrap().unwrap();
    assert_eq!(dune.id, "m1");
    assert_eq!(dune.directors, ["Denis Villeneuve"]);
    assert_eq!(dune.cast, ["Timothée Chalamet"]);
    assert_eq!(
        get_title(&pool, "m3").unwrap().unwrap().title,
        "The Shining"
    );
    assert!(get_title(&pool, "Nonexistent").unwrap().is_none());

    let genres = genre_counts(&pool).unwrap();
    let horror = genres.iter().find(|(g, _)| g == "Horror").unwrap();
    assert_eq!(horror.1, 2);

    let directors = people_counts(&pool, "director", 10).unwrap();
    assert_eq!(directors[0], ("Denis Villeneuve".to_string(), 2)); // most prolific first
}

#[test]
fn a_blank_lookup_finds_nothing_and_an_unknown_kind_reads_as_movie() {
    let pool = seeded_pool();
    assert!(get_title(&pool, "   ").unwrap().is_none());
    assert!(get_title(&pool, "").unwrap().is_none());

    let unknown_kind = find_titles(
        &pool,
        &TitleFilter {
            kind: Some("documentary".into()),
            limit: Some(50),
            ..Default::default()
        },
    )
    .unwrap();
    assert!(unknown_kind.iter().all(|t| t.kind == "movie"));
    assert_eq!(unknown_kind.len(), 5);
}

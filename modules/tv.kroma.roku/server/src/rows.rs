//! The first screen a box draws: what is in progress, then whatever the core
//! curated, then the library itself when nothing was curated at all.

use serde_json::Value;

use kroma_module_sdk::i18n::Translator;

use crate::channel::{item_tile, num, show_tile, str, Row, Tile};

const LIBRARY_ROW_CAP: usize = 60;

pub fn home(strings: Translator<'_>, continuing: &Value, sections: &Value) -> Vec<Row> {
    let mut rows = Vec::new();
    let resume: Vec<Tile> = continuing
        .as_array()
        .map(|entries| {
            entries
                .iter()
                .filter_map(|e| {
                    let progress = fraction(num(e, "positionMs"), num(e, "durationMs"));
                    e.get("item").map(|i| item_tile(i, progress))
                })
                .collect()
        })
        .unwrap_or_default();
    if !resume.is_empty() {
        rows.push(Row {
            title: strings.t("roku.channel.continueWatching", &[]),
            tiles: resume,
        });
    }
    for section in sections.as_array().into_iter().flatten() {
        let tiles: Vec<Tile> = section
            .get("items")
            .and_then(Value::as_array)
            .map(|items| items.iter().filter_map(|h| hit_tile(strings, h)).collect())
            .unwrap_or_default();
        if !tiles.is_empty() {
            rows.push(Row {
                title: str(section, "title"),
                tiles,
            });
        }
    }
    rows
}

pub fn library(strings: Translator<'_>, movies: &Value, shows: &Value) -> Vec<Row> {
    let mut rows = Vec::new();
    let movie_tiles: Vec<Tile> = movies
        .as_array()
        .map(|items| {
            items
                .iter()
                .take(LIBRARY_ROW_CAP)
                .map(|i| item_tile(i, 0.0))
                .collect()
        })
        .unwrap_or_default();
    if !movie_tiles.is_empty() {
        rows.push(Row {
            title: strings.t("roku.channel.movies", &[]),
            tiles: movie_tiles,
        });
    }
    let show_tiles: Vec<Tile> = shows
        .as_array()
        .map(|items| {
            items
                .iter()
                .take(LIBRARY_ROW_CAP)
                .map(|s| show_tile(strings, s))
                .collect()
        })
        .unwrap_or_default();
    if !show_tiles.is_empty() {
        rows.push(Row {
            title: strings.t("roku.channel.shows", &[]),
            tiles: show_tiles,
        });
    }
    rows
}

fn hit_tile(strings: Translator<'_>, hit: &Value) -> Option<Tile> {
    match str(hit, "type").as_str() {
        "movie" | "episode" => hit.get("item").map(|i| item_tile(i, 0.0)),
        "show" => hit.get("show").map(|s| show_tile(strings, s)),
        _ => None,
    }
}

fn fraction(position: Option<i64>, duration: Option<i64>) -> f64 {
    match (position, duration) {
        (Some(p), Some(d)) if d > 0 => (p as f64 / d as f64).clamp(0.0, 1.0),
        _ => 0.0,
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use crate::strings;
    use crate::test_support::{episode, movie, show};

    use super::*;

    #[test]
    fn the_home_starts_with_what_is_in_progress_and_skips_empty_rows() {
        let continuing =
            json!([{ "positionMs": 600000, "durationMs": 2400000, "item": episode() }]);
        let sections = json!([
            { "title": "Empty", "items": [] },
            { "title": "Films", "items": [{ "type": "movie", "item": movie() }, { "type": "show", "show": show() }] }
        ]);

        let rows = home(strings::for_locale("fr"), &continuing, &sections);

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].title, "Reprendre");
        assert_eq!(rows[0].tiles[0].progress, 0.25);
        assert_eq!(rows[1].title, "Films");
        assert_eq!(rows[1].tiles[1].subtitle, "2022 · 12 épisodes");
        assert_eq!(rows[1].tiles[1].poster, "/api/shows/s1/poster");
    }

    #[test]
    fn a_library_with_nothing_curated_still_fills_two_rows() {
        let movies = json!([movie()]);
        let shows = json!([show()]);

        let rows = library(strings::for_locale("fr"), &movies, &shows);

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].title, "Films");
        assert_eq!(rows[0].tiles[0].title, "Dune");
        assert_eq!(rows[1].title, "Séries");
        assert_eq!(rows[1].tiles[0].subtitle, "2022 · 12 épisodes");
    }

    #[test]
    fn a_library_row_the_core_answered_nothing_for_is_not_drawn() {
        let strings = strings::for_locale("en");

        assert!(library(strings, &Value::Null, &json!([])).is_empty());
        assert!(home(strings, &Value::Null, &Value::Null).is_empty());
    }
}

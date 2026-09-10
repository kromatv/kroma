//! What the channel draws, shaped here so the BrightScript stays a renderer:
//! rows of tiles for the home screen, and one detail with its play action.
//! Every URL is relative to the server the channel already knows; a backdrop
//! is the provider's own absolute one.

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tile {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub subtitle: String,
    pub poster: String,
    pub progress: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Row {
    pub title: String,
    pub tiles: Vec<Tile>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Play {
    pub item_id: String,
    pub url: String,
    pub format: String,
    pub title: String,
    pub resume_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Detail {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub subtitle: String,
    pub overview: String,
    pub poster: String,
    pub backdrop: String,
    pub play: Option<Play>,
    pub episodes: Vec<Tile>,
}

pub(crate) fn str(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

pub(crate) fn num(v: &Value, key: &str) -> Option<i64> {
    v.get(key).and_then(Value::as_i64)
}

fn year(v: &Value) -> String {
    num(v, "year").map(|y| y.to_string()).unwrap_or_default()
}

pub(crate) fn overview(v: &Value) -> String {
    v.get("metadata")
        .map(|m| str(m, "overview"))
        .unwrap_or_default()
}

pub(crate) fn backdrop(v: &Value) -> String {
    v.get("metadata")
        .map(|m| str(m, "backdropUrl"))
        .unwrap_or_default()
}

pub fn stream_format(container: &str) -> &'static str {
    if ["mkv", "matroska", "webm"]
        .iter()
        .any(|c| container.contains(c))
    {
        "mkv"
    } else {
        "mp4"
    }
}

pub(crate) fn episode_code(item: &Value) -> String {
    match (num(item, "season"), num(item, "episode")) {
        (Some(s), Some(e)) => format!("S{s} E{e}"),
        _ => String::new(),
    }
}

pub(crate) fn join(parts: [&str; 2]) -> String {
    parts
        .iter()
        .filter(|p| !p.is_empty())
        .copied()
        .collect::<Vec<_>>()
        .join(" · ")
}

pub fn item_tile(item: &Value, progress: f64) -> Tile {
    let id = str(item, "id");
    let is_episode = str(item, "kind") == "episode";
    let (title, subtitle) = if is_episode {
        let episode = str(item, "episodeTitle");
        (
            str(item, "showTitle"),
            join([&episode_code(item), &episode]),
        )
    } else {
        (str(item, "title"), year(item))
    };
    Tile {
        poster: format!("/api/items/{id}/poster"),
        id,
        kind: if is_episode { "episode" } else { "movie" }.into(),
        title,
        subtitle,
        progress,
    }
}

pub fn show_tile(show: &Value) -> Tile {
    let id = str(show, "id");
    let episodes = num(show, "episodeCount").unwrap_or_default();
    Tile {
        poster: format!("/api/shows/{id}/poster"),
        id,
        kind: "show".into(),
        title: str(show, "title"),
        subtitle: join([&year(show), &format!("{episodes} episodes")]),
        progress: 0.0,
    }
}

fn hit_tile(hit: &Value) -> Option<Tile> {
    match str(hit, "type").as_str() {
        "movie" | "episode" => hit.get("item").map(|i| item_tile(i, 0.0)),
        "show" => hit.get("show").map(show_tile),
        _ => None,
    }
}

fn fraction(position: Option<i64>, duration: Option<i64>) -> f64 {
    match (position, duration) {
        (Some(p), Some(d)) if d > 0 => (p as f64 / d as f64).clamp(0.0, 1.0),
        _ => 0.0,
    }
}

pub fn home_rows(continue_title: &str, continuing: &Value, sections: &Value) -> Vec<Row> {
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
            title: continue_title.to_string(),
            tiles: resume,
        });
    }
    for section in sections.as_array().into_iter().flatten() {
        let tiles: Vec<Tile> = section
            .get("items")
            .and_then(Value::as_array)
            .map(|items| items.iter().filter_map(hit_tile).collect())
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

const LIBRARY_ROW_CAP: usize = 60;

pub fn library_rows(
    movies_title: &str,
    shows_title: &str,
    movies: &Value,
    shows: &Value,
) -> Vec<Row> {
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
            title: movies_title.to_string(),
            tiles: movie_tiles,
        });
    }
    let show_tiles: Vec<Tile> = shows
        .as_array()
        .map(|items| items.iter().take(LIBRARY_ROW_CAP).map(show_tile).collect())
        .unwrap_or_default();
    if !show_tiles.is_empty() {
        rows.push(Row {
            title: shows_title.to_string(),
            tiles: show_tiles,
        });
    }
    rows
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn movie() -> Value {
        json!({
            "id": "m1", "kind": "movie", "title": "Dune", "year": 2021,
            "container": "mov,mp4,m4a,3gp,3g2,mj2",
            "metadata": { "overview": "Spice.", "backdropUrl": "https://img/dune.jpg" }
        })
    }

    fn episode() -> Value {
        json!({
            "id": "e3", "kind": "episode", "title": "Chapter 3", "showId": "s1",
            "showTitle": "Andor", "season": 1, "episode": 3, "episodeTitle": "Reckoning",
            "container": "matroska,webm"
        })
    }

    #[test]
    fn a_movie_tile_names_the_title_and_the_year() {
        let tile = item_tile(&movie(), 0.0);

        assert_eq!(tile.title, "Dune");
        assert_eq!(tile.subtitle, "2021");
        assert_eq!(tile.kind, "movie");
        assert_eq!(tile.poster, "/api/items/m1/poster");
    }

    #[test]
    fn an_episode_tile_names_the_show_and_places_the_episode() {
        let tile = item_tile(&episode(), 0.4);

        assert_eq!(tile.title, "Andor");
        assert_eq!(tile.subtitle, "S1 E3 · Reckoning");
        assert_eq!(tile.kind, "episode");
        assert_eq!(tile.progress, 0.4);
    }

    #[test]
    fn the_home_starts_with_what_is_in_progress_and_skips_empty_rows() {
        let continuing =
            json!([{ "positionMs": 600000, "durationMs": 2400000, "item": episode() }]);
        let sections = json!([
            { "title": "Empty", "items": [] },
            { "title": "Films", "items": [{ "type": "movie", "item": movie() }, { "type": "show", "show": { "id": "s1", "title": "Andor", "year": 2022, "episodeCount": 12 } }] }
        ]);

        let rows = home_rows("Reprendre", &continuing, &sections);

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].title, "Reprendre");
        assert_eq!(rows[0].tiles[0].progress, 0.25);
        assert_eq!(rows[1].title, "Films");
        assert_eq!(rows[1].tiles[1].subtitle, "2022 · 12 episodes");
        assert_eq!(rows[1].tiles[1].poster, "/api/shows/s1/poster");
    }

    #[test]
    fn a_library_with_nothing_curated_still_fills_two_rows() {
        let movies = json!([movie()]);
        let shows = json!([{ "id": "s1", "title": "Andor", "episodeCount": 12 }]);

        let rows = library_rows("Films", "Séries", &movies, &shows);

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].tiles[0].title, "Dune");
        assert_eq!(rows[1].tiles[0].subtitle, "12 episodes");
        assert!(library_rows("Films", "Séries", &Value::Null, &json!([])).is_empty());
    }

    #[test]
    fn a_stream_is_named_by_what_the_box_must_demux() {
        assert_eq!(stream_format("matroska,webm"), "mkv");
        assert_eq!(stream_format("mkv"), "mkv");
        assert_eq!(stream_format("mov,mp4,m4a,3gp,3g2,mj2"), "mp4");
        assert_eq!(stream_format(""), "mp4");
    }
}

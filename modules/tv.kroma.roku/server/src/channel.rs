//! What the channel draws, shaped here so the BrightScript stays a renderer:
//! rows of tiles for the home screen, and one detail with its play action.
//! Every URL is relative to the server the channel already knows; a backdrop
//! is the provider's own absolute one.

use serde::Serialize;
use serde_json::Value;

use kroma_module_sdk::i18n::Translator;

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

pub fn show_tile(strings: Translator<'_>, show: &Value) -> Tile {
    let id = str(show, "id");
    let count = num(show, "episodeCount").unwrap_or_default().to_string();
    let episodes = strings.t("roku.channel.episodes", &[("count", &count)]);
    Tile {
        poster: format!("/api/shows/{id}/poster"),
        id,
        kind: "show".into(),
        title: str(show, "title"),
        subtitle: join([&year(show), &episodes]),
        progress: 0.0,
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use crate::strings;
    use crate::test_support::{episode, movie, show};

    use super::*;

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
    fn a_show_tile_counts_its_episodes_in_the_language_the_viewer_reads() {
        let english = show_tile(strings::for_locale("en"), &show());
        let french = show_tile(strings::for_locale("fr"), &show());

        assert_eq!(english.subtitle, "2022 · 12 episodes");
        assert_eq!(french.subtitle, "2022 · 12 épisodes");
        assert_eq!(french.poster, "/api/shows/s1/poster");
    }

    #[test]
    fn a_show_with_one_episode_is_not_told_it_has_several() {
        let one = json!({ "id": "s1", "title": "Andor", "episodeCount": 1 });

        assert_eq!(
            show_tile(strings::for_locale("en"), &one).subtitle,
            "1 episode"
        );
        assert_eq!(
            show_tile(strings::for_locale("fr"), &one).subtitle,
            "1 épisode"
        );
    }

    #[test]
    fn a_stream_is_named_by_what_the_box_must_demux() {
        assert_eq!(stream_format("matroska,webm"), "mkv");
        assert_eq!(stream_format("mkv"), "mkv");
        assert_eq!(stream_format("mov,mp4,m4a,3gp,3g2,mj2"), "mp4");
        assert_eq!(stream_format(""), "mp4");
    }
}

//! A home-screen section: a titled, ranked rail of entries produced by the
//! section generator (`crate::services::sections`). The client renders these
//! generically it doesn't know what each section *means*, just how to draw a
//! titled row of cards. Adding/retuning sections is therefore a server-only change.

use serde::Serialize;

use crate::media::{show_card, MediaCard, MediaItem, Show};

#[derive(Debug, Clone, Serialize)]
pub struct Section {
    // Stable-ish key for list rendering / focus restoration (e.g.
    // `"themed:heist"`, `"for-you"`).
    pub id: String,
    // Localized, ready-to-display heading (the server resolves i18n, so clients
    // stay generic).
    pub title: String,
    // Optional secondary line, e.g. "Parce que vous avez regardé Mad Max".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    // The rail's entries — movies *or* shows — already capped and de-duplicated
    // against earlier rows. A `type`-tagged union so the client switches on it
    // (mirrors `SearchHit`): a movie carries a `MediaItem`, a show a `Show`.
    pub items: Vec<SectionItem>,
}

/// One rail entry: a movie/video (a [`MediaItem`]) or a whole show (a [`Show`]).
/// Both are embedded + ranked by the recommender, so a row can mix them.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum SectionItem {
    Movie { item: Box<MediaItem> },
    Show { show: Box<Show> },
}

impl SectionItem {
    /// The entry's stable id (item or show id) used for cross-row de-dup.
    pub fn id(&self) -> &str {
        match self {
            SectionItem::Movie { item } => &item.id,
            SectionItem::Show { show } => &show.id,
        }
    }
}

/// A [`Section`] as a grid of posters draws it (`GET /api/home?view=card`): a
/// movie is its [`MediaCard`], a show keeps its shape without cast or crew.
#[derive(Debug, Clone, Serialize)]
pub struct CardSection {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    pub items: Vec<SectionCard>,
}

/// One [`CardSection`] entry, tagged like [`SectionItem`].
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum SectionCard {
    Movie { item: Box<MediaCard> },
    Show { show: Box<Show> },
}

impl From<SectionItem> for SectionCard {
    fn from(entry: SectionItem) -> Self {
        match entry {
            SectionItem::Movie { item } => Self::Movie {
                item: Box::new(MediaCard::from(*item)),
            },
            SectionItem::Show { show } => Self::Show {
                show: Box::new(show_card(*show)),
            },
        }
    }
}

impl From<Section> for CardSection {
    fn from(section: Section) -> Self {
        Self {
            id: section.id,
            title: section.title,
            reason: section.reason,
            items: section.items.into_iter().map(SectionCard::from).collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::*;

    const METADATA: &str = r#"{
        "tmdbId": 1, "title": "T", "overview": "O", "genres": ["Crime"],
        "posterUrl": "/p.webp", "tmdbUrl": "x",
        "cast": [{ "name": "Al Pacino" }], "crew": [{ "name": "Michael Mann", "job": "Director" }]
    }"#;

    fn rail() -> Section {
        let metadata: Value = serde_json::from_str(METADATA).unwrap();
        let movie: MediaItem = serde_json::from_value(json!({
            "id": "m1", "title": "Heat", "kind": "movie", "year": 1995, "durationMs": 1,
            "container": "mkv", "subtitles": [], "library": "lib", "addedAt": "t",
            "metadata": metadata,
            "files": [{ "id": "f1", "container": "mkv", "subtitles": [], "probed": true }]
        }))
        .unwrap();
        let show: Show = serde_json::from_value(json!({
            "id": "s1", "title": "Wire", "library": "lib", "seasonCount": 5,
            "episodeCount": 60, "addedAt": "t", "metadata": metadata
        }))
        .unwrap();
        Section {
            id: "for-you".into(),
            title: "Pour vous".into(),
            reason: None,
            items: vec![
                SectionItem::Movie {
                    item: Box::new(movie),
                },
                SectionItem::Show {
                    show: Box::new(show),
                },
            ],
        }
    }

    #[test]
    fn a_card_rail_keeps_what_a_poster_draws_of_both_kinds() {
        let section = rail();

        let cards = serde_json::to_value(CardSection::from(section)).unwrap();

        assert_eq!(cards["items"][0]["type"], json!("movie"));
        assert_eq!(cards["items"][0]["item"]["metadata"]["posterUrl"], json!("/p.webp"));
        assert_eq!(cards["items"][1]["show"]["seasonCount"], json!(5));
        assert_eq!(cards["items"][1]["show"]["metadata"]["genres"], json!(["Crime"]));
    }

    #[test]
    fn a_card_rail_drops_files_and_credits_from_both_kinds() {
        let section = rail();

        let cards = serde_json::to_value(CardSection::from(section)).unwrap();

        let movie = &cards["items"][0]["item"];
        let show = &cards["items"][1]["show"];
        assert_eq!(movie.get("files"), None);
        for entry in [movie, show] {
            assert_eq!(entry["metadata"].get("cast"), None, "{entry}");
            assert_eq!(entry["metadata"].get("crew"), None, "{entry}");
        }
    }
}

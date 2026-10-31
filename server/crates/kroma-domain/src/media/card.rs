use serde::Serialize;

use super::{Kind, MediaItem, VideoStream};
use crate::metadata::Metadata;

/// A title as a list draws it: what a grid sorts, filters and paints, without
/// the files, tracks, cast and crew only its own page reads.
#[derive(Debug, Clone, Serialize)]
pub struct MediaCard {
    pub id: String,
    pub title: String,
    pub kind: Kind,
    pub year: Option<u32>,
    #[serde(rename = "durationMs")]
    pub duration_ms: Option<u64>,
    pub video: Option<VideoStream>,
    pub library: String,
    #[serde(rename = "addedAt")]
    pub added_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Metadata>,
}

impl From<MediaItem> for MediaCard {
    fn from(item: MediaItem) -> Self {
        let metadata = item.metadata.map(|mut metadata| {
            metadata.cast.clear();
            metadata.crew.clear();
            metadata
        });
        Self {
            id: item.id,
            title: item.title,
            kind: item.kind,
            year: item.year,
            duration_ms: item.duration_ms,
            video: item.video,
            library: item.library,
            added_at: item.added_at,
            metadata,
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::*;

    fn enriched_movie() -> MediaItem {
        serde_json::from_value(json!({
            "id": "m1",
            "title": "Heat",
            "kind": "movie",
            "year": 1995,
            "durationMs": 10_200_000,
            "container": "mkv",
            "subtitles": [{ "index": 2, "codec": "subrip", "language": "fre" }],
            "library": "lib",
            "addedAt": "2026-10-31T10:00:00Z",
            "metadata": {
                "tmdbId": 949,
                "title": "Heat",
                "overview": "A heist.",
                "genres": ["Crime"],
                "posterUrl": "/api/images/a.webp",
                "cast": [{ "name": "Al Pacino", "character": "Vincent Hanna" }],
                "crew": [{ "name": "Michael Mann", "job": "Director" }],
                "tmdbUrl": "https://www.themoviedb.org/movie/949"
            },
            "files": []
        }))
        .unwrap()
    }

    #[test]
    fn a_card_keeps_what_a_grid_draws_and_drops_what_only_the_title_page_reads() {
        let item = enriched_movie();

        let card = serde_json::to_value(MediaCard::from(item)).unwrap();

        assert_eq!(card["title"], json!("Heat"));
        assert_eq!(card["metadata"]["genres"], json!(["Crime"]));
        assert_eq!(card["metadata"]["posterUrl"], json!("/api/images/a.webp"));
        for gone in ["files", "subtitles", "audioTracks", "container", "relPath"] {
            assert_eq!(card.get(gone), None, "{gone}");
        }
        for gone in ["cast", "crew"] {
            assert_eq!(card["metadata"].get(gone), None::<&Value>, "{gone}");
        }
    }
}

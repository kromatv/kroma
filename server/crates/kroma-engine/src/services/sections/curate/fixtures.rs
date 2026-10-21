use crate::model::{Kind, MediaItem};

use super::CatalogEntry;

pub(super) fn entry(id: &str, title: &str, rating: f32, director: &str) -> CatalogEntry {
    CatalogEntry {
        id: id.into(),
        title: title.into(),
        year: Some(2000),
        rating,
        genres: vec!["Drama".into()],
        directors: if director.is_empty() {
            vec![]
        } else {
            vec![director.into()]
        },
    }
}

pub(super) fn meta(rating: f32, genres: &[&str], directors: &[&str]) -> crate::model::Metadata {
    crate::model::Metadata {
        provider: "tmdb",
        tmdb_id: 1,
        imdb_id: None,
        title: None,
        tagline: None,
        overview: None,
        release_date: None,
        genres: genres.iter().map(|s| s.to_string()).collect(),
        tmdb_genre_ids: Vec::new(),
        rating: Some(rating),
        certification: None,
        poster_url: None,
        backdrop_url: None,
        logo_url: None,
        theme_url: None,
        cast: Vec::new(),
        crew: directors
            .iter()
            .map(|d| crate::model::CrewMember {
                name: d.to_string(),
                tmdb_id: None,
                job: "Director".to_string(),
                profile_url: None,
            })
            .collect(),
        keywords: Vec::new(),
        tvdb_id: None,
        tmdb_url: String::new(),
    }
}

pub(super) fn item(
    id: &str,
    title: &str,
    kind: Kind,
    m: Option<crate::model::Metadata>,
) -> MediaItem {
    MediaItem {
        id: id.into(),
        title: title.into(),
        kind,
        year: Some(2001),
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
        added_at: "t".into(),
        metadata: m,
        abs_path: None,
        files: Vec::new(),
        editions: Vec::new(),
        default_file_id: None,
        markers: Vec::new(),
        audio_analysis: None,
    }
}

// Extra helper: a catalog entry with an explicit year (the base `entry` fixes 2000).
pub(super) fn entry_year(id: &str, title: &str, rating: f32, year: u32) -> CatalogEntry {
    CatalogEntry {
        id: id.into(),
        title: title.into(),
        year: Some(year),
        rating,
        genres: vec!["Drama".into()],
        directors: vec![],
    }
}

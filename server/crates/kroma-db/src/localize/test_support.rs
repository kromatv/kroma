use crate::testing::TempPool;
use crate::translations::TransData;

use kroma_domain::{CastMember, Kind, MediaItem, Metadata, Show};

pub(super) fn pool() -> TempPool {
    crate::testing::temp_pool("loc")
}

pub(super) fn meta(title: &str) -> Metadata {
    Metadata {
        provider: "tmdb",
        tmdb_id: 1,
        imdb_id: None,
        title: Some(title.into()),
        tagline: Some("orig tagline".into()),
        overview: Some("orig overview".into()),
        release_date: None,
        genres: vec!["Original".into()],
        rating: None,
        poster_url: None,
        backdrop_url: None,
        logo_url: None,
        theme_url: None,
        cast: vec![CastMember {
            name: "Actor".into(),
            character: Some("Orig Char".into()),
            profile_url: None,
        }],
        crew: vec![],
        keywords: vec![],
        tvdb_id: None,
        tmdb_url: "x".into(),
    }
}

pub(super) fn item(id: &str, kind: Kind) -> MediaItem {
    MediaItem {
        id: id.into(),
        title: "T".into(),
        kind,
        year: None,
        duration_ms: None,
        container: "mkv".into(),
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
        metadata: Some(meta("Original")),
        abs_path: None,
        files: Vec::new(),
        default_file_id: None,
        markers: Vec::new(),
        audio_analysis: None,
    }
}

pub(super) fn show(id: &str) -> Show {
    Show {
        id: id.into(),
        title: "T".into(),
        year: None,
        library: "lib".into(),
        season_count: 0,
        episode_count: 0,
        video: None,
        added_at: "t".into(),
        metadata: Some(meta("Show EN")),
        progress: None,
    }
}

pub(super) fn td(title: &str, characters: Vec<Option<String>>) -> TransData {
    TransData {
        title: Some(title.into()),
        characters,
        ..Default::default()
    }
}

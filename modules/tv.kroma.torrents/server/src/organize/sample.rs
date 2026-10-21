use crate::dtos::SampleNames;

use super::naming::{NameContext, NamingTemplates};

/// Render one movie + one episode example for the live template preview.
pub fn sample(tpl: &NamingTemplates) -> SampleNames {
    let movie = NameContext {
        title: "The Matrix".into(),
        year: Some(1999),
        resolution: Some("2160p".into()),
        codec: Some("x265".into()),
        source: Some("Bluray".into()),
        release_group: Some("EVOLVE".into()),
        edition: Some("IMAX".into()),
        imdb_id: Some("tt0133093".into()),
        tmdb_id: Some(603),
        dynamic_range: Some("DV".into()),
        video_bit_depth: Some(10),
        audio_codec: Some("TrueHD".into()),
        audio_channels: Some("5.1".into()),
        audio_languages: vec!["EN".into(), "FR".into()],
        subtitle_languages: vec!["FR".into()],
        ..Default::default()
    };
    let episode = NameContext {
        title: "Breaking Bad".into(),
        year: Some(2008),
        season: Some(1),
        episode: Some(2),
        episode_title: Some("Cat's in the Bag...".into()),
        resolution: Some("1080p".into()),
        codec: Some("x264".into()),
        source: Some("WEBDL".into()),
        release_group: Some("NTb".into()),
        audio_codec: Some("EAC3".into()),
        audio_channels: Some("5.1".into()),
        audio_languages: vec!["EN".into()],
        ..Default::default()
    };
    SampleNames {
        movie: tpl
            .movie_rel_path(&movie, "mkv")
            .to_string_lossy()
            .into_owned(),
        episode: tpl
            .episode_rel_path(&episode, "mkv")
            .to_string_lossy()
            .into_owned(),
    }
}

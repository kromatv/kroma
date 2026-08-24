use serde::Deserialize;

use crate::domain::metadata::CastMember;

use super::super::common::{build_cast, RawCredits};
use super::{api, curl_json, IMG, MAX_CAST};

/// Per-episode artwork + text resolved from a TMDB season fetch.
#[derive(Debug, Clone)]
pub struct EpisodeArt {
    pub episode: u32,
    pub still_url: Option<String>,
    pub name: Option<String>,
    pub overview: Option<String>,
    pub air_date: Option<String>,
    pub rating: Option<f32>,
}

#[derive(Debug, Clone, Default)]
pub struct SeasonData {
    pub episodes: Vec<EpisodeArt>,
    pub cast: Vec<CastMember>,
}

/// Fetches one season's episodes and cast in a single TMDB call. Returns empty
/// data on any failure: season enrichment is best-effort and must never break
/// show enrichment.
pub fn season_episodes(api_key: &str, language: &str, tv_id: u64, season: u32) -> SeasonData {
    let params = vec![
        ("language", language.to_string()),
        ("append_to_response", "credits".to_string()),
    ];
    let resp: SeasonResp = match curl_json(
        &format!("{}/tv/{tv_id}/season/{season}", api()),
        api_key,
        &params,
    ) {
        Ok(r) => r,
        Err(()) => return SeasonData::default(),
    };
    let episodes = resp
        .episodes
        .into_iter()
        .map(|e| EpisodeArt {
            episode: e.episode_number,
            still_url: e.still_path.map(|p| format!("{IMG}/w300{p}")),
            name: e.name.filter(|s| !s.is_empty()),
            overview: e.overview.filter(|s| !s.is_empty()),
            air_date: e.air_date.filter(|s| !s.is_empty()),
            rating: e.vote_average.filter(|v| *v > 0.0),
        })
        .collect();
    let cast = build_cast(
        resp.credits.map(|c| c.cast).unwrap_or_default(),
        MAX_CAST,
        false,
    );
    SeasonData { episodes, cast }
}

/// Fetches one season in several languages, keyed by language code. Languages
/// that return nothing are omitted.
pub fn season_episodes_multi(
    api_key: &str,
    langs: &[&str],
    tv_id: u64,
    season: u32,
) -> std::collections::HashMap<String, SeasonData> {
    langs
        .iter()
        .filter_map(|&lang| {
            let data = season_episodes(api_key, lang, tv_id, season);
            (!data.episodes.is_empty() || !data.cast.is_empty()).then(|| (lang.to_string(), data))
        })
        .collect()
}

#[derive(Debug, Deserialize)]
struct SeasonResp {
    #[serde(default)]
    episodes: Vec<RawEpisode>,
    #[serde(default)]
    credits: Option<RawCredits>,
}

#[derive(Debug, Deserialize)]
struct RawEpisode {
    #[serde(default)]
    episode_number: u32,
    #[serde(default)]
    still_path: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    overview: Option<String>,
    #[serde(default)]
    air_date: Option<String>,
    #[serde(default)]
    vote_average: Option<f32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_season_episode_stills() {
        let raw = r#"{
            "episodes": [
                {"episode_number": 1, "still_path": "/s1.jpg", "name": "Pilot", "overview": "It begins.", "air_date": "2022-02-18", "vote_average": 8.1},
                {"episode_number": 2, "name": "Half Loop", "overview": ""}
            ]
        }"#;
        let s: SeasonResp = serde_json::from_str(raw).unwrap();
        assert_eq!(s.episodes.len(), 2);
        assert_eq!(s.episodes[0].episode_number, 1);
        assert_eq!(s.episodes[0].still_path.as_deref(), Some("/s1.jpg"));
        assert!(s.episodes[1].still_path.is_none());
    }
}

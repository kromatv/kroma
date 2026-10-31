use serde::Deserialize;

use crate::domain::metadata::CastMember;
use crate::domain::DiscoverEpisode;

use super::super::common::{build_cast, RawCredits};
use super::{api, tmdb_json, IMG, MAX_CAST};

#[derive(Debug, Clone)]
pub struct EpisodeArt {
    pub episode: u32,
    pub still_url: Option<String>,
    pub name: Option<String>,
    pub overview: Option<String>,
    pub air_date: Option<String>,
    pub rating: Option<f32>,
    pub runtime_min: Option<u32>,
}

impl From<EpisodeArt> for DiscoverEpisode {
    fn from(e: EpisodeArt) -> Self {
        Self {
            episode: e.episode,
            name: e.name,
            overview: e.overview,
            still_url: e.still_url,
            air_date: e.air_date,
            runtime_min: e.runtime_min,
        }
    }
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
    let resp: SeasonResp = match tmdb_json(
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
            runtime_min: e.runtime.filter(|m| *m > 0),
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
    #[serde(default)]
    runtime: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    use serde_json::json;

    use crate::test_support::FakeTmdb;

    #[test]
    fn a_season_crosses_to_discover_under_the_keys_a_client_reads() {
        let tmdb = FakeTmdb::start(|_| {
            let pilot = json!({ "episode_number": 1, "name": "Pilot", "overview": "It begins.",
                "still_path": "/s1.jpg", "air_date": "2025-10-01", "runtime": 52 });
            let untitled = json!({ "episode_number": 2, "name": "", "runtime": 0 });
            (200, json!({ "episodes": [pilot, untitled] }))
        });

        let season = season_episodes("key", "fr-FR", 1399, 1);

        let episodes: Vec<DiscoverEpisode> = season.episodes.into_iter().map(Into::into).collect();
        assert_eq!(
            serde_json::to_value(episodes).unwrap(),
            json!([
                { "episode": 1, "name": "Pilot", "overview": "It begins.",
                  "stillUrl": "https://image.tmdb.org/t/p/w300/s1.jpg", "airDate": "2025-10-01",
                  "runtimeMin": 52 },
                { "episode": 2, "name": null, "overview": null, "stillUrl": null, "airDate": null,
                  "runtimeMin": null },
            ])
        );
        assert!(tmdb.requests()[0].starts_with("/tv/1399/season/1?"));
        assert!(tmdb.requests()[0].contains("language=fr-FR"));
    }

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

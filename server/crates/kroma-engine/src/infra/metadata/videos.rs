use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Deserialize;

use kroma_domain::TmdbVideo;

use super::client::{api, tmdb_json, Target};

const FRESH_FOR: Duration = Duration::from_secs(12 * 60 * 60);
const PURPOSE: &str = kroma_requests::tmdb::PURPOSE;

/// What TMDB lists for one title: its videos in the languages asked for, and
/// the language the title was made in.
#[derive(Debug, Clone, Default)]
pub struct TitleVideos {
    pub original_language: Option<String>,
    pub videos: Vec<TmdbVideo>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Detail {
    original_language: Option<String>,
    videos: VideoList,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct VideoList {
    results: Vec<TmdbVideo>,
}

static CACHE: OnceLock<Mutex<HashMap<String, (Instant, TitleVideos)>>> = OnceLock::new();

fn cache() -> std::sync::MutexGuard<'static, HashMap<String, (Instant, TitleVideos)>> {
    CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// The videos TMDB lists for a title in `viewer`'s language, in English, and in
/// the language the title was made in, or `None` when TMDB did not answer.
/// Kept for half a day; a failure is not kept, so the next ask tries again.
pub fn title_videos(
    api_key: &str,
    target: Target,
    tmdb_id: u64,
    viewer: &str,
) -> Option<TitleVideos> {
    let path = target.detail_path();
    let key = format!("{path}:{tmdb_id}:{viewer}");
    if let Some((at, found)) = cache().get(&key).cloned() {
        if at.elapsed() < FRESH_FOR {
            return Some(found);
        }
    }
    let base = api();
    let detail: Detail = tmdb_json(
        PURPOSE,
        &format!("{base}/{path}/{tmdb_id}"),
        api_key,
        &[
            ("append_to_response", "videos".to_string()),
            ("include_video_language", format!("{viewer},en")),
        ],
    )
    .ok()?;
    let original = detail.original_language.filter(|lang| !lang.is_empty());
    let mut videos = detail.videos.results;
    if let Some(lang) = original
        .as_deref()
        .filter(|lang| *lang != viewer && *lang != "en")
    {
        let more: VideoList = tmdb_json(
            PURPOSE,
            &format!("{base}/{path}/{tmdb_id}/videos"),
            api_key,
            &[("include_video_language", lang.to_string())],
        )
        .ok()?;
        videos.extend(more.results);
    }
    let found = TitleVideos {
        original_language: original,
        videos,
    };
    cache().insert(key, (Instant::now(), found.clone()));
    Some(found)
}

#[cfg(test)]
mod tests {
    use super::*;

    use kroma_requests::testing::FakeTmdb;
    use serde_json::json;

    fn video(key: &str, lang: &str) -> serde_json::Value {
        json!({ "key": key, "site": "YouTube", "type": "Trailer", "iso_639_1": lang, "name": "Trailer", "official": true })
    }

    #[test]
    fn a_title_made_in_a_third_language_asks_for_its_trailers_too() {
        let tmdb = FakeTmdb::start(|path| match path {
            "/movie/496243" => (
                200,
                json!({ "original_language": "ko", "videos": { "results": [video("en", "en")] } }),
            ),
            "/movie/496243/videos" => (200, json!({ "results": [video("ko", "ko")] })),
            _ => (404, json!({})),
        });

        let found = title_videos("key", Target::Movie, 496243, "fr").unwrap();

        let keys: Vec<&str> = found.videos.iter().map(|v| v.key.as_str()).collect();
        assert_eq!(keys, vec!["en", "ko"]);
        assert_eq!(found.original_language.as_deref(), Some("ko"));
        assert!(tmdb
            .requests()
            .iter()
            .any(|r| r.contains("include_video_language=fr")));
    }

    #[test]
    fn a_title_made_in_english_asks_only_once() {
        let tmdb = FakeTmdb::start(|path| match path {
            "/movie/1061474" => (
                200,
                json!({ "original_language": "en", "videos": { "results": [video("vf", "fr")] } }),
            ),
            _ => (404, json!({})),
        });

        let found = title_videos("key", Target::Movie, 1061474, "fr").unwrap();

        assert_eq!(found.videos.len(), 1);
        assert_eq!(tmdb.requests().len(), 1);
    }

    #[test]
    fn a_failed_lookup_is_not_kept() {
        let _tmdb = FakeTmdb::start(|_| (500, json!({})));

        let failed = title_videos("key", Target::Tv, 1399, "fr");

        assert!(failed.is_none());
        assert!(!cache().contains_key("tv:1399:fr"));
    }
}

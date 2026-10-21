use std::path::Path;

use tracing::warn;

use kroma_domain::metadata::characters_aligned;

use crate::db::{self, Pool};
use crate::infra::events::{Bus, ServerEvent};
use crate::infra::image;
use crate::infra::metadata;
use crate::model::{ListedEpisode, MediaItem, Metadata};

use super::lang::primary_lang;

pub(super) fn blank_metadata() -> Metadata {
    Metadata {
        provider: "tmdb",
        tmdb_id: 0,
        imdb_id: None,
        title: None,
        tagline: None,
        overview: None,
        release_date: None,
        genres: Vec::new(),
        tmdb_genre_ids: Vec::new(),
        rating: None,
        certification: None,
        poster_url: None,
        backdrop_url: None,
        logo_url: None,
        theme_url: None,
        cast: Vec::new(),
        crew: Vec::new(),
        keywords: Vec::new(),
        tvdb_id: None,
        tmdb_url: String::new(),
    }
}

// The per-episode still travels in `backdrop_url`, where `backdropFor` finds it.
pub(super) fn episode_metadata(art: &metadata::EpisodeArt) -> Metadata {
    Metadata {
        title: art.name.clone(),
        overview: art.overview.clone(),
        release_date: art.air_date.clone(),
        rating: art.rating,
        backdrop_url: art.still_url.clone(),
        ..blank_metadata()
    }
}

#[allow(clippy::too_many_arguments)]
pub(super) fn enrich_episodes(
    pool: &Pool,
    api_key: &str,
    language: &str,
    langs: &[&str],
    data_dir: &Path,
    bus: &Bus,
    show_id: &str,
    tv_id: u64,
) {
    let Ok(Some(detail)) = db::get_show(pool, show_id) else {
        return;
    };
    let casts = db::season_casts(pool, show_id).unwrap_or_default();
    let gaps = db::season_gaps(pool, show_id).unwrap_or_default();
    for season in &detail.seasons {
        let missing: Vec<&MediaItem> = season
            .episodes
            .iter()
            .filter(|e| still_gone(data_dir, e))
            .collect();
        let needs_cast = match casts.get(&season.number) {
            None => true,
            Some(cast) => art_gone(data_dir, cast.iter().map(|m| m.profile_url.as_deref())),
        };
        let needs_guide = db::episode_guide_stale(pool, show_id, season.number).unwrap_or(true)
            || gaps.get(&season.number).is_some_and(|listed| {
                art_gone(data_dir, listed.iter().map(|e| e.still_url.as_deref()))
            });
        // Stills and a cast list say nothing about languages, so on their own
        // they let a language added since, or a payload that grew a field, pass
        // straight over every episode in a season that already has its artwork.
        let ep_ids: Vec<&str> = season.episodes.iter().map(|e| e.id.as_str()).collect();
        let stale_text =
            db::translations::any_stale(pool, "episode", &ep_ids, langs).unwrap_or(true);
        let cast_id = format!("{show_id}:{}", season.number);
        let stale_cast = !db::translations::stale_langs(pool, "season_cast", &cast_id, langs)
            .unwrap_or_default()
            .is_empty();
        if missing.is_empty() && !needs_cast && !needs_guide && !stale_text && !stale_cast {
            continue;
        }
        let per_lang = metadata::season_episodes_multi(api_key, langs, tv_id, season.number);
        if per_lang.is_empty() {
            continue;
        }
        let primary_key = primary_lang(&per_lang, language);
        let data = &per_lang[&primary_key];

        store_episode_stills(pool, data_dir, bus, &missing, data);
        store_episode_translations(pool, &per_lang, &season.episodes);
        store_episode_guide(pool, data_dir, show_id, season.number, &per_lang, data);
        store_season_cast(
            pool,
            data_dir,
            show_id,
            season.number,
            needs_cast,
            &per_lang,
            data,
        );
    }
}

pub(super) fn art_gone<'a>(data_dir: &Path, urls: impl Iterator<Item = Option<&'a str>>) -> bool {
    urls.flatten()
        .any(|url| image::local_art_missing(data_dir, url))
}

pub(super) fn still_gone(data_dir: &Path, ep: &MediaItem) -> bool {
    match ep.metadata.as_ref().and_then(|m| m.backdrop_url.as_deref()) {
        None => true,
        Some(url) => image::local_art_missing(data_dir, url),
    }
}

// The whole roster is stored; what is on disk is filtered out when read, so a
// file that arrives later needs no second fetch to stop being a gap.
pub(super) fn store_episode_guide(
    pool: &Pool,
    data_dir: &Path,
    show_id: &str,
    season: u32,
    per_lang: &std::collections::HashMap<String, metadata::SeasonData>,
    data: &metadata::SeasonData,
) {
    use db::translations::{self, TransData};
    let listed: Vec<ListedEpisode> = data
        .episodes
        .iter()
        .map(|a| ListedEpisode {
            episode: a.episode,
            title: a.name.clone(),
            overview: a.overview.clone(),
            air_date: a.air_date.clone(),
            still_url: a
                .still_url
                .as_deref()
                .and_then(|url| image::cache_remote(data_dir, url)),
        })
        .collect();
    if let Err(e) = db::replace_episode_guide(pool, show_id, season, &listed) {
        warn!(show = %show_id, season, error = %e, "failed to store the episode guide");
        return;
    }
    for (lang, sdata) in per_lang {
        for a in &sdata.episodes {
            let td = TransData {
                title: a.name.clone(),
                overview: a.overview.clone(),
                rev: translations::REV,
                ..Default::default()
            };
            if td.is_empty() {
                continue;
            }
            let id = format!("{show_id}:{season}:{}", a.episode);
            let _ = translations::put(pool, "episode_guide", &id, lang, translations::TMDB, &td);
        }
    }
}

pub(super) fn store_episode_stills(
    pool: &Pool,
    data_dir: &Path,
    bus: &Bus,
    missing: &[&MediaItem],
    data: &metadata::SeasonData,
) {
    if missing.is_empty() || data.episodes.is_empty() {
        return;
    }
    let by_num: std::collections::HashMap<u32, &metadata::EpisodeArt> =
        data.episodes.iter().map(|a| (a.episode, a)).collect();
    for ep in missing {
        let Some(num) = ep.episode else { continue };
        let Some(art) = by_num.get(&num) else {
            continue;
        };
        if art.still_url.is_none() && art.overview.is_none() {
            continue;
        }
        let meta = image::localize(data_dir, episode_metadata(art));
        match db::set_item_metadata(pool, &ep.id, &meta) {
            Ok(()) => bus.publish(ServerEvent::ItemUpdated { id: ep.id.clone() }),
            Err(e) => warn!(id = %ep.id, error = %e, "failed to store episode metadata"),
        }
    }
}

pub(super) fn store_episode_translations(
    pool: &Pool,
    per_lang: &std::collections::HashMap<String, metadata::SeasonData>,
    episodes: &[MediaItem],
) {
    use db::translations::{self, TransData};
    for (lang, sdata) in per_lang {
        let by_num: std::collections::HashMap<u32, &metadata::EpisodeArt> =
            sdata.episodes.iter().map(|a| (a.episode, a)).collect();
        for ep in episodes {
            let Some(num) = ep.episode else { continue };
            let Some(art) = by_num.get(&num) else {
                continue;
            };
            let td = TransData {
                title: art.name.clone(),
                overview: art.overview.clone(),
                rev: translations::REV,
                ..Default::default()
            };
            if !td.is_empty() {
                let _ = translations::put(pool, "episode", &ep.id, lang, translations::TMDB, &td);
            }
        }
    }
}

// Per-language character names are aligned by index to the stored cast, which
// works because TMDB keeps cast order across languages.
#[allow(clippy::too_many_arguments)]
pub(super) fn store_season_cast(
    pool: &Pool,
    data_dir: &Path,
    show_id: &str,
    season_number: u32,
    needs_cast: bool,
    per_lang: &std::collections::HashMap<String, metadata::SeasonData>,
    data: &metadata::SeasonData,
) {
    use db::translations::{self, TransData};
    if data.cast.is_empty() {
        return;
    }
    if needs_cast {
        let carrier = image::localize(
            data_dir,
            Metadata {
                cast: data.cast.clone(),
                ..blank_metadata()
            },
        );
        if let Err(e) = db::set_season_cast(pool, show_id, season_number, &carrier.cast) {
            warn!(show = %show_id, season = season_number, error = %e, "failed to store season cast");
        }
    }
    let sc_id = format!("{show_id}:{season_number}");
    for (lang, sdata) in per_lang {
        if sdata.cast.is_empty() {
            continue;
        }
        // Aligned to the stored cast rows by person, not by position: the two
        // responses are the same cast in two languages, and TMDB does not
        // promise them the same order.
        let characters = characters_aligned(&data.cast, &sdata.cast);
        if characters.is_empty() {
            continue;
        }
        let td = TransData {
            characters,
            rev: translations::REV,
            ..Default::default()
        };
        let _ = translations::put(pool, "season_cast", &sc_id, lang, translations::TMDB, &td);
    }
}

use std::collections::HashMap;
use std::path::Path;

use crate::db::art_beside::{season_id, SEASON};
use crate::db::translations::{self, TransData};
use crate::db::{self, Pool};
use crate::infra::image;
use crate::infra::metadata::SeasonData;
use crate::model::{CastMember, ListedEpisode, MediaItem, Season};

use super::episodes::{art_gone, still_gone};

pub(super) struct Known<'a> {
    pub pool: &'a Pool,
    pub data_dir: &'a Path,
    pub show_id: &'a str,
    pub langs: &'a [&'a str],
    pub casts: HashMap<u32, Vec<CastMember>>,
    pub gaps: HashMap<u32, Vec<ListedEpisode>>,
}

pub(super) struct Needs<'s> {
    pub missing: Vec<&'s MediaItem>,
    pub cast: bool,
    pub any: bool,
}

impl Known<'_> {
    pub(super) fn needs<'s>(&self, season: &'s Season) -> Needs<'s> {
        let missing: Vec<&MediaItem> = season
            .episodes
            .iter()
            .filter(|e| still_gone(self.data_dir, e))
            .collect();
        let cast = self.needs_cast(season.number);
        let any = !missing.is_empty()
            || cast
            || self.needs_guide(season.number)
            || self.text_stale(season);
        Needs { missing, cast, any }
    }

    fn needs_cast(&self, number: u32) -> bool {
        self.casts.get(&number).is_none_or(|cast| {
            art_gone(self.data_dir, cast.iter().map(|m| m.profile_url.as_deref()))
        })
    }

    fn needs_guide(&self, number: u32) -> bool {
        db::episode_guide_stale(self.pool, self.show_id, number).unwrap_or(true)
            || self.gaps.get(&number).is_some_and(|listed| {
                art_gone(self.data_dir, listed.iter().map(|e| e.still_url.as_deref()))
            })
    }

    // Stills and a cast list say nothing about languages, so on their own
    // they let a language added since, or a payload that grew a field, pass
    // straight over every episode in a season that already has its artwork.
    fn text_stale(&self, season: &Season) -> bool {
        let ep_ids: Vec<&str> = season.episodes.iter().map(|e| e.id.as_str()).collect();
        let id = season_id(self.show_id, season.number);
        let stale = |kind, ids: &[&str]| {
            translations::any_stale(self.pool, kind, ids, self.langs).unwrap_or(true)
        };
        let cast_stale = !translations::stale_langs(self.pool, "season_cast", &id, self.langs)
            .unwrap_or_default()
            .is_empty();
        stale("episode", &ep_ids) || cast_stale || stale(SEASON, &[id.as_str()])
    }

    pub(super) fn store_posters(&self, number: u32, per_lang: &HashMap<String, SeasonData>) {
        let id = season_id(self.show_id, number);
        for (lang, data) in per_lang {
            let poster_url = data
                .poster_url
                .as_deref()
                .and_then(|url| image::cache_remote(self.data_dir, url));
            let td = TransData {
                poster_url,
                rev: translations::REV,
                ..Default::default()
            };
            let _ = translations::put(self.pool, SEASON, &id, lang, translations::TMDB, &td);
        }
    }
}

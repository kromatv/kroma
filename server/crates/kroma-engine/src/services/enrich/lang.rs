use std::collections::HashMap;

use tracing::warn;

use crate::db::{self, Pool};
use crate::i18n;
use crate::infra::metadata::{self, SeasonData};

const LAST_RESORT: &str = "en";

pub(super) fn stale_langs(pool: &Pool, kind: &str, id: &str, langs: &[&str]) -> Vec<String> {
    match db::translations::stale_langs(pool, kind, id, langs) {
        Ok(stale) => stale,
        // A read that failed is not an answer. Taking it for "nothing is stale"
        // marks the title complete in whatever languages it happens to hold.
        Err(e) => {
            warn!(id = %id, error = %e, "could not tell which languages are stale; assuming all");
            langs.iter().map(|l| (*l).to_string()).collect()
        }
    }
}

pub(super) fn primary_lang<T>(map: &HashMap<String, T>, household: &str) -> String {
    let mut keys: Vec<&str> = map.keys().map(String::as_str).collect();
    keys.sort_unstable();
    let same_language =
        |key: &&str| i18n::language(key).eq_ignore_ascii_case(i18n::language(household.trim()));
    i18n::nearest(household, &keys)
        .or_else(|| keys.iter().copied().find(same_language))
        .or_else(|| keys.iter().copied().find(|key| *key == LAST_RESORT))
        .or_else(|| keys.first().copied())
        .unwrap_or_default()
        .to_string()
}

pub(super) fn season_by_locale(
    api_key: &str,
    langs: &[&str],
    tv_id: u64,
    season: u32,
) -> HashMap<String, SeasonData> {
    let tags: Vec<_> = langs.iter().map(|lang| i18n::tmdb_language(lang)).collect();
    let asked: Vec<&str> = tags.iter().map(AsRef::as_ref).collect();
    let mut by_tag = metadata::season_episodes_multi(api_key, &asked, tv_id, season);
    langs
        .iter()
        .zip(&asked)
        .filter_map(|(lang, tag)| Some(((*lang).to_string(), by_tag.remove(*tag)?)))
        .collect()
}

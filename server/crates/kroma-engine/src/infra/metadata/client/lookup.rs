use crate::domain::metadata::Metadata;

use super::super::cache::Cache;
use super::super::search;
use super::details::fetch_details;
use super::Target;

fn detail_key(target: Target, language: &str, title: &str, year: Option<u32>) -> String {
    format!(
        "{}|{}|{}|{}",
        target.detail_path(),
        language,
        year.unwrap_or(0),
        title.to_lowercase()
    )
}

// The `#` prefix can't collide with a title-keyed entry (titles are
// lowercased text, the year slot is numeric).
fn detail_key_id(target: Target, language: &str, id: u64) -> String {
    format!("{}|{}|#{id}", target.detail_path(), language)
}

/// Resolve metadata for `title`/`year` in one language, caching the result.
pub fn lookup(
    cache: &Cache,
    api_key: &str,
    language: &str,
    target: Target,
    title: &str,
    year: Option<u32>,
) -> Option<Metadata> {
    let key = detail_key(target, language, title, year);
    if let Some(cached) = cache.get(&key) {
        return cached;
    }
    match fetch(api_key, language, target, title, year) {
        Ok(Some(meta)) => {
            cache.put(key, Some(meta.clone()));
            Some(meta)
        }
        // Genuine no-match: cache it so we don't retry every request.
        Ok(None) => {
            cache.put(key, None);
            None
        }
        // A request failure (bad key, rate-limit, timeout, network) is never
        // cached: caching `None` here would poison the title on a transient blip.
        Err(()) => None,
    }
}

/// The same title resolved in several languages, one [`Metadata`] per language
/// that fetched. Invariant fields (ids, art, people) are identical across
/// entries; only the localized text differs. Keyed by base language code
/// (e.g. `"en"`).
pub struct Resolved {
    pub by_lang: std::collections::HashMap<String, Metadata>,
}

/// Resolve `title`/`year` in every language in `langs`. The TMDB id is resolved
/// once (a search in `search_lang`), then details are fetched per language
/// against that id; a language whose fetch fails transiently is omitted.
/// `None` means the title did not resolve at all.
pub fn lookup_all(
    cache: &Cache,
    api_key: &str,
    search_lang: &str,
    langs: &[&str],
    target: Target,
    title: &str,
    year: Option<u32>,
) -> Option<Resolved> {
    let id = match search::best_id(api_key, search_lang, target, title, year) {
        Ok(Some(id)) => id,
        // No match or a transient search failure: retried on the next pass.
        _ => return None,
    };
    let by_lang = details_by_lang(cache, api_key, langs, target, id, |lang| {
        detail_key(target, lang, title, year)
    });
    (!by_lang.is_empty()).then_some(Resolved { by_lang })
}

/// Same as [`lookup_all`] but for an already-known TMDB id: no search. Used for
/// a pinned id (import or operator correction), which must never be
/// re-guessed by title.
pub fn lookup_all_by_id(
    cache: &Cache,
    api_key: &str,
    langs: &[&str],
    target: Target,
    id: u64,
) -> Option<Resolved> {
    let by_lang = details_by_lang(cache, api_key, langs, target, id, |lang| {
        detail_key_id(target, lang, id)
    });
    (!by_lang.is_empty()).then_some(Resolved { by_lang })
}

fn details_by_lang(
    cache: &Cache,
    api_key: &str,
    langs: &[&str],
    target: Target,
    id: u64,
    key_for: impl Fn(&str) -> String,
) -> std::collections::HashMap<String, Metadata> {
    let mut by_lang = std::collections::HashMap::new();
    for &lang in langs {
        let key = key_for(lang);
        let meta = match cache.get(&key) {
            Some(Some(m)) => m,
            Some(None) => continue,
            None => match fetch_details(api_key, lang, target, id) {
                Ok(m) => {
                    cache.put(key, Some(m.clone()));
                    m
                }
                Err(()) => continue,
            },
        };
        by_lang.insert(lang.to_string(), meta);
    }
    by_lang
}

// `Ok(Some)` = resolved, `Ok(None)` = no match (cacheable), `Err(())` =
// transient request failure the caller must not cache.
fn fetch(
    api_key: &str,
    language: &str,
    target: Target,
    title: &str,
    year: Option<u32>,
) -> Result<Option<Metadata>, ()> {
    match search::best_id(api_key, language, target, title, year)? {
        Some(id) => Ok(Some(fetch_details(api_key, language, target, id)?)),
        None => Ok(None),
    }
}

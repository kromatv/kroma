use std::collections::{HashMap, HashSet};

use serde::Deserialize;

use crate::db::CuratedRow;
use crate::i18n;
use crate::services::sections::generate::slug;

use super::catalog::{CatalogEntry, MIN_ITEMS};
use super::prompt::MAX_LLM;

const SLUG_LOCALE: &str = "en";

/// One editorial collection as the model returned it (pre-resolution). `title`
/// and `reason` are locale-keyed objects (`{"en":…,"fr":…}`) over the supported
/// languages the model was asked to fill.
#[derive(Debug, Deserialize)]
pub struct CuratedSpec {
    #[serde(default)]
    pub title: HashMap<String, String>,
    #[serde(default)]
    pub reason: HashMap<String, String>,
    #[serde(default)]
    pub members: Vec<String>,
}

/// Parse a model reply (tolerant of fences/prose) into curated specs.
pub fn parse_curate(text: &str) -> anyhow::Result<Vec<CuratedSpec>> {
    let json = extract_json_array(text).ok_or_else(|| anyhow::anyhow!("no JSON array in reply"))?;
    let specs = serde_json::from_str::<Vec<CuratedSpec>>(json)?
        .into_iter()
        .take(MAX_LLM)
        .collect();
    Ok(specs)
}

/// Resolve each spec's member **titles** to real catalog ids (normalized match)
/// the catalog-in-prompt path, where the model echoes titles. Keeps collections
/// with ≥ [`MIN_ITEMS`] matches. Returns `(rows, dropped)`.
pub fn resolve_members(
    specs: &[CuratedSpec],
    catalog: &[CatalogEntry],
) -> (Vec<CuratedRow>, usize) {
    let mut index: HashMap<String, &str> = HashMap::new();
    for e in catalog {
        index.entry(normalize_title(&e.title)).or_insert(&e.id);
    }
    resolve(specs, |m| {
        index.get(&normalize_title(m)).map(|id| (*id).to_string())
    })
}

/// Resolve each spec's member **ids** against the catalog (exact id match) the
/// tool-driven path, where members are catalog ids the tools returned, so nothing
/// the model invents resolves. Keeps collections with ≥ [`MIN_ITEMS`] valid ids.
/// Returns `(rows, dropped)`.
pub fn resolve_members_by_id(
    specs: &[CuratedSpec],
    catalog: &[CatalogEntry],
) -> (Vec<CuratedRow>, usize) {
    let ids: HashSet<&str> = catalog.iter().map(|e| e.id.as_str()).collect();
    resolve(specs, |m| {
        let id = m.trim();
        ids.contains(id).then(|| id.to_string())
    })
}

// Shared resolver for both paths: map each spec's members to catalog ids via
// `resolve_one` (per member → its id or `None`), dedup within a collection, drop
// collections under [`MIN_ITEMS`], and assemble unique-keyed rows. They differ
// only in `resolve_one` (title-normalized lookup vs exact id membership).
fn resolve(
    specs: &[CuratedSpec],
    mut resolve_one: impl FnMut(&str) -> Option<String>,
) -> (Vec<CuratedRow>, usize) {
    let mut rows = Vec::new();
    let mut dropped = 0usize;
    let mut seen_keys = HashSet::new();
    for spec in specs {
        let mut ids = Vec::new();
        let mut seen = HashSet::new();
        for m in &spec.members {
            if let Some(id) = resolve_one(m) {
                if seen.insert(id.clone()) {
                    ids.push(id);
                }
            }
        }
        if ids.len() < MIN_ITEMS {
            dropped += 1;
            continue;
        }
        if let Some(row) = build_row(spec, ids, &mut seen_keys) {
            rows.push(row);
        }
    }
    (rows, dropped)
}

// Assemble one row from a spec and its (already ≥ [`MIN_ITEMS`]) resolved member
// ids: slug the key from the title an English reader is shown, reject
// empty/duplicate keys, and keep the non-empty localized title/reason maps.
// Shared by both resolvers.
fn build_row(
    spec: &CuratedSpec,
    member_ids: Vec<String>,
    seen_keys: &mut HashSet<String>,
) -> Option<CuratedRow> {
    let titles = clean_map(&spec.title);
    let key = slug(i18n::pick(&titles, SLUG_LOCALE)?);
    if key.is_empty() || !seen_keys.insert(key.clone()) {
        return None;
    }
    Some(CuratedRow {
        key,
        rank: 0,
        source: "llm".to_string(),
        item_ids: member_ids,
        titles,
        reasons: clean_map(&spec.reason),
    })
}

// Trim and drop empty-string entries from a locale -> string map, keyed by the
// content locale each of the model's keys names.
fn clean_map(m: &HashMap<String, String>) -> HashMap<String, String> {
    let said = m
        .iter()
        .filter(|(_, v)| !v.trim().is_empty())
        .map(|(k, v)| (k.clone(), v.trim().to_string()));
    i18n::content_keyed(said)
}

// Normalize a title for matching: drop a trailing `(year)` the model may have
// copied from the catalog listing, then lowercase and keep only alphanumerics.
// `"Le Parrain (1972)"` and `"Le Parrain"` both → `"leparrain"`; `"E.T. the
// Extra-Terrestrial"` → `"etheextraterrestrial"`. (Bare-number titles like
// `"1917"` keep their digits only a *parenthesized* 4-digit year is dropped.)
fn normalize_title(s: &str) -> String {
    strip_year(s)
        .chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

// Strip a trailing ` (YYYY)` from a title, if present.
fn strip_year(s: &str) -> &str {
    let t = s.trim_end();
    if let Some(open) = t.strip_suffix(')').and_then(|head| head.rfind('(')) {
        let inner = &t[open + 1..t.len() - 1];
        if inner.len() == 4 && inner.bytes().all(|b| b.is_ascii_digit()) {
            return t[..open].trim_end();
        }
    }
    t
}

// Outermost JSON array in `text` (handles ```json fences / preamble).
fn extract_json_array(text: &str) -> Option<&str> {
    let start = text.find('[')?;
    let end = text.rfind(']')?;
    (end > start).then(|| &text[start..=end])
}

#[cfg(test)]
mod tests;

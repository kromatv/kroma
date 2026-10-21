use std::collections::{HashMap, HashSet};

use serde::Deserialize;

use crate::db::CuratedRow;
use crate::services::sections::generate::slug;

use super::catalog::{CatalogEntry, MIN_ITEMS};
use super::prompt::MAX_LLM;

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
// ids: slug the key from the English (else any) title, reject empty/duplicate
// keys, and keep the non-empty localized title/reason maps. Shared by both
// resolvers.
fn build_row(
    spec: &CuratedSpec,
    member_ids: Vec<String>,
    seen_keys: &mut HashSet<String>,
) -> Option<CuratedRow> {
    let title_for_slug = spec
        .title
        .get("en")
        .filter(|s| !s.trim().is_empty())
        .or_else(|| spec.title.values().find(|s| !s.trim().is_empty()))?;
    let key = slug(title_for_slug);
    if key.is_empty() || !seen_keys.insert(key.clone()) {
        return None;
    }
    let titles = clean_map(&spec.title);
    if titles.is_empty() {
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

// Trim and drop empty-string entries from a locale -> string map.
fn clean_map(m: &HashMap<String, String>) -> HashMap<String, String> {
    m.iter()
        .filter(|(_, v)| !v.trim().is_empty())
        .map(|(k, v)| (k.clone(), v.trim().to_string()))
        .collect()
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
mod tests {
    use super::super::fixtures::entry;
    use super::*;

    #[test]
    fn parse_and_resolve_matches_titles() {
        let reply = r#"Here:```json
        [{"title":{"fr":"Horreur","en":"Best Horror"},"reason":{"fr":"r","en":"scary"},
          "members":["The Shining","Hereditary","Made Up Film","The Mask","It","Alien"]}]```"#;
        let specs = parse_curate(reply).unwrap();
        assert_eq!(specs.len(), 1);
        assert_eq!(
            specs[0].title.get("en").map(String::as_str),
            Some("Best Horror")
        );
        let cat = vec![
            entry("a", "The Shining", 8.0, ""),
            entry("b", "Hereditary", 7.0, ""),
            entry("c", "The Mask", 6.0, ""),
            entry("d", "It", 7.0, ""),
            entry("e", "Alien", 8.0, ""),
        ];
        let (rows, dropped) = resolve_members(&specs, &cat);
        assert_eq!(dropped, 0);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].key, "best-horror");
        assert_eq!(rows[0].item_ids.len(), 5); // "Made Up Film" dropped (not in catalog)
    }

    #[test]
    fn collection_below_min_is_dropped() {
        let specs = parse_curate(r#"[{"title":{"en":"Tiny"},"members":["A","B"]}]"#).unwrap();
        let cat = vec![entry("a", "A", 1.0, ""), entry("b", "B", 1.0, "")];
        let (rows, dropped) = resolve_members(&specs, &cat);
        assert!(rows.is_empty());
        assert_eq!(dropped, 1);
    }

    #[test]
    fn resolve_by_id_matches_catalog_ids() {
        // Tool-driven path: members are catalog ids; unknown ids are dropped.
        let specs = parse_curate(
            r#"[{"title":{"en":"Nolan","fr":"Nolan"},"members":["a","b","c","zzz","d","e"]}]"#,
        )
        .unwrap();
        let cat: Vec<CatalogEntry> = ["a", "b", "c", "d", "e"]
            .iter()
            .map(|id| entry(id, id, 5.0, ""))
            .collect();
        let (rows, dropped) = resolve_members_by_id(&specs, &cat);
        assert_eq!(dropped, 0);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].item_ids, ["a", "b", "c", "d", "e"]); // "zzz" not in catalog
        assert_eq!(rows[0].key, "nolan");
    }

    #[test]
    fn two_collections_that_slug_the_same_are_published_once() {
        let specs = parse_curate(
            r#"[{"title":{"en":"Slow Burn"},"members":["a","b","c","d","e"]},
                {"title":{"en":"slow  burn!"},"members":["a","b","c","d","e"]}]"#,
        )
        .unwrap();
        let cat: Vec<CatalogEntry> = ["a", "b", "c", "d", "e"]
            .iter()
            .map(|id| entry(id, id, 5.0, ""))
            .collect();

        let (rows, dropped) = resolve_members_by_id(&specs, &cat);
        assert_eq!(
            dropped, 0,
            "the duplicate resolved fine; it is the key that collides"
        );
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].key, "slow-burn");
    }

    #[test]
    fn a_title_that_slugs_to_nothing_is_not_a_collection() {
        let specs = parse_curate(r#"[{"title":{"en":"!!! ???"},"members":["a","b","c","d","e"]}]"#)
            .unwrap();
        let cat: Vec<CatalogEntry> = ["a", "b", "c", "d", "e"]
            .iter()
            .map(|id| entry(id, id, 5.0, ""))
            .collect();

        assert!(resolve_members_by_id(&specs, &cat).0.is_empty());
    }

    #[test]
    fn normalize_title_and_strip_year() {
        assert_eq!(normalize_title("Le Parrain (1972)"), "leparrain");
        assert_eq!(normalize_title("Le Parrain"), "leparrain");
        // Punctuation and separators are stripped; letters lowercased.
        assert_eq!(
            normalize_title("The Godfather: Part II"),
            "thegodfatherpartii"
        );
        // A bare-number title keeps its digits (only a parenthesized year is dropped).
        assert_eq!(normalize_title("1917"), "1917");
        assert_eq!(strip_year("Alien (1979)"), "Alien");
        assert_eq!(strip_year("Se7en"), "Se7en");
        // Non-4-digit parenthetical is not treated as a year.
        assert_eq!(strip_year("Movie (12)"), "Movie (12)");
    }

    #[test]
    fn extract_json_array_handles_fences_and_missing() {
        assert_eq!(extract_json_array("noise [1,2] tail"), Some("[1,2]"));
        assert_eq!(extract_json_array("```json\n[{}]\n```"), Some("[{}]"));
        assert!(extract_json_array("no array here").is_none());
        assert!(extract_json_array("]before[").is_none()); // end <= start
    }

    #[test]
    fn parse_curate_rejects_non_array() {
        assert!(parse_curate("just prose, no json").is_err());
    }

    #[test]
    fn resolve_members_dedups_within_a_collection() {
        // Same id twice in members -> counted once.
        let specs = parse_curate(r#"[{"title":{"en":"Dup"},"members":["a","a","b","c","d","e"]}]"#)
            .unwrap();
        let cat: Vec<CatalogEntry> = ["a", "b", "c", "d", "e"]
            .iter()
            .map(|id| entry(id, id, 1.0, ""))
            .collect();
        let (rows, _) = resolve_members_by_id(&specs, &cat);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].item_ids.len(), 5); // "a" deduped
    }
}

use std::collections::{HashMap, HashSet};

use crate::db::CuratedRow;
use crate::i18n;
use crate::model::{Kind, MediaItem, Show};
use crate::services::sections::generate::slug;

// Build a `locale -> value` map over every [`i18n::SUPPORTED_LOCALES`] entry.
fn per_locale(mut f: impl FnMut(&str) -> String) -> HashMap<String, String> {
    i18n::SUPPORTED_LOCALES
        .iter()
        .map(|&l| (l.to_string(), f(l)))
        .collect()
}

/// Minimum members for a collection to be worth keeping.
pub const MIN_ITEMS: usize = 5;
// Cap on deterministic director collections (most prolific directors first).
const MAX_DIRECTORS: usize = 12;
// Crew jobs that count as "directed/created by" for director collections.
const DIRECTING_JOBS: &[&str] = &["Director", "Creator"];

/// A recommendable entity (movie or show) flattened for curation.
pub struct CatalogEntry {
    pub id: String,
    pub title: String,
    pub year: Option<u32>,
    pub rating: f32,
    pub genres: Vec<String>,
    pub directors: Vec<String>,
}

/// Flatten movies/videos (skip episodes) + shows into catalog entries.
pub fn build_catalog(items: &[MediaItem], shows: &[Show]) -> Vec<CatalogEntry> {
    let mut out = Vec::new();
    for it in items {
        if it.kind == Kind::Episode {
            continue;
        }
        let (rating, genres, directors) = meta_bits(it.metadata.as_ref());
        out.push(CatalogEntry {
            id: it.id.clone(),
            title: it.title.clone(),
            year: it.year,
            rating,
            genres,
            directors,
        });
    }
    for s in shows {
        let (rating, genres, directors) = meta_bits(s.metadata.as_ref());
        out.push(CatalogEntry {
            id: s.id.clone(),
            title: s.title.clone(),
            year: s.year,
            rating,
            genres,
            directors,
        });
    }
    out
}

fn meta_bits(meta: Option<&crate::model::Metadata>) -> (f32, Vec<String>, Vec<String>) {
    match meta {
        Some(m) => {
            let mut seen = HashSet::new();
            let directors = m
                .crew
                .iter()
                .filter(|c| DIRECTING_JOBS.contains(&c.job.as_str()))
                .filter(|c| seen.insert(c.name.as_str()))
                .map(|c| c.name.clone())
                .collect();
            (m.rating.unwrap_or(0.0), m.genres.clone(), directors)
        }
        None => (0.0, Vec::new(), Vec::new()),
    }
}

/// Group the catalog by director and emit a collection per director with at
/// least [`MIN_ITEMS`] titles (members highest-rated first). Most prolific
/// directors first, capped at [`MAX_DIRECTORS`].
pub fn director_collections(catalog: &[CatalogEntry]) -> Vec<CuratedRow> {
    let mut by_director: HashMap<&str, Vec<&CatalogEntry>> = HashMap::new();
    for e in catalog {
        for d in &e.directors {
            by_director.entry(d.as_str()).or_default().push(e);
        }
    }
    let mut groups: Vec<(&str, Vec<&CatalogEntry>)> = by_director
        .into_iter()
        .filter(|(_, v)| v.len() >= MIN_ITEMS)
        .collect();
    // Biggest filmographies first; name as a stable tiebreak.
    groups.sort_by(|a, b| b.1.len().cmp(&a.1.len()).then_with(|| a.0.cmp(b.0)));

    groups
        .into_iter()
        .take(MAX_DIRECTORS)
        .map(|(name, mut films)| {
            films.sort_by(|a, b| b.rating.total_cmp(&a.rating));
            CuratedRow {
                key: slug(&format!("dir-{name}")),
                rank: 0,
                source: "director".to_string(),
                item_ids: films.iter().map(|e| e.id.clone()).collect(),
                // The director's name is language-invariant; the reason is
                // localized per supported language via the shared i18n catalog.
                titles: per_locale(|_| name.to_string()),
                reasons: per_locale(|l| i18n::t(l, "content.directedBy", &[("name", name)])),
            }
        })
        .collect()
}

/// Sort the catalog by rating (then recency) and keep the top `max` the slice
/// of titles handed to the model so the prompt stays within a sane token budget.
pub fn prune_for_prompt(catalog: &[CatalogEntry], max: usize) -> Vec<&CatalogEntry> {
    let mut refs: Vec<&CatalogEntry> = catalog.iter().collect();
    refs.sort_by(|a, b| {
        b.rating
            .total_cmp(&a.rating)
            .then_with(|| b.year.unwrap_or(0).cmp(&a.year.unwrap_or(0)))
    });
    refs.truncate(max);
    refs
}

#[cfg(test)]
mod tests {
    use super::super::fixtures::{entry, entry_year, item, meta};
    use super::*;

    #[test]
    fn director_collection_groups_min_items() {
        let cat: Vec<CatalogEntry> = (0..6)
            .map(|i| {
                entry(
                    &format!("m{i}"),
                    &format!("Film {i}"),
                    i as f32,
                    "Denis Villeneuve",
                )
            })
            .chain(std::iter::once(entry("x", "Solo", 9.0, "Someone Else")))
            .collect();
        let rows = director_collections(&cat);
        assert_eq!(rows.len(), 1); // only Villeneuve clears MIN_ITEMS
        assert_eq!(
            rows[0].titles.get("en").map(String::as_str),
            Some("Denis Villeneuve")
        );
        assert_eq!(
            rows[0].titles.get("fr").map(String::as_str),
            Some("Denis Villeneuve")
        );
        assert_eq!(rows[0].item_ids.len(), 6);
        assert_eq!(rows[0].item_ids[0], "m5"); // highest-rated first
    }

    #[test]
    fn build_catalog_skips_episodes_and_flattens_shows() {
        let items = vec![
            item(
                "m1",
                "Movie One",
                Kind::Movie,
                Some(meta(8.0, &["Drama"], &["Kubrick"])),
            ),
            item("e1", "Episode", Kind::Episode, None), // skipped
            item("v1", "Clip", Kind::Video, None),      // kept (not an episode)
        ];
        let shows = vec![Show {
            id: "s1".into(),
            title: "Show One".into(),
            year: Some(2010),
            library: "lib".into(),
            season_count: 1,
            episode_count: 3,
            video: None,
            added_at: "t".into(),
            metadata: Some(meta(7.5, &["Comedy"], &["Someone"])),
            progress: None,
        }];
        let cat = build_catalog(&items, &shows);
        let ids: Vec<&str> = cat.iter().map(|e| e.id.as_str()).collect();
        assert!(ids.contains(&"m1"));
        assert!(ids.contains(&"v1"));
        assert!(ids.contains(&"s1"));
        assert!(!ids.contains(&"e1")); // episode excluded
        let m1 = cat.iter().find(|e| e.id == "m1").unwrap();
        assert_eq!(m1.rating, 8.0);
        assert_eq!(m1.directors, vec!["Kubrick"]);
        // No metadata -> zeroed bits.
        let v1 = cat.iter().find(|e| e.id == "v1").unwrap();
        assert_eq!(v1.rating, 0.0);
        assert!(v1.genres.is_empty());
    }

    #[test]
    fn a_person_credited_twice_joins_their_collection_once() {
        let items: Vec<MediaItem> = (0..MIN_ITEMS)
            .map(|i| {
                item(
                    &format!("m{i}"),
                    &format!("Film {i}"),
                    Kind::Movie,
                    Some(meta(8.0, &["Drama"], &["Villeneuve", "Villeneuve"])),
                )
            })
            .collect();

        let cat = build_catalog(&items, &[]);
        let rows = director_collections(&cat);

        assert_eq!(cat[0].directors, vec!["Villeneuve"]);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].item_ids.len(), MIN_ITEMS);
    }

    #[test]
    fn prune_for_prompt_sorts_by_rating_then_year_and_truncates() {
        let cat = vec![
            entry_year("a", "A", 5.0, 1990),
            entry_year("b", "B", 9.0, 2000),
            entry_year("c", "C", 9.0, 2020), // same rating as b, newer year
            entry_year("d", "D", 1.0, 2024),
        ];
        let pruned = prune_for_prompt(&cat, 3);
        let ids: Vec<&str> = pruned.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(ids, vec!["c", "b", "a"]); // 9.0/2020, 9.0/2000, 5.0, and "d" truncated
    }
}

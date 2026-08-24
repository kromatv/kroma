//! Persistence for global editorial curated collections (the `sections.curate`
//! job): a replace-all set, read by the `curated` home source. Members are
//! resolved to real item/show ids at write time so serving is a plain hydrate.

use std::collections::{HashMap, HashSet};

use super::translations::{self, TransData};
use super::*;

/// One curated collection. `item_ids` are resolved member ids (movies or shows);
/// `source` is `"director"` (deterministic) or `"llm"` (editorial). The localized
/// `titles`/`reasons` (locale -> string) live in the generic `translations` cache
/// (`subject_kind='curated'`), not in per-language columns.
#[derive(Debug, Clone, Default)]
pub struct CuratedRow {
    pub key: String,
    pub rank: i64,
    pub source: String,
    pub item_ids: Vec<String>,
    pub titles: HashMap<String, String>,
    pub reasons: HashMap<String, String>,
}

/// All curated collections, lowest `rank` first, with every stored language's
/// title/reason hydrated from the translation cache.
pub fn get_curated(pool: &Pool) -> Result<Vec<CuratedRow>> {
    let mut rows: Vec<CuratedRow> = {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT key, rank, source, item_ids FROM curated_sections ORDER BY rank ASC",
        )?;
        let mapped = stmt.query_map([], |r| {
            let ids_json: String = r.get(3)?;
            Ok(CuratedRow {
                key: r.get(0)?,
                rank: r.get(1)?,
                source: r.get(2)?,
                item_ids: serde_json::from_str(&ids_json).unwrap_or_default(),
                titles: HashMap::new(),
                reasons: HashMap::new(),
            })
        })?;
        mapped.collect::<rusqlite::Result<Vec<_>>>()?
    };
    // Hydrate localized title/reason (all languages) from the translation cache.
    let keys: Vec<&str> = rows.iter().map(|r| r.key.as_str()).collect();
    let mut by_key = translations::load_all(pool, "curated", &keys)?;
    for row in &mut rows {
        if let Some(by_lang) = by_key.remove(&row.key) {
            for (lang, data) in by_lang {
                if let Some(t) = data.title {
                    row.titles.insert(lang.clone(), t);
                }
                if let Some(rs) = data.reason {
                    row.reasons.insert(lang, rs);
                }
            }
        }
    }
    Ok(rows)
}

/// Replace the entire curated set in one transaction (the job regenerates it):
/// the base rows in `curated_sections`, the localized title/reason per language
/// in `translations` (`subject_kind='curated'`).
pub fn set_curated(pool: &Pool, rows: &[CuratedRow]) -> Result<()> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM curated_sections", [])?;
    tx.execute(
        "DELETE FROM translations WHERE subject_kind = 'curated'",
        [],
    )?;
    let now = kroma_primitives::now_ms();
    // Skip duplicate keys: the director + LLM producers can independently emit the
    // same slug (e.g. two spellings of a director's name normalize alike). `key`
    // is the PRIMARY KEY, so a plain INSERT of a dup would abort the whole
    // transaction and wipe out every curated row keep the first, drop the rest.
    let mut seen = HashSet::new();
    for row in rows {
        if !seen.insert(row.key.as_str()) {
            continue;
        }
        let ids = serde_json::to_string(&row.item_ids).unwrap_or_else(|_| "[]".into());
        tx.execute(
            "INSERT INTO curated_sections (key, rank, source, item_ids, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![row.key, row.rank, row.source, ids, now],
        )?;
        let langs: HashSet<&str> = row
            .titles
            .keys()
            .chain(row.reasons.keys())
            .map(String::as_str)
            .collect();
        for lang in langs {
            let data = TransData {
                title: row.titles.get(lang).cloned(),
                reason: row.reasons.get(lang).cloned(),
                ..Default::default()
            };
            translations::write(&tx, "curated", &row.key, lang, translations::LLM, &data)?;
        }
    }
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::TempPool;
    use std::collections::HashMap;

    fn pool() -> TempPool {
        crate::testing::temp_pool("cur")
    }

    fn map(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn set_get_roundtrip_ordering_and_dedup() {
        let p = pool();
        let rows = vec![
            CuratedRow {
                key: "spielberg".into(),
                rank: 0,
                source: "director".into(),
                item_ids: vec!["m1".into(), "m2".into()],
                titles: map(&[("fr", "Spielberg"), ("en", "Spielberg")]),
                reasons: map(&[("fr", "le maitre")]),
            },
            CuratedRow {
                key: "horror".into(),
                rank: 1,
                source: "llm".into(),
                item_ids: vec![],
                titles: map(&[("en", "Best Horror")]),
                reasons: HashMap::new(),
            },
            // Duplicate key: skipped (kept the first).
            CuratedRow {
                key: "spielberg".into(),
                rank: 2,
                source: "llm".into(),
                ..Default::default()
            },
        ];
        set_curated(&p, &rows).unwrap();

        let got = get_curated(&p).unwrap();
        assert_eq!(got.len(), 2, "duplicate key dropped");
        // Ordered by rank ascending.
        assert_eq!(got[0].key, "spielberg");
        assert_eq!(got[0].source, "director");
        assert_eq!(got[0].item_ids, vec!["m1".to_string(), "m2".to_string()]);
        assert_eq!(
            got[0].titles.get("fr").map(String::as_str),
            Some("Spielberg")
        );
        assert_eq!(
            got[0].titles.get("en").map(String::as_str),
            Some("Spielberg")
        );
        assert_eq!(
            got[0].reasons.get("fr").map(String::as_str),
            Some("le maitre")
        );
        assert!(!got[0].reasons.contains_key("en"));
        assert_eq!(got[1].key, "horror");

        // Replace-all: a fresh set supersedes the previous one entirely.
        set_curated(
            &p,
            &[CuratedRow {
                key: "solo".into(),
                rank: 0,
                source: "llm".into(),
                ..Default::default()
            }],
        )
        .unwrap();
        let got = get_curated(&p).unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].key, "solo");
    }
}

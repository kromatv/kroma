//! Persistence for per-item **AI suggestions** ("Suggestions IA" on the detail
//! page): one cached row per seed item, generated lazily by the LLM connector
//! (`crate::services::llm::suggest_for`) and served as a plain hydrate. Empty
//! `item_ids` is a terminal "tried, nothing usable" marker (so the client stops
//! polling instead of re-triggering generation forever).

use std::collections::HashMap;

use super::translations::{self, TransData};
use super::{params, Pool, Result};

use rusqlite::OptionalExtension;

const ASKED_BEFORE_THE_RECORD: &[&str] = &["en", "fr"];

/// A cached AI-suggestion row: resolved member ids, a localized one-line reason
/// per language (`locale -> reason`, from the `translations` cache), and the
/// content locales the generation was asked for, whether or not the model
/// answered in each. A row written before that was recorded reads as asked for
/// `en` and `fr`, the two languages that existed.
#[derive(Debug, Clone, Default)]
pub struct SuggestionRow {
    pub item_ids: Vec<String>,
    pub reasons: HashMap<String, String>,
    pub asked_locales: Vec<String>,
}

fn asked_locales(recorded: Option<String>) -> Vec<String> {
    recorded
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_else(|| ASKED_BEFORE_THE_RECORD.iter().map(ToString::to_string).collect())
}

/// The cached suggestion for one seed item, if generated. `Some` with empty
/// `item_ids` means generation ran but found nothing a terminal state.
pub fn get_suggestion(pool: &Pool, item_id: &str) -> Result<Option<SuggestionRow>> {
    let conn = pool.get()?;
    let base = conn
        .query_row(
            "SELECT item_ids, asked_langs FROM item_suggestions WHERE item_id = ?1",
            params![item_id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?)),
        )
        .optional()?;
    let Some((ids_json, recorded)) = base else {
        return Ok(None);
    };
    let mut row = SuggestionRow {
        item_ids: serde_json::from_str(&ids_json).unwrap_or_default(),
        reasons: HashMap::new(),
        asked_locales: asked_locales(recorded),
    };
    for by_lang in translations::load_all(pool, "suggestion", &[item_id])?.into_values() {
        for (lang, data) in by_lang {
            if let Some(reason) = data.reason {
                row.reasons.insert(lang, reason);
            }
        }
    }
    Ok(Some(row))
}

/// Upsert the cached suggestion for one seed item: the base row (ids) plus one
/// localized reason per language in the `translations` cache. `reasons` is
/// `locale -> reason` (empty for the terminal "nothing found" marker), and
/// `asked` the content locales the generation was asked for.
pub fn set_suggestion(
    pool: &Pool,
    item_id: &str,
    ids: &[String],
    reasons: &HashMap<String, String>,
    asked: &[&str],
) -> Result<()> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    let ids_json = serde_json::to_string(ids).unwrap_or_else(|_| "[]".into());
    let asked_json = serde_json::to_string(asked).unwrap_or_else(|_| "[]".into());
    tx.execute(
        "INSERT INTO item_suggestions (item_id, item_ids, asked_langs, updated_at) \
         VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(item_id) DO UPDATE SET item_ids=excluded.item_ids, \
             asked_langs=excluded.asked_langs, updated_at=excluded.updated_at",
        params![item_id, ids_json, asked_json, kroma_primitives::now_ms()],
    )?;
    // Replace this seed's reasons wholesale (a fresh generation supersedes them).
    tx.execute(
        "DELETE FROM translations WHERE subject_kind='suggestion' AND subject_id=?1",
        params![item_id],
    )?;
    for (lang, reason) in reasons {
        if reason.trim().is_empty() {
            continue;
        }
        let data = TransData {
            reason: Some(reason.clone()),
            ..Default::default()
        };
        translations::write(&tx, "suggestion", item_id, lang, translations::LLM, &data)?;
    }
    tx.commit()?;
    Ok(())
}

/// Records that the cached suggestion of one seed item was asked for `asked`
/// too, leaving its members and its reasons as they are: what a generation
/// that came back with nothing owes a row worth keeping. A seed with no cached
/// row is left without one.
pub fn mark_suggestion_asked(pool: &Pool, item_id: &str, asked: &[&str]) -> Result<()> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    let recorded = tx
        .query_row(
            "SELECT asked_langs FROM item_suggestions WHERE item_id = ?1",
            params![item_id],
            |r| r.get::<_, Option<String>>(0),
        )
        .optional()?;
    let Some(recorded) = recorded else {
        return Ok(());
    };
    let mut locales = asked_locales(recorded);
    for locale in asked {
        if !locales.iter().any(|known| known == locale) {
            locales.push((*locale).to_string());
        }
    }
    let asked_json = serde_json::to_string(&locales).unwrap_or_else(|_| "[]".into());
    tx.execute(
        "UPDATE item_suggestions SET asked_langs = ?2 WHERE item_id = ?1",
        params![item_id, asked_json],
    )?;
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::TempPool;
    use std::collections::HashMap;

    const ASKED: &[&str] = &["en", "fr"];

    fn pool() -> TempPool {
        crate::testing::temp_pool("sug")
    }

    fn reason(locale: &str, text: &str) -> HashMap<String, String> {
        HashMap::from([(locale.to_string(), text.to_string())])
    }

    #[test]
    fn set_get_and_terminal_marker() {
        let p = pool();
        assert!(get_suggestion(&p, "m1").unwrap().is_none());

        let mut reasons = HashMap::new();
        reasons.insert("fr".to_string(), "parce que".to_string());
        reasons.insert("en".to_string(), "  ".to_string()); // blank: skipped
        set_suggestion(&p, "m1", &["a".into(), "b".into()], &reasons, ASKED).unwrap();

        let row = get_suggestion(&p, "m1").unwrap().unwrap();
        assert_eq!(row.item_ids, vec!["a".to_string(), "b".to_string()]);
        assert_eq!(row.reasons.get("fr").map(String::as_str), Some("parce que"));
        assert!(!row.reasons.contains_key("en"), "blank reason not stored");

        // Regeneration replaces the reasons wholesale.
        let mut reasons2 = HashMap::new();
        reasons2.insert("en".to_string(), "now english".to_string());
        set_suggestion(&p, "m1", &["c".into()], &reasons2, ASKED).unwrap();
        let row = get_suggestion(&p, "m1").unwrap().unwrap();
        assert_eq!(row.item_ids, vec!["c".to_string()]);
        assert!(!row.reasons.contains_key("fr"), "old fr reason superseded");
        assert_eq!(
            row.reasons.get("en").map(String::as_str),
            Some("now english")
        );

        // Empty item_ids is a valid terminal "nothing found" marker (Some, not None).
        set_suggestion(&p, "m1", &[], &HashMap::new(), ASKED).unwrap();
        let row = get_suggestion(&p, "m1").unwrap().unwrap();
        assert!(row.item_ids.is_empty());
        assert!(row.reasons.is_empty());
    }

    #[test]
    fn a_row_remembers_the_locales_it_was_generated_for() {
        let p = pool();

        set_suggestion(&p, "m1", &["a".into()], &reason("en", "because"), &["en", "pt-BR"]).unwrap();

        let row = get_suggestion(&p, "m1").unwrap().unwrap();
        assert_eq!(row.asked_locales, ["en", "pt-BR"]);
    }

    #[test]
    fn a_row_written_before_the_record_reads_as_asked_for_the_two_languages_that_existed() {
        let p = pool();
        p.get()
            .unwrap()
            .execute(
                "INSERT INTO item_suggestions (item_id, item_ids, updated_at) VALUES ('m1', '[\"a\"]', 0)",
                [],
            )
            .unwrap();

        let row = get_suggestion(&p, "m1").unwrap().unwrap();

        assert_eq!(row.asked_locales, ["en", "fr"]);
    }

    #[test]
    fn marking_a_row_asked_adds_to_its_record_and_keeps_its_members_and_reasons() {
        let p = pool();
        set_suggestion(&p, "m1", &["a".into()], &reason("en", "because"), ASKED).unwrap();

        mark_suggestion_asked(&p, "m1", &["fr", "de"]).unwrap();

        let row = get_suggestion(&p, "m1").unwrap().unwrap();
        assert_eq!(row.asked_locales, ["en", "fr", "de"]);
        assert_eq!(row.item_ids, ["a"]);
        assert_eq!(row.reasons, reason("en", "because"));
    }

    #[test]
    fn marking_a_seed_with_no_row_caches_nothing() {
        let p = pool();

        mark_suggestion_asked(&p, "m1", &["de"]).unwrap();

        assert!(get_suggestion(&p, "m1").unwrap().is_none());
    }
}

//! One table for every localized string, keyed `(subject_kind, subject_id, lang)`
//! with `subject_kind` in `'item'|'show'|'episode'|'season_cast'|'curated'|'suggestion'`.
//! Reads fall back requested lang -> `en`, and read only those two, so a
//! catalog page costs the same whether the server stores two languages or ten.
#![allow(dead_code)]

use std::collections::HashMap;

const FALLBACK: &str = "en";

/// What a row is expected to carry. Bumped when the payload grows a field that
/// existing rows cannot have, so a catalog written before the change is refilled
/// instead of being mistaken for complete.
pub const REV: u32 = 2;

use serde::{Deserialize, Serialize};

use super::*;

/// Values for the `source` column.
pub const TMDB: &str = "tmdb";
pub const LLM: &str = "llm";
pub const MANUAL: &str = "manual";

/// The payload stored per `(subject, lang)`; every field is skip-if-empty so a row
/// only carries what its `subject_kind` needs.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TransData {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tagline: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub overview: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub genres: Vec<String>,
    // Aligned by index to the subject's core `cast` (or the season cast for `season_cast`).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub characters: Vec<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    // The poster and the logo carry the title as printed artwork; the backdrop
    // has no text on it and is kept once per title on the core row.
    #[serde(rename = "posterUrl", default, skip_serializing_if = "Option::is_none")]
    pub poster_url: Option<String>,
    #[serde(rename = "logoUrl", default, skip_serializing_if = "Option::is_none")]
    pub logo_url: Option<String>,
    /// The [`REV`] this row was written at; absent on everything written before
    /// revisions existed, which reads as 0 and so as stale.
    #[serde(default, skip_serializing_if = "is_zero")]
    pub rev: u32,
}

fn is_zero(v: &u32) -> bool {
    *v == 0
}

impl TransData {
    /// Whether the row would carry nothing at all. A revision on its own still
    /// carries something: it records that the language was asked for and had
    /// nothing, which is what stops it being asked again every pass.
    pub fn is_empty(&self) -> bool {
        self.rev == 0 && !self.has_text()
    }

    /// Whether the row says anything a reader would see. A row carrying only a
    /// revision is a marker that the language was asked for and had nothing:
    /// enough to stop asking, never enough to serve.
    fn has_text(&self) -> bool {
        !(self.title.is_none()
            && self.tagline.is_none()
            && self.overview.is_none()
            && self.genres.is_empty()
            && self.characters.is_empty()
            && self.reason.is_none()
            && self.poster_url.is_none()
            && self.logo_url.is_none())
    }
}

/// Upsert one `(subject, lang)` translation.
pub fn put(
    pool: &Pool,
    kind: &str,
    id: &str,
    lang: &str,
    source: &str,
    data: &TransData,
) -> Result<()> {
    let conn = pool.get()?;
    write(&conn, kind, id, lang, source, data)
}

/// Connection-level upsert, so a caller writing every language for one title
/// shares a single connection.
pub(crate) fn write(
    conn: &Connection,
    kind: &str,
    id: &str,
    lang: &str,
    source: &str,
    data: &TransData,
) -> Result<()> {
    let json = serde_json::to_string(data).unwrap_or_else(|_| "{}".into());
    conn.execute(
        "INSERT INTO translations (subject_kind,subject_id,lang,source,data,updated_at) \
         VALUES (?1,?2,?3,?4,?5,?6) \
         ON CONFLICT(subject_kind,subject_id,lang) DO UPDATE SET \
             source=excluded.source, data=excluded.data, updated_at=excluded.updated_at",
        params![kind, id, lang, source, json, kroma_primitives::now_ms()],
    )?;
    Ok(())
}

/// `None` only when the subject has no translations at all.
pub fn resolve_one(pool: &Pool, kind: &str, id: &str, lang: &str) -> Result<Option<TransData>> {
    let conn = pool.get()?;
    let mut raw = load_for(&conn, kind, &[id], lang)?;
    Ok(raw.remove(id).and_then(|by_lang| pick(by_lang, lang)))
}

/// Ids with no translation at all are absent from the returned map.
pub fn resolve_many(
    conn: &Connection,
    kind: &str,
    ids: &[&str],
    lang: &str,
) -> Result<HashMap<String, TransData>> {
    let raw = load_for(conn, kind, ids, lang)?;
    Ok(raw
        .into_iter()
        .filter_map(|(id, by_lang)| pick(by_lang, lang).map(|d| (id, d)))
        .collect())
}

/// Every stored translation for a subject kind, grouped by id (all languages).
pub fn all_for_kind(pool: &Pool, kind: &str) -> Result<HashMap<String, Vec<TransData>>> {
    let conn = pool.get()?;
    let mut stmt =
        conn.prepare("SELECT subject_id, data FROM translations WHERE subject_kind = ?1")?;
    let rows = stmt.query_map(params![kind], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    })?;
    let mut out: HashMap<String, Vec<TransData>> = HashMap::new();
    for row in rows {
        let (id, json) = row?;
        if let Ok(data) = serde_json::from_str::<TransData>(&json) {
            out.entry(id).or_default().push(data);
        }
    }
    Ok(out)
}

/// Which of `langs` this subject cannot serve from a current row: absent
/// entirely, or written before [`REV`] and so missing whatever that revision
/// added.
/// Whether any of `ids` still owes a current row for one of `langs`.
///
/// One query for a whole season, where asking per episode would be one each.
pub fn any_stale(pool: &Pool, kind: &str, ids: &[&str], langs: &[&str]) -> Result<bool> {
    if ids.is_empty() || langs.is_empty() {
        return Ok(false);
    }
    let stored = load_all(pool, kind, ids)?;
    Ok(ids.iter().any(|id| {
        let by_lang = stored.get(*id);
        langs.iter().any(|lang| {
            by_lang
                .and_then(|m| m.get(*lang))
                .is_none_or(|d| d.rev < REV)
        })
    }))
}

pub fn stale_langs(pool: &Pool, kind: &str, id: &str, langs: &[&str]) -> Result<Vec<String>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT lang, data FROM translations \
         WHERE subject_kind=?1 AND subject_id=?2 AND source=?3",
    )?;
    let rows = stmt.query_map(params![kind, id, TMDB], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    })?;
    let mut current: Vec<String> = Vec::new();
    for row in rows {
        let (lang, json) = row?;
        let rev = serde_json::from_str::<TransData>(&json)
            .map(|d| d.rev)
            .unwrap_or(0);
        if rev >= REV {
            current.push(lang);
        }
    }
    Ok(langs
        .iter()
        .filter(|l| !current.iter().any(|c| c == *l))
        .map(|l| (*l).to_string())
        .collect())
}

pub fn languages_for(pool: &Pool, kind: &str, id: &str) -> Result<Vec<String>> {
    let conn = pool.get()?;
    let mut stmt =
        conn.prepare("SELECT lang FROM translations WHERE subject_kind=?1 AND subject_id=?2")?;
    let rows = stmt.query_map(params![kind, id], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// `id -> (lang -> data)` with no fallback applied; the caller picks per locale.
pub fn load_all(
    pool: &Pool,
    kind: &str,
    ids: &[&str],
) -> Result<HashMap<String, HashMap<String, TransData>>> {
    let conn = pool.get()?;
    load(&conn, kind, ids)
}

/// Delete every language row for one subject.
pub fn delete_all(conn: &Connection, kind: &str, id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM translations WHERE subject_kind=?1 AND subject_id=?2",
        params![kind, id],
    )?;
    Ok(())
}

/// Art is never merged across rows: an absent field means the core's art is the
/// right one, so borrowing the fallback language's would hand a French reader an
/// English poster on every title whose French art is the core's.
fn pick(mut by_lang: HashMap<String, TransData>, lang: &str) -> Option<TransData> {
    let fallback = by_lang.remove(FALLBACK).filter(TransData::has_text);
    by_lang
        .remove(lang)
        .filter(TransData::has_text)
        .or(fallback)
}

fn load(
    conn: &Connection,
    kind: &str,
    ids: &[&str],
) -> Result<HashMap<String, HashMap<String, TransData>>> {
    load_langs(conn, kind, ids, &[])
}

fn load_for(
    conn: &Connection,
    kind: &str,
    ids: &[&str],
    lang: &str,
) -> Result<HashMap<String, HashMap<String, TransData>>> {
    load_langs(conn, kind, ids, &[lang, FALLBACK])
}

fn load_langs(
    conn: &Connection,
    kind: &str,
    ids: &[&str],
    langs: &[&str],
) -> Result<HashMap<String, HashMap<String, TransData>>> {
    let mut out: HashMap<String, HashMap<String, TransData>> = HashMap::new();
    let filter = match langs.len() {
        0 => String::new(),
        n => format!(" AND lang IN ({})", vec!["?"; n].join(",")),
    };
    let rows = super::query_by_subject_ids(
        conn,
        kind,
        ids,
        langs,
        |ph| {
            format!(
                "SELECT subject_id,lang,data FROM translations \
                 WHERE subject_kind=? AND subject_id IN ({ph}){filter}"
            )
        },
        |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        },
    )?;
    for (id, lang, json) in rows {
        let data = serde_json::from_str::<TransData>(&json).unwrap_or_default();
        out.entry(id).or_default().insert(lang, data);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::TempPool;

    fn pool() -> TempPool {
        crate::testing::temp_pool("trans")
    }

    fn td(title: &str) -> TransData {
        TransData {
            title: Some(title.into()),
            ..Default::default()
        }
    }

    #[test]
    fn is_empty_reports_payload_presence() {
        assert!(TransData::default().is_empty());
        assert!(!td("x").is_empty());
        assert!(!TransData {
            genres: vec!["Drama".into()],
            ..Default::default()
        }
        .is_empty());
        assert!(!TransData {
            reason: Some("because".into()),
            ..Default::default()
        }
        .is_empty());
    }

    #[test]
    fn resolve_one_fallback_chain() {
        let p = pool();
        put(
            &p,
            "show",
            "s1",
            "en",
            TMDB,
            &TransData {
                title: Some("Severance".into()),
                overview: Some("work you".into()),
                ..Default::default()
            },
        )
        .unwrap();
        put(&p, "show", "s1", "fr", TMDB, &td("Severance VF")).unwrap();

        assert_eq!(
            resolve_one(&p, "show", "s1", "fr")
                .unwrap()
                .unwrap()
                .title
                .as_deref(),
            Some("Severance VF")
        );
        assert_eq!(
            resolve_one(&p, "show", "s1", "de")
                .unwrap()
                .unwrap()
                .title
                .as_deref(),
            Some("Severance")
        );

        put(&p, "show", "s2", "ja", TMDB, &td("only ja")).unwrap();
        assert!(resolve_one(&p, "show", "s2", "de").unwrap().is_none());

        assert!(resolve_one(&p, "show", "missing", "fr").unwrap().is_none());
    }

    #[test]
    fn upsert_replaces_and_languages_listed() {
        let p = pool();
        put(&p, "item", "m1", "fr", TMDB, &td("old")).unwrap();
        put(&p, "item", "m1", "fr", MANUAL, &td("new")).unwrap();
        assert_eq!(
            resolve_one(&p, "item", "m1", "fr")
                .unwrap()
                .unwrap()
                .title
                .as_deref(),
            Some("new")
        );

        put(&p, "item", "m1", "en", TMDB, &td("en title")).unwrap();
        let mut langs = languages_for(&p, "item", "m1").unwrap();
        langs.sort();
        assert_eq!(langs, vec!["en".to_string(), "fr".to_string()]);
    }

    #[test]
    fn a_reader_in_the_primary_language_keeps_the_primary_art() {
        let p = pool();
        put(
            &p,
            "item",
            "m1",
            "fr",
            TMDB,
            &TransData {
                title: Some("VF".into()),
                ..TransData::default()
            },
        )
        .unwrap();
        put(
            &p,
            "item",
            "m1",
            "en",
            TMDB,
            &TransData {
                title: Some("EN".into()),
                poster_url: Some("/en.webp".into()),
                ..TransData::default()
            },
        )
        .unwrap();

        let fr = resolve_one(&p, "item", "m1", "fr").unwrap().unwrap();

        assert_eq!(fr.poster_url, None);
    }

    #[test]
    fn a_row_written_before_the_payload_grew_counts_as_stale() {
        let p = pool();
        for lang in ["fr", "en"] {
            put(
                &p,
                "item",
                "m1",
                lang,
                TMDB,
                &TransData {
                    title: Some(lang.into()),
                    ..TransData::default()
                },
            )
            .unwrap();
        }

        let stale = stale_langs(&p, "item", "m1", &["fr", "en"]).unwrap();
        assert_eq!(stale.len(), 2);

        put(
            &p,
            "item",
            "m1",
            "en",
            TMDB,
            &TransData {
                title: Some("EN".into()),
                rev: REV,
                ..TransData::default()
            },
        )
        .unwrap();

        assert_eq!(
            stale_langs(&p, "item", "m1", &["fr", "en"]).unwrap(),
            ["fr"]
        );
    }

    #[test]
    fn the_poster_follows_the_reader_and_the_backdrop_does_not() {
        let p = pool();
        put(
            &p,
            "item",
            "m1",
            "fr",
            TMDB,
            &TransData {
                title: Some("VF".into()),
                ..TransData::default()
            },
        )
        .unwrap();
        put(
            &p,
            "item",
            "m1",
            "en",
            TMDB,
            &TransData {
                title: Some("EN".into()),
                poster_url: Some("/en.webp".into()),
                logo_url: Some("/en-logo.png".into()),
                ..TransData::default()
            },
        )
        .unwrap();

        let en = resolve_one(&p, "item", "m1", "en").unwrap().unwrap();
        assert_eq!(en.poster_url.as_deref(), Some("/en.webp"));
        assert_eq!(en.logo_url.as_deref(), Some("/en-logo.png"));

        let fr = resolve_one(&p, "item", "m1", "fr").unwrap().unwrap();
        assert_eq!(fr.poster_url, None);
        assert_eq!(fr.logo_url, None);
    }

    #[test]
    fn a_reader_costs_two_rows_however_many_languages_the_server_stores() {
        let p = pool();
        for lang in ["en", "fr", "de", "ja", "pt", "es", "it", "nl"] {
            put(&p, "show", "s1", lang, TMDB, &td(lang)).unwrap();
        }

        let conn = p.get().unwrap();
        let served = load_for(&conn, "show", &["s1"], "fr").unwrap();

        let langs = &served["s1"];
        assert_eq!(langs.len(), 2);
        assert!(langs.contains_key("fr"));
        assert!(langs.contains_key("en"));
    }

    #[test]
    fn resolve_many_all_for_kind_and_load_all() {
        let p = pool();
        put(&p, "show", "s1", "en", TMDB, &td("A en")).unwrap();
        put(&p, "show", "s1", "fr", TMDB, &td("A fr")).unwrap();
        put(&p, "show", "s2", "ja", TMDB, &td("B ja")).unwrap();
        // A different kind must not leak into the show queries.
        put(&p, "item", "s1", "en", TMDB, &td("other kind")).unwrap();

        let conn = p.get().unwrap();
        let many = resolve_many(&conn, "show", &["s1", "s2", "ghost"], "fr").unwrap();
        assert_eq!(many.len(), 1);
        assert_eq!(many["s1"].title.as_deref(), Some("A fr"));
        assert!(!many.contains_key("s2"));
        drop(conn);

        let all = all_for_kind(&p, "show").unwrap();
        assert_eq!(all["s1"].len(), 2);
        assert_eq!(all["s2"].len(), 1);
        assert!(!all.contains_key("ghost"));

        let loaded = load_all(&p, "show", &["s1"]).unwrap();
        let by_lang = &loaded["s1"];
        assert_eq!(by_lang.len(), 2);
        assert_eq!(by_lang["en"].title.as_deref(), Some("A en"));
        assert_eq!(by_lang["fr"].title.as_deref(), Some("A fr"));
    }

    #[test]
    fn a_table_that_is_no_longer_there_surfaces_as_an_error_rather_than_silence() {
        let p = pool();
        p.get()
            .unwrap()
            .execute_batch("DROP TABLE translations")
            .unwrap();

        assert!(put(&p, "show", "s1", "en", TMDB, &td("A")).is_err());
        let conn = p.get().unwrap();
        assert!(delete_all(&conn, "show", "s1").is_err());
        assert!(resolve_many(&conn, "show", &["s1"], "fr").is_err());
    }

    #[test]
    fn delete_all_removes_every_language() {
        let p = pool();
        put(&p, "show", "s1", "en", TMDB, &td("A")).unwrap();
        put(&p, "show", "s1", "fr", TMDB, &td("B")).unwrap();
        let conn = p.get().unwrap();
        delete_all(&conn, "show", "s1").unwrap();
        drop(conn);
        assert!(resolve_one(&p, "show", "s1", "fr").unwrap().is_none());
        assert!(languages_for(&p, "show", "s1").unwrap().is_empty());
    }
}

use std::collections::HashMap;

use anyhow::Result;
use rusqlite::{Connection, params_from_iter};

use kroma_domain::{CalendarEntry, RequestKind};

use crate::chunked::IN_CHUNK;
use crate::{metadata_core, translations};

/// Names every show episode in `entries` from `episode_guide`, in `lang` where
/// the catalog holds a translation of it. A show the library does not hold has
/// no guide, so its rows keep the `None` they came with.
pub fn fill_episode_titles(
    conn: &Connection,
    entries: &mut [CalendarEntry],
    lang: &str,
) -> Result<()> {
    let shows = show_ids_by_tmdb(conn, entries)?;
    if shows.is_empty() {
        return Ok(());
    }
    let keys: Vec<Option<String>> = entries.iter().map(|e| guide_key(e, &shows)).collect();
    let refs: Vec<&str> = keys.iter().filter_map(Option::as_deref).collect();
    let guide = guide_titles(conn, &refs)?;
    let translated = translations::resolve_many(conn, "episode_guide", &refs, lang)?;
    for (entry, key) in entries.iter_mut().zip(&keys) {
        let Some(key) = key else { continue };
        entry.episode_title = translated
            .get(key)
            .and_then(|t| t.title.clone())
            .or_else(|| guide.get(key).cloned());
    }
    Ok(())
}

fn guide_key(entry: &CalendarEntry, shows: &HashMap<u64, String>) -> Option<String> {
    if entry.kind != RequestKind::Show {
        return None;
    }
    let show = shows.get(&entry.tmdb_id)?;
    Some(format!("{show}:{}:{}", entry.season?, entry.episode?))
}

fn show_ids_by_tmdb(
    conn: &Connection,
    entries: &[CalendarEntry],
) -> rusqlite::Result<HashMap<u64, String>> {
    let mut wanted: Vec<i64> = entries
        .iter()
        .filter(|e| e.kind == RequestKind::Show)
        .map(|e| e.tmdb_id as i64)
        .collect();
    wanted.sort_unstable();
    wanted.dedup();
    let mut out = HashMap::new();
    for chunk in wanted.chunks(IN_CHUNK) {
        let ph = vec!["?"; chunk.len()].join(",");
        let mut stmt = conn.prepare(&format!(
            "SELECT tmdb_id, subject_id FROM metadata_core \
             WHERE subject_kind = '{}' AND tmdb_id IN ({ph})",
            metadata_core::SHOW
        ))?;
        let rows = stmt.query_map(params_from_iter(chunk.iter()), |r| {
            Ok((r.get::<_, i64>(0)? as u64, r.get::<_, String>(1)?))
        })?;
        for row in rows {
            let (tmdb_id, show_id) = row?;
            out.insert(tmdb_id, show_id);
        }
    }
    Ok(out)
}

fn guide_titles(conn: &Connection, keys: &[&str]) -> rusqlite::Result<HashMap<String, String>> {
    let mut out = HashMap::new();
    for chunk in keys.chunks(IN_CHUNK) {
        let ph = vec!["?"; chunk.len()].join(",");
        let mut stmt = conn.prepare(&format!(
            "SELECT show_id || ':' || season || ':' || episode AS key, title \
             FROM episode_guide WHERE title IS NOT NULL AND key IN ({ph})"
        ))?;
        let rows = stmt.query_map(params_from_iter(chunk.iter()), |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })?;
        for row in rows {
            let (key, title) = row?;
            out.insert(key, title);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Pool;
    use crate::requests::tests::*;
    use crate::translations::TransData;
    use kroma_domain::ListedEpisode;

    fn seed_guide(p: &Pool, show_id: &str, tmdb_id: u64, title: &str) {
        seed_show(p, show_id);
        p.get()
            .unwrap()
            .execute(
                "INSERT INTO metadata_core (subject_kind, subject_id, tmdb_id, updated_at) \
                 VALUES ('show', ?1, ?2, 0)",
                rusqlite::params![show_id, tmdb_id as i64],
            )
            .unwrap();
        crate::replace_episode_guide(
            p,
            show_id,
            1,
            &[ListedEpisode {
                episode: 3,
                title: Some(title.into()),
                overview: None,
                air_date: None,
                still_url: None,
            }],
        )
        .unwrap();
    }

    fn episode_entry(tmdb_id: u64, season: u32, episode: u32) -> CalendarEntry {
        CalendarEntry {
            request_id: None,
            tmdb_id,
            kind: RequestKind::Show,
            title: "Severance".into(),
            year: None,
            poster_url: None,
            season: Some(season),
            episode: Some(episode),
            episode_title: None,
            air_date: None,
            status: "wanted".into(),
        }
    }

    #[test]
    fn an_episode_is_named_in_the_readers_language_when_the_catalog_holds_one() {
        let p = pool();
        seed_guide(&p, "s1", 95396, "In Perpetuity");
        translations::put(
            &p,
            "episode_guide",
            "s1:1:3",
            "fr",
            translations::TMDB,
            &TransData {
                title: Some("À perpétuité".into()),
                ..Default::default()
            },
        )
        .unwrap();

        let mut entries = vec![episode_entry(95396, 1, 3)];
        fill_episode_titles(&p.get().unwrap(), &mut entries, "fr").unwrap();

        assert_eq!(entries[0].episode_title.as_deref(), Some("À perpétuité"));
    }

    #[test]
    fn an_untranslated_episode_falls_back_to_the_guide_and_a_show_off_disk_stays_unnamed() {
        let p = pool();
        seed_guide(&p, "s1", 95396, "In Perpetuity");

        let mut entries = vec![episode_entry(95396, 1, 3), episode_entry(1396, 1, 1)];
        fill_episode_titles(&p.get().unwrap(), &mut entries, "fr").unwrap();

        assert_eq!(entries[0].episode_title.as_deref(), Some("In Perpetuity"));
        assert_eq!(entries[1].episode_title, None);
    }
}

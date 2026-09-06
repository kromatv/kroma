//! Attaching resolved metadata to a catalog row, and clearing it again.

use std::collections::HashMap;

use anyhow::Result;
use rusqlite::params;

use kroma_domain::metadata::characters_aligned;
use kroma_domain::{CastMember, Metadata};

use crate::metadata_core::{self, MetaCore};
use crate::translations::{self, TransData};
use crate::Pool;

pub fn set_item_metadata(pool: &Pool, id: &str, meta: &Metadata) -> Result<()> {
    let conn = pool.get()?;
    let json = serde_json::to_string(meta)?;
    conn.execute(
        "UPDATE items SET metadata = ?2 WHERE id = ?1",
        params![id, json],
    )?;
    Ok(())
}

/// Dual-writes one subject's metadata: a language-agnostic [`metadata_core`]
/// row plus a [`translations`] row per language. Character names align by
/// index to `core_meta`'s cast (TMDB keeps cast order across languages).
///
/// A language row carries the poster and the logo only where they differ from
/// the core.
pub fn store_localized(
    pool: &Pool,
    kind: &str,
    id: &str,
    core_meta: &Metadata,
    by_lang: &HashMap<String, Metadata>,
) -> Result<()> {
    let conn = pool.get()?;
    let core = MetaCore {
        // `Metadata::tmdb_id` is 0 when unresolved; store NULL for that.
        tmdb_id: (core_meta.tmdb_id != 0).then_some(core_meta.tmdb_id),
        imdb_id: core_meta.imdb_id.clone(),
        tvdb_id: core_meta.tvdb_id,
        release_date: core_meta.release_date.clone(),
        rating: core_meta.rating,
        certification: core_meta.certification.clone(),
        poster_url: core_meta.poster_url.clone(),
        backdrop_url: core_meta.backdrop_url.clone(),
        logo_url: core_meta.logo_url.clone(),
        cast: core_meta.cast.clone(),
        crew: core_meta.crew.clone(),
        tmdb_genre_ids: core_meta.tmdb_genre_ids.clone(),
    };
    metadata_core::write_core(&conn, kind, id, &core)?;
    for (lang, m) in by_lang {
        let data = TransData {
            title: m.title.clone(),
            tagline: m.tagline.clone(),
            overview: m.overview.clone(),
            genres: m.genres.clone(),
            characters: characters_aligned(&core.cast, &m.cast),
            reason: None,
            poster_url: differing_from(&m.poster_url, Some(&core.poster_url)),
            logo_url: differing_from(&m.logo_url, Some(&core.logo_url)),
            rev: translations::REV,
        };
        if !data.is_empty() {
            translations::write(&conn, kind, id, lang, translations::TMDB, &data)?;
        }
    }
    Ok(())
}

/// Write only the per-language rows, leaving the core alone: re-deriving it from
/// whichever language happened to be fetched would move the artwork every
/// fallback reader sees.
pub fn fill_languages(
    pool: &Pool,
    kind: &str,
    id: &str,
    by_lang: &HashMap<String, Metadata>,
    asked: &[String],
) -> Result<()> {
    let core = metadata_core::get_core(pool, kind, id)?;
    let conn = pool.get()?;
    // A language TMDB answered nothing for gets a row carrying only the
    // revision, so the reader falls back and the next pass does not ask again.
    for lang in asked {
        if by_lang.contains_key(lang) {
            continue;
        }
        translations::write(
            &conn,
            kind,
            id,
            lang,
            translations::TMDB,
            &TransData {
                rev: translations::REV,
                ..TransData::default()
            },
        )?;
    }
    for (lang, m) in by_lang {
        // Aligned to the core's cast, which this pass deliberately leaves
        // alone, by person rather than by row: a credit TMDB added or reordered
        // since must not hand every actor after it another actor's part.
        let characters = core
            .as_ref()
            .map_or_else(Vec::new, |c| characters_aligned(&c.cast, &m.cast));
        let data = TransData {
            title: m.title.clone(),
            tagline: m.tagline.clone(),
            overview: m.overview.clone(),
            genres: m.genres.clone(),
            characters,
            reason: None,
            poster_url: differing_from(&m.poster_url, core.as_ref().map(|c| &c.poster_url)),
            logo_url: differing_from(&m.logo_url, core.as_ref().map(|c| &c.logo_url)),
            rev: translations::REV,
        };
        if !data.is_empty() {
            translations::write(&conn, kind, id, lang, translations::TMDB, &data)?;
        }
    }
    Ok(())
}

fn differing_from(lang: &Option<String>, core: Option<&Option<String>>) -> Option<String> {
    lang.as_ref()
        .filter(|v| core.and_then(Option::as_ref) != Some(*v))
        .cloned()
}

/// Wipes all resolved TMDB metadata so the next enrichment starts from
/// scratch. Returns `(items_cleared, shows_cleared)`; the caller must also
/// clear the process-wide lookup cache (`crate::infra::metadata::Cache`).
pub fn reset_all_metadata(pool: &Pool) -> Result<(usize, usize)> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    let items = tx.execute(
        "UPDATE items SET metadata = NULL WHERE metadata IS NOT NULL",
        [],
    )?;
    let shows = tx.execute(
        "UPDATE shows SET metadata = NULL WHERE metadata IS NOT NULL",
        [],
    )?;
    tx.execute("DELETE FROM item_vectors", [])?;
    tx.execute("DELETE FROM season_meta", [])?;
    // LLM-sourced rows are left intact: regenerated by their own jobs, not TMDB enrichment.
    tx.execute("DELETE FROM metadata_core", [])?;
    tx.execute("DELETE FROM translations WHERE source = 'tmdb'", [])?;
    tx.commit()?;
    Ok((items, shows))
}

pub fn set_season_cast(pool: &Pool, show_id: &str, season: u32, cast: &[CastMember]) -> Result<()> {
    let conn = pool.get()?;
    let json = serde_json::to_string(cast)?;
    conn.execute(
        "INSERT INTO season_meta (show_id,season,casts) VALUES (?1,?2,?3) \
         ON CONFLICT(show_id,season) DO UPDATE SET casts=excluded.casts",
        params![show_id, season, json],
    )?;
    Ok(())
}

pub fn seasons_with_cast(pool: &Pool, show_id: &str) -> Result<std::collections::HashSet<u32>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT season FROM season_meta WHERE show_id = ?1")?;
    let rows = stmt.query_map(params![show_id], |r| r.get::<_, u32>(0))?;
    Ok(rows.collect::<rusqlite::Result<std::collections::HashSet<_>>>()?)
}

pub fn season_casts(pool: &Pool, show_id: &str) -> Result<HashMap<u32, Vec<CastMember>>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT season,casts FROM season_meta WHERE show_id = ?1")?;
    let rows = stmt.query_map(params![show_id], |r| {
        Ok((r.get::<_, u32>(0)?, r.get::<_, String>(1)?))
    })?;
    let mut out = HashMap::new();
    for row in rows {
        let (season, json) = row?;
        if let Ok(cast) = serde_json::from_str::<Vec<CastMember>>(&json) {
            out.insert(season, cast);
        }
    }
    Ok(out)
}

pub fn set_show_metadata(pool: &Pool, id: &str, meta: &Metadata) -> Result<()> {
    let conn = pool.get()?;
    let json = serde_json::to_string(meta)?;
    conn.execute(
        "UPDATE shows SET metadata = ?2 WHERE id = ?1",
        params![id, json],
    )?;
    Ok(())
}

/// Rewrites a movie's catalog title from a *trusted* TMDB match (an operator
/// correction or an acquisition-hinted import). Does not touch the file on disk.
pub fn set_item_title(pool: &Pool, id: &str, title: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE items SET title = ?2 WHERE id = ?1",
        params![id, title],
    )?;
    Ok(())
}

/// Rewrites a show's catalog title from a trusted TMDB match. See [`set_item_title`].
pub fn set_show_title(pool: &Pool, id: &str, title: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE shows SET title = ?2 WHERE id = ?1",
        params![id, title],
    )?;
    Ok(())
}

/// Clears one subject's derived TMDB rows so a reprocess re-enriches it.
/// Nulling only the metadata blob would leave the old `tmdb_id` and localized
/// text behind, outliving a re-enrichment that resolves to fewer languages.
pub fn clear_subject_metadata(pool: &Pool, kind: &str, id: &str) -> Result<()> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    if kind == metadata_core::SHOW {
        tx.execute("UPDATE shows SET metadata=NULL WHERE id=?1", params![id])?;
        tx.execute("DELETE FROM season_meta WHERE show_id=?1", params![id])?;
    } else {
        tx.execute("UPDATE items SET metadata=NULL WHERE id=?1", params![id])?;
        tx.execute("DELETE FROM item_vectors WHERE id=?1", params![id])?;
    }
    metadata_core::delete_core(&tx, kind, id)?;
    translations::delete_all(&tx, kind, id)?;
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ingest::test_support::*;

    fn cast_member(name: &str) -> kroma_domain::CastMember {
        kroma_domain::CastMember {
            name: name.into(),
            tmdb_id: None,
            character: Some(format!("{name} part")),
            profile_url: None,
        }
    }

    #[test]
    fn character_names_follow_the_person_when_the_cast_has_moved_on() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('m1','movie','Dune','mkv','lib','t')",
                [],
            )
            .unwrap();
        }
        let mut core = meta(603, "Dune");
        core.cast = vec![cast_member("Chalamet"), cast_member("Ferguson")];
        store_localized(&p, metadata_core::ITEM, "m1", &core, &HashMap::new()).unwrap();

        // TMDB gained a credit since, so this response has three where the core
        // still has two. Aligned by row, the names would land on the wrong
        // actors for every French reader; aligned by person, each keeps its own.
        let mut grown = meta(603, "Dune");
        grown.cast = vec![
            cast_member("Chalamet"),
            cast_member("Zendaya"),
            cast_member("Ferguson"),
        ];
        let mut by_lang = HashMap::new();
        by_lang.insert("fr".to_string(), grown);

        fill_languages(&p, metadata_core::ITEM, "m1", &by_lang, &["fr".to_string()]).unwrap();

        let all = crate::translations::load_all(&p, metadata_core::ITEM, &["m1"]).unwrap();
        let fr = all.get("m1").and_then(|by| by.get("fr")).unwrap();
        assert_eq!(
            fr.characters,
            vec![
                Some("Chalamet part".to_string()),
                Some("Ferguson part".to_string())
            ]
        );
        assert_eq!(fr.title.as_deref(), Some("Dune"));
    }

    #[test]
    fn a_language_that_was_not_asked_for_keeps_what_it_had() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('m1','movie','Dune','mkv','lib','t')",
                [],
            )
            .unwrap();
        }
        let core = meta(603, "Dune");
        let mut both = HashMap::new();
        both.insert("en".to_string(), core.clone());
        both.insert("fr".to_string(), meta(603, "Dune (VF)"));
        store_localized(&p, metadata_core::ITEM, "m1", &core, &both).unwrap();

        // French came back empty because its request failed, not because TMDB
        // has nothing. Marking it would destroy the row and stamp it current,
        // so the caller leaves it out of `asked` and it must survive untouched.
        fill_languages(
            &p,
            metadata_core::ITEM,
            "m1",
            &HashMap::new(),
            &["en".to_string()],
        )
        .unwrap();

        let all = crate::translations::load_all(&p, metadata_core::ITEM, &["m1"]).unwrap();
        let fr = all.get("m1").and_then(|by| by.get("fr"));
        assert_eq!(fr.and_then(|d| d.title.as_deref()), Some("Dune (VF)"));
    }

    #[test]
    fn a_language_tmdb_has_nothing_for_is_asked_once_and_not_again() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('m1','movie','Dune','mkv','lib','t')",
                [],
            )
            .unwrap();
        }
        let core = meta(603, "Dune");
        let mut first = HashMap::new();
        first.insert("en".to_string(), core.clone());
        store_localized(&p, metadata_core::ITEM, "m1", &core, &first).unwrap();

        fill_languages(
            &p,
            metadata_core::ITEM,
            "m1",
            &HashMap::new(),
            &["fr".to_string()],
        )
        .unwrap();

        // The marker records that French was asked for and had nothing, so it
        // stops being asked. It must not shadow the fallback while doing it: a
        // French reader reads English, which is the whole point of having one.
        let fr = crate::translations::resolve_one(&p, metadata_core::ITEM, "m1", "fr")
            .unwrap()
            .unwrap();
        assert_eq!(fr.title.as_deref(), Some("Dune"));

        let stale =
            crate::translations::stale_langs(&p, metadata_core::ITEM, "m1", &["fr", "en"]).unwrap();
        assert!(stale.is_empty(), "still stale: {stale:?}");
    }

    #[test]
    fn a_language_added_later_is_filled_without_moving_the_core() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('m1','movie','Dune','mkv','lib','t')",
                [],
            )
            .unwrap();
        }
        let mut core = meta(603, "Dune");
        core.poster_url = Some("/en.webp".to_string());
        let mut first = HashMap::new();
        first.insert("en".to_string(), core.clone());
        store_localized(&p, metadata_core::ITEM, "m1", &core, &first).unwrap();

        let mut fr = meta(603, "Dune VF");
        fr.poster_url = Some("/fr.webp".to_string());
        let mut later = HashMap::new();
        later.insert("fr".to_string(), fr);
        fill_languages(&p, metadata_core::ITEM, "m1", &later, &["fr".to_string()]).unwrap();

        let stored = crate::translations::resolve_one(&p, metadata_core::ITEM, "m1", "fr")
            .unwrap()
            .unwrap();
        assert_eq!(stored.title.as_deref(), Some("Dune VF"));
        assert_eq!(stored.poster_url.as_deref(), Some("/fr.webp"));

        let after = metadata_core::get_core(&p, metadata_core::ITEM, "m1")
            .unwrap()
            .unwrap();
        assert_eq!(after.poster_url.as_deref(), Some("/en.webp"));
    }

    #[test]
    fn metadata_write_localized_and_reset() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('m1','movie','Dune','mkv','lib','t')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO shows (id,library,title,added_at) VALUES ('s1','lib','Show','t')",
                [],
            )
            .unwrap();
        }
        set_item_metadata(&p, "m1", &meta(603, "Dune")).unwrap();
        set_show_metadata(&p, "s1", &meta(1396, "Show")).unwrap();

        let mut by_lang = HashMap::new();
        by_lang.insert("fr".to_string(), meta(603, "Dune VF"));
        store_localized(
            &p,
            crate::metadata_core::ITEM,
            "m1",
            &meta(603, "Dune"),
            &by_lang,
        )
        .unwrap();
        let core = crate::metadata_core::get_core(&p, "item", "m1")
            .unwrap()
            .unwrap();
        assert_eq!(core.tmdb_id, Some(603));
        // Character names are stripped from the invariant core (they live per-lang).
        assert_eq!(core.cast.len(), 1);
        assert!(core.cast[0].character.is_none());
        let fr = crate::translations::resolve_one(&p, "item", "m1", "fr")
            .unwrap()
            .unwrap();
        assert_eq!(fr.title.as_deref(), Some("Dune VF"));
        assert_eq!(fr.characters, vec![Some("Paul".to_string())]);

        let (items_cleared, shows_cleared) = reset_all_metadata(&p).unwrap();
        assert_eq!((items_cleared, shows_cleared), (1, 1));
        assert!(crate::get_item(&p, "m1")
            .unwrap()
            .unwrap()
            .metadata
            .is_none());
        assert!(crate::metadata_core::get_core(&p, "item", "m1")
            .unwrap()
            .is_none());
        assert!(crate::translations::resolve_one(&p, "item", "m1", "fr")
            .unwrap()
            .is_none());
    }

    #[test]
    fn set_item_and_show_title_rename_the_catalog_row() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('m1','movie','2001','mkv','lib','t')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO shows (id,library,title,added_at) VALUES ('s1','lib','Show','t')",
                [],
            )
            .unwrap();
        }
        set_item_title(&p, "m1", "2001: A Space Odyssey").unwrap();
        set_show_title(&p, "s1", "Severance").unwrap();
        assert_eq!(
            crate::get_item(&p, "m1").unwrap().unwrap().title,
            "2001: A Space Odyssey"
        );
        let show_title: String = p
            .get()
            .unwrap()
            .query_row("SELECT title FROM shows WHERE id = 's1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(show_title, "Severance");
    }

    #[test]
    fn season_cast_and_clear_metadata() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','shows','/x','t')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('m1','movie','Dune','mkv','lib','t')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO shows (id,library,title,added_at) VALUES ('s1','lib','Show','t')",
                [],
            )
            .unwrap();
        }
        assert!(seasons_with_cast(&p, "s1").unwrap().is_empty());
        let cast = vec![CastMember {
            name: "Adam".into(),
            tmdb_id: None,
            character: Some("Mark".into()),
            profile_url: None,
        }];
        set_season_cast(&p, "s1", 1, &cast).unwrap();
        set_season_cast(&p, "s1", 2, &cast).unwrap();
        set_season_cast(&p, "s1", 1, &cast).unwrap(); // idempotent upsert
        let mut seasons: Vec<u32> = seasons_with_cast(&p, "s1").unwrap().into_iter().collect();
        seasons.sort_unstable();
        assert_eq!(seasons, vec![1, 2]);
        let casts = season_casts(&p, "s1").unwrap();
        assert_eq!(casts.len(), 2);
        assert_eq!(casts[&1][0].name, "Adam");

        set_item_metadata(&p, "m1", &meta(603, "Dune")).unwrap();
        set_show_metadata(&p, "s1", &meta(1396, "Show")).unwrap();
        store_localized(
            &p,
            metadata_core::ITEM,
            "m1",
            &meta(603, "Dune"),
            &HashMap::new(),
        )
        .unwrap();
        crate::set_item_vector(&p, "m1", &[0.5, 0.5]).unwrap();
        clear_subject_metadata(&p, metadata_core::ITEM, "m1").unwrap();
        clear_subject_metadata(&p, metadata_core::SHOW, "s1").unwrap();
        assert!(crate::get_item(&p, "m1")
            .unwrap()
            .unwrap()
            .metadata
            .is_none());
        assert!(crate::get_show(&p, "s1")
            .unwrap()
            .unwrap()
            .show
            .metadata
            .is_none());
        assert!(metadata_core::get_core(&p, metadata_core::ITEM, "m1")
            .unwrap()
            .is_none());
        assert!(!crate::has_vector(&p, "m1").unwrap());
        assert!(seasons_with_cast(&p, "s1").unwrap().is_empty());
    }

    #[test]
    fn the_genre_ids_go_to_the_invariant_core_and_the_names_go_per_language() {
        let p = pool();
        let mut fr = meta(603, "Dune");
        fr.genres = vec!["Science-fiction".into()];
        let by_lang = HashMap::from([("fr".to_string(), fr)]);

        store_localized(&p, metadata_core::ITEM, "m1", &meta(603, "Dune"), &by_lang).unwrap();

        let core = metadata_core::get_core(&p, metadata_core::ITEM, "m1")
            .unwrap()
            .unwrap();
        assert_eq!(core.tmdb_genre_ids, vec![878]);
        let stored_fr = crate::translations::resolve_one(&p, "item", "m1", "fr")
            .unwrap()
            .unwrap();
        assert_eq!(stored_fr.genres, vec!["Science-fiction".to_string()]);
    }

    #[test]
    fn the_age_rating_lands_on_the_language_invariant_core() {
        let p = pool();
        let by_lang = HashMap::from([("fr".to_string(), meta(603, "Dune"))]);

        store_localized(&p, metadata_core::ITEM, "m1", &meta(603, "Dune"), &by_lang).unwrap();

        assert_eq!(
            metadata_core::get_core(&p, metadata_core::ITEM, "m1")
                .unwrap()
                .unwrap()
                .certification
                .as_deref(),
            Some("PG-13")
        );
    }

    #[test]
    fn a_language_that_translates_nothing_is_recorded_but_never_served() {
        let p = pool();
        let bare = Metadata {
            title: None,
            overview: None,
            genres: Vec::new(),
            cast: Vec::new(),
            ..meta(603, "Dune")
        };
        let by_lang = HashMap::from([("de".to_string(), bare)]);
        store_localized(&p, metadata_core::ITEM, "m1", &meta(603, "Dune"), &by_lang).unwrap();

        // A reader must not resolve to it: with no text of its own it would
        // shadow the fallback and serve them the household's blob instead.
        assert!(crate::translations::resolve_one(&p, "item", "m1", "de")
            .unwrap()
            .is_none());
        // The row is there all the same, so nothing asks TMDB for German again.
        let stored = crate::translations::load_all(&p, metadata_core::ITEM, &["m1"]).unwrap();
        assert!(stored.get("m1").is_some_and(|by| by.contains_key("de")));
    }
}

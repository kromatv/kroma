//! The backdrop sample behind the anonymous sign-in screen.

use anyhow::Result;

use super::SplashEntry;
use crate::{metadata_core, translations, Pool};

/// A random sample of backdrop-carrying titles for the anonymous sign-in
/// splash, captions overlaid in `locale`. A fixed-size random sample, never a
/// listing: the one catalogue read served without a session.
pub fn splash_entries(pool: &Pool, limit: u32, locale: &str) -> Result<Vec<SplashEntry>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        // The scan only knows a year when the file name carried one (shows
        // rarely do); the enriched release date fills the gap.
        "SELECT kind, id, title, year, backdrop_url, rating FROM (\
            SELECT 'movie' AS kind, i.id AS id, i.title AS title, \
                   COALESCE(i.year, NULLIF(CAST(substr(mc.release_date,1,4) AS INTEGER),0)) AS year, \
                   mc.backdrop_url AS backdrop_url, mc.rating AS rating \
              FROM items i JOIN metadata_core mc \
                ON mc.subject_kind='item' AND mc.subject_id=i.id \
             WHERE i.kind='movie' AND mc.backdrop_url IS NOT NULL \
            UNION ALL \
            SELECT 'show', s.id, s.title, \
                   COALESCE(s.year, NULLIF(CAST(substr(mc.release_date,1,4) AS INTEGER),0)), \
                   mc.backdrop_url, mc.rating \
              FROM shows s JOIN metadata_core mc \
                ON mc.subject_kind='show' AND mc.subject_id=s.id \
             WHERE mc.backdrop_url IS NOT NULL) \
         ORDER BY RANDOM() LIMIT ?1",
    )?;
    let mut entries: Vec<(String, SplashEntry)> = stmt
        .query_map([limit], |r| {
            Ok((
                r.get::<_, String>(1)?,
                SplashEntry {
                    kind: r.get(0)?,
                    title: r.get(2)?,
                    year: r.get(3)?,
                    backdrop_url: r.get(4)?,
                    rating: r.get(5)?,
                },
            ))
        })?
        .collect::<rusqlite::Result<_>>()?;

    for (subject, kind) in [
        (metadata_core::ITEM, "movie"),
        (metadata_core::SHOW, "show"),
    ] {
        let ids: Vec<&str> = entries
            .iter()
            .filter(|(_, e)| e.kind == kind)
            .map(|(id, _)| id.as_str())
            .collect();
        let tr = translations::resolve_many(&conn, subject, &ids, locale)?;
        for (id, entry) in entries.iter_mut() {
            if entry.kind == kind {
                if let Some(title) = tr.get(id).and_then(|d| d.title.clone()) {
                    entry.title = title;
                }
            }
        }
    }
    Ok(entries.into_iter().map(|(_, e)| e).collect())
}

#[cfg(test)]
mod tests {
    use rusqlite::{params, Connection};

    use super::*;
    use crate::media::test_support::*;

    fn seed_backdrop(conn: &Connection, kind: &str, id: &str, backdrop: &str) {
        conn.execute(
            "INSERT INTO metadata_core (subject_kind,subject_id,backdrop_url,rating,updated_at) \
             VALUES (?1,?2,?3,7.5,0)",
            params![kind, id, backdrop],
        )
        .unwrap();
    }

    #[test]
    fn splash_captions_a_title_in_the_asked_for_locale() {
        // The one catalogue read served without a session, so the caption has
        // to be localised from the stored translation rather than from whatever
        // the scan happened to name the file.
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
                [],
            )
            .unwrap();
            seed_movie(&conn, "m1", "Dune", "lib");
            seed_backdrop(&conn, metadata_core::ITEM, "m1", "/b/m1.jpg");
            conn.execute(
                "INSERT INTO shows (id,library,title,added_at) VALUES ('s1','lib','Severance','t')",
                [],
            )
            .unwrap();
            seed_backdrop(&conn, metadata_core::SHOW, "s1", "/b/s1.jpg");
        }
        crate::translations::put(
            &p,
            metadata_core::ITEM,
            "m1",
            "fr",
            "tmdb",
            &crate::translations::TransData {
                title: Some("Dune, première partie".into()),
                ..Default::default()
            },
        )
        .unwrap();
        crate::translations::put(
            &p,
            metadata_core::SHOW,
            "s1",
            "fr",
            "tmdb",
            &crate::translations::TransData {
                title: Some("Séparation".into()),
                ..Default::default()
            },
        )
        .unwrap();

        let mut titles: Vec<String> = splash_entries(&p, 10, "fr")
            .unwrap()
            .into_iter()
            .map(|e| e.title)
            .collect();
        titles.sort();
        assert_eq!(titles, ["Dune, première partie", "Séparation"]);
    }

    #[test]
    fn splash_keeps_the_stored_title_when_the_locale_has_no_translation() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
                [],
            )
            .unwrap();
            seed_movie(&conn, "m1", "Dune", "lib");
            seed_backdrop(&conn, metadata_core::ITEM, "m1", "/b/m1.jpg");
        }
        let entries = splash_entries(&p, 10, "de").unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].title, "Dune");
        assert_eq!(entries[0].backdrop_url, "/b/m1.jpg");
        assert_eq!(entries[0].kind, "movie");
    }

    #[test]
    fn splash_only_offers_titles_that_have_a_backdrop() {
        // The splash IS the backdrop; a title without one would be a blank slide.
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
                [],
            )
            .unwrap();
            seed_movie(&conn, "m1", "Dune", "lib");
            seed_movie(&conn, "m2", "Arrival", "lib");
            seed_backdrop(&conn, metadata_core::ITEM, "m1", "/b/m1.jpg");
        }
        let entries = splash_entries(&p, 10, "fr").unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].title, "Dune");
    }

    #[test]
    fn splash_never_hands_back_more_than_the_limit() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
                [],
            )
            .unwrap();
            for n in 0..5 {
                let id = format!("m{n}");
                seed_movie(&conn, &id, &format!("Film {n}"), "lib");
                seed_backdrop(&conn, metadata_core::ITEM, &id, "/b/x.jpg");
            }
        }
        assert_eq!(splash_entries(&p, 2, "fr").unwrap().len(), 2);
        assert!(splash_entries(&p, 0, "fr").unwrap().is_empty());
    }
}

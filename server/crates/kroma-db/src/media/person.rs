//! There is no person table: cast and crew live in each title's `metadata`
//! JSON, so a lookup reads every credit through SQLite's JSON1 and matches them
//! in Rust. Folding is why it cannot be a `WHERE`: a slug has already lost the
//! accents and punctuation an SQL comparison would need.

use anyhow::Result;
use rusqlite::Connection;

use kroma_domain::people::{self, Credit, CreditedTitle, PersonMatch};
use kroma_domain::slug::{slug_eq, slugify};

use crate::Pool;

const MOVIE_CREDITS: &str = "\
    SELECT i.id, json_extract(c.value,'$.name'), json_extract(c.value,'$.tmdbId') \
      FROM items i, json_each(i.metadata,'$.cast') c \
     WHERE i.kind != 'episode' AND i.metadata IS NOT NULL \
    UNION ALL \
    SELECT i.id, json_extract(c.value,'$.name'), json_extract(c.value,'$.tmdbId') \
      FROM items i, json_each(i.metadata,'$.crew') c \
     WHERE i.kind != 'episode' AND i.metadata IS NOT NULL";

const SHOW_CREDITS: &str = "\
    SELECT s.id, json_extract(c.value,'$.name'), json_extract(c.value,'$.tmdbId') \
      FROM shows s, json_each(s.metadata,'$.cast') c \
     WHERE s.metadata IS NOT NULL \
    UNION ALL \
    SELECT s.id, json_extract(c.value,'$.name'), json_extract(c.value,'$.tmdbId') \
      FROM shows s, json_each(s.metadata,'$.crew') c \
     WHERE s.metadata IS NOT NULL";

/// The person `lookup` names, with the movies and shows crediting them.
/// `lookup` is a provider person id, a URL slug, or a display name in any
/// casing; see [`people::resolve_person`] for which one answers. Episodes are
/// excluded: they inherit their show's credits.
pub fn resolve_person(pool: &Pool, lookup: &str) -> Result<Option<PersonMatch>> {
    let want = slugify(lookup);
    if want.is_empty() {
        return Ok(None);
    }
    let id = lookup.parse::<u64>().ok();
    // The id and the fold are both answered here so that a credit which is
    // neither never becomes a `Credit`: `people::resolve_person` re-applies the
    // same rules over the survivors, which is where the namesake tie-break lives.
    let keep = |name: &str, credit_id: Option<u64>| {
        (id.is_some() && credit_id == id) || slug_eq(name, &want)
    };
    let conn = pool.get()?;
    let mut credits = read_credits(&conn, MOVIE_CREDITS, CreditedTitle::Movie, &keep)?;
    credits.extend(read_credits(&conn, SHOW_CREDITS, CreditedTitle::Show, &keep)?);
    Ok(people::resolve_person(credits, lookup))
}

fn read_credits(
    conn: &Connection,
    sql: &str,
    title: fn(String) -> CreditedTitle,
    keep: &dyn Fn(&str, Option<u64>) -> bool,
) -> Result<Vec<Credit>> {
    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query([])?;
    let mut credits = Vec::new();
    // `get_ref` BORROWS out of the statement; `get` would build a String for
    // every credit in the library before anything could reject it, and only a
    // handful are ever the person being looked up.
    while let Some(row) = rows.next()? {
        let Ok(name) = row.get_ref(1)?.as_str() else {
            continue;
        };
        let tmdb_id = row
            .get_ref(2)?
            .as_i64_or_null()?
            .and_then(|id| u64::try_from(id).ok());
        if !keep(name, tmdb_id) {
            continue;
        }
        credits.push(Credit {
            name: name.to_string(),
            tmdb_id,
            title: title(row.get::<_, String>(0)?),
        });
    }
    Ok(credits)
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::media::test_support::pool;
    use crate::testing::TempPool;
    use rusqlite::params;

    type Credited<'a> = (&'a str, Option<u64>);

    fn credits(cast: &[Credited], crew: &[Credited]) -> String {
        let person = |(name, id): &Credited| serde_json::json!({"name": name, "tmdbId": id});
        serde_json::json!({
            "tmdbId": 1,
            "tmdbUrl": "x",
            "genres": [],
            "cast": cast.iter().map(person).collect::<Vec<_>>(),
            "crew": crew.iter().map(person).collect::<Vec<_>>(),
        })
        .to_string()
    }

    fn seeded_pool() -> TempPool {
        let pool = pool();
        let conn = pool.get().unwrap();
        conn.execute(
            "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movie','/x','t')",
            [],
        )
        .unwrap();
        let movie = |id: &str, cast: &[Credited], crew: &[Credited]| {
            conn.execute(
                "INSERT INTO items (id,kind,title,container,library,added_at,metadata) \
                 VALUES (?1,'movie',?1,'mkv','lib','t',?2)",
                params![id, credits(cast, crew)],
            )
            .unwrap();
        };
        movie(
            "m1",
            &[("Timothée Chalamet", Some(1234))],
            &[("Denis Villeneuve", None)],
        );
        movie(
            "m2",
            &[("Emily Blunt", None)],
            &[("Denis Villeneuve", None)],
        );
        conn.execute(
            "INSERT INTO shows (id,library,title,added_at,metadata) VALUES ('s1','lib','S','t',?1)",
            params![credits(&[("Adam Scott", None)], &[("Ben Stiller", None)])],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at,metadata) \
             VALUES ('e1','episode','Ep1','mkv','lib','s1',1,1,'t',?1)",
            params![credits(&[("Adam Scott", None)], &[])],
        )
        .unwrap();
        drop(conn);
        pool
    }

    #[test]
    fn a_slug_finds_every_movie_and_show_crediting_the_person_it_names() {
        let pool = seeded_pool();

        let director = resolve_person(&pool, "denis-villeneuve").unwrap().unwrap();
        let actor = resolve_person(&pool, "timothee-chalamet").unwrap().unwrap();

        assert_eq!(director.name, "Denis Villeneuve");
        assert_eq!(director.movie_ids, ["m1", "m2"]);
        assert!(director.show_ids.is_empty());
        assert_eq!(actor.movie_ids, ["m1"]);
    }

    #[test]
    fn a_credit_on_a_show_never_drags_in_its_episodes() {
        let pool = seeded_pool();

        let found = resolve_person(&pool, "adam-scott").unwrap().unwrap();

        assert_eq!(found.show_ids, ["s1"]);
        assert!(found.movie_ids.is_empty());
    }

    #[test]
    fn a_display_name_finds_what_its_slug_finds_so_older_clients_keep_working() {
        let pool = seeded_pool();

        let by_name = resolve_person(&pool, "Timothée Chalamet").unwrap();

        assert_eq!(by_name, resolve_person(&pool, "timothee-chalamet").unwrap());
    }

    #[test]
    fn a_stored_person_id_answers_on_its_own() {
        let pool = seeded_pool();

        let found = resolve_person(&pool, "1234").unwrap().unwrap();

        assert_eq!(found.name, "Timothée Chalamet");
        assert_eq!(found.tmdb_id, Some(1234));
        assert_eq!(found.movie_ids, ["m1"]);
    }

    #[test]
    fn a_credit_stored_before_ids_were_kept_reports_none() {
        let pool = seeded_pool();

        let found = resolve_person(&pool, "denis-villeneuve").unwrap().unwrap();

        assert_eq!(found.tmdb_id, None);
    }

    #[test]
    fn an_uncredited_or_blank_lookup_finds_nobody() {
        let pool = seeded_pool();

        assert!(resolve_person(&pool, "Nobody").unwrap().is_none());
        assert!(resolve_person(&pool, "  ").unwrap().is_none());
    }
}

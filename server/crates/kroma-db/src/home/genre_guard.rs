//! Keeping a recommendation row to titles that share a genre with its seed.

use anyhow::Result;
use rusqlite::params;

use crate::Pool;

/// Of `candidates`, the subset sharing ≥1 genre with `seed` a coherence guard
/// for the single-seed "Because you watched" row. The lexical embedder is weakly
/// discriminative item↔item (the whole catalog clusters in a narrow cosine band,
/// so a Van Gogh drama's nearest neighbour can be a horror film); requiring a
/// shared genre keeps the row honest. `None` when `seed` has no genres nothing
/// to guard on, so the caller keeps the unfiltered list.
pub fn genre_coherent_ids(
    pool: &Pool,
    seed: &str,
    candidates: &[String],
) -> Result<Option<std::collections::HashSet<String>>> {
    if candidates.is_empty() {
        return Ok(None);
    }
    let conn = pool.get()?;
    // Seed + candidates can both be movies *or* shows (recommendation rows mix
    // them), so look in both tables querying `items` alone would silently drop
    // every show id from the keep-set and defeat the movie/show mixing.
    let mut gstmt = conn.prepare(
        "SELECT g.value FROM items i, json_each(i.metadata,'$.genres') g WHERE i.id = ?1 \
         UNION SELECT g.value FROM shows s, json_each(s.metadata,'$.genres') g WHERE s.id = ?1",
    )?;
    let seed_genres: Vec<String> = gstmt
        .query_map(params![seed], |r| r.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    if seed_genres.is_empty() {
        return Ok(None);
    }
    let cand_ph = vec!["?"; candidates.len()].join(",");
    let genre_ph = vec!["?"; seed_genres.len()].join(",");
    let sql = format!(
        "SELECT DISTINCT i.id FROM items i, json_each(i.metadata,'$.genres') g \
         WHERE i.id IN ({cand_ph}) AND g.value IN ({genre_ph}) \
         UNION SELECT DISTINCT s.id FROM shows s, json_each(s.metadata,'$.genres') g \
         WHERE s.id IN ({cand_ph}) AND g.value IN ({genre_ph})"
    );
    let mut stmt = conn.prepare(&sql)?;
    // Placeholders appear twice (items arm + shows arm), so bind the args twice.
    let args = candidates
        .iter()
        .chain(seed_genres.iter())
        .chain(candidates.iter())
        .chain(seed_genres.iter());
    let kept = stmt
        .query_map(rusqlite::params_from_iter(args), |r| r.get::<_, String>(0))?
        .collect::<rusqlite::Result<std::collections::HashSet<_>>>()?;
    Ok(Some(kept))
}

/// Drop the genre-incoherent neighbours from a ranked `(id, score)` list (order
/// preserved) via [`genre_coherent_ids`]. A no-op when the seed has no genres or
/// the query errors used by the "Because you watched" home row and the
/// detail-page "More like this" rail.
pub fn genre_guard(pool: &Pool, seed: &str, ranked: Vec<(String, f32)>) -> Vec<(String, f32)> {
    let ids: Vec<String> = ranked.iter().map(|(id, _)| id.clone()).collect();
    match genre_coherent_ids(pool, seed, &ids) {
        Ok(Some(keep)) => ranked
            .into_iter()
            .filter(|(id, _)| keep.contains(id))
            .collect(),
        _ => ranked,
    }
}

/// Every genre the catalogue actually holds, in English, sorted.
pub fn catalogue_genres(pool: &Pool) -> Result<Vec<String>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT DISTINCT g.value FROM translations t, json_each(t.data,'$.genres') g \
         WHERE t.lang = 'en' AND t.subject_kind IN ('item','show') ORDER BY g.value",
    )?;
    let out = stmt
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(out)
}

/// Of `candidates`, those carrying at least one of `genres`.
///
/// Matched against the ENGLISH catalogue, because that is the vocabulary TMDB
/// genre names come from and the one a model names a row's subject in; the blob
/// holds whatever language the household enriched in, so matching there would
/// work on a French server and silently keep nothing on an English one.
///
/// `None` when there is nothing to guard on, so the caller keeps its list.
pub fn ids_with_genres(
    pool: &Pool,
    candidates: &[String],
    genres: &[String],
    kinds: &[&str],
) -> Result<Option<std::collections::HashSet<String>>> {
    if candidates.is_empty() || genres.is_empty() || kinds.is_empty() {
        return Ok(None);
    }
    let conn = pool.get()?;
    let cand_ph = vec!["?"; candidates.len()].join(",");
    let genre_ph = vec!["?"; genres.len()].join(",");
    let kind_ph = vec!["?"; kinds.len()].join(",");
    let sql = format!(
        "SELECT DISTINCT t.subject_id FROM translations t, json_each(t.data,'$.genres') g \
         WHERE t.lang = 'en' AND t.subject_kind IN ({kind_ph}) \
         AND t.subject_id IN ({cand_ph}) AND g.value IN ({genre_ph})"
    );
    let mut stmt = conn.prepare(&sql)?;
    let args = kinds
        .iter()
        .map(|k| (*k).to_string())
        .chain(candidates.iter().cloned())
        .chain(genres.iter().cloned());
    let kept = stmt
        .query_map(rusqlite::params_from_iter(args), |r| r.get::<_, String>(0))?
        .collect::<rusqlite::Result<std::collections::HashSet<_>>>()?;
    Ok(Some(kept))
}

/// Drop from a ranked list everything that does not carry one of `genres`
/// (order preserved). Unlike [`genre_guard`], it does not fall back to the
/// unfiltered list when it matches nothing.
pub fn keep_shelf(
    pool: &Pool,
    ranked: Vec<(String, f32)>,
    genres: &[String],
    kinds: &[&str],
) -> Vec<(String, f32)> {
    let ids: Vec<String> = ranked.iter().map(|(id, _)| id.clone()).collect();
    match ids_with_genres(pool, &ids, genres, kinds) {
        Ok(Some(keep)) => ranked
            .into_iter()
            .filter(|(id, _)| keep.contains(id))
            .collect(),
        Ok(None) => ranked,
        Err(_) => ranked,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::home::test_support::*;

    fn with_english_genres(p: &crate::Pool, id: &str, kind: &str, genres: &[&str]) {
        crate::translations::put(
            p,
            kind,
            id,
            "en",
            crate::translations::TMDB,
            &crate::translations::TransData {
                genres: genres.iter().map(|g| (*g).to_string()).collect(),
                ..Default::default()
            },
        )
        .unwrap();
    }

    #[test]
    fn a_shelf_keeps_only_what_carries_one_of_its_genres() {
        let p = seeded();
        with_english_genres(&p, "c1", "item", &["Horror", "Thriller"]);
        with_english_genres(&p, "c2", "item", &["Comedy"]);

        let ranked = vec![("c1".to_string(), 1.0), ("c2".to_string(), 0.9)];
        let kept = keep_shelf(&p, ranked, &["Horror".to_string()], &["item"]);

        assert_eq!(
            kept.iter().map(|(id, _)| id.as_str()).collect::<Vec<_>>(),
            ["c1"]
        );
    }

    #[test]
    fn a_shelf_of_films_does_not_keep_a_show() {
        let p = seeded();
        with_english_genres(&p, "c1", "item", &["Horror"]);
        with_english_genres(&p, "s1", "show", &["Horror"]);

        let ranked = vec![("c1".to_string(), 1.0), ("s1".to_string(), 0.9)];
        let kept = keep_shelf(&p, ranked, &["Horror".to_string()], &["item"]);

        assert_eq!(
            kept.iter().map(|(id, _)| id.as_str()).collect::<Vec<_>>(),
            ["c1"]
        );
    }

    #[test]
    fn a_shelf_that_names_no_genre_is_left_for_the_caller_to_drop() {
        let p = seeded();
        with_english_genres(&p, "c1", "item", &["Horror"]);

        // Nothing to guard on: the guard returns the list untouched rather than
        // silently emptying it, and the caller decides the row is unshowable.
        let ranked = vec![("c1".to_string(), 1.0)];
        let kept = keep_shelf(&p, ranked, &[], &["item"]);

        assert_eq!(kept.len(), 1);
    }

    #[test]
    fn the_genres_offered_are_the_ones_the_library_actually_has() {
        let p = seeded();
        with_english_genres(&p, "c1", "item", &["Horror", "Thriller"]);
        with_english_genres(&p, "s1", "show", &["Sci-Fi & Fantasy"]);

        let got = catalogue_genres(&p).unwrap();

        assert_eq!(got, ["Horror", "Sci-Fi & Fantasy", "Thriller"]);
    }

    #[test]
    fn an_empty_catalogue_offers_nothing_rather_than_guessing() {
        let p = crate::testing::temp_pool("home-empty");

        assert!(catalogue_genres(&p).unwrap().is_empty());
        assert!(ids_with_genres(&p, &[], &["Horror".to_string()], &["item"])
            .unwrap()
            .is_none());
    }

    #[test]
    fn genre_coherence_and_guard() {
        let p = seeded();
        let cands = vec!["c1".to_string(), "c2".to_string()];
        // Only c1 shares Horror with the seed.
        let keep = genre_coherent_ids(&p, "seed", &cands).unwrap().unwrap();
        assert!(keep.contains("c1") && !keep.contains("c2"));

        // Empty candidate list, and a seed without genres, both yield None (no guard).
        assert!(genre_coherent_ids(&p, "seed", &[]).unwrap().is_none());
        assert!(genre_coherent_ids(&p, "nogen", &cands).unwrap().is_none());

        // genre_guard drops the incoherent neighbour, preserving order.
        let ranked = vec![("c1".to_string(), 0.9f32), ("c2".to_string(), 0.5f32)];
        assert_eq!(
            genre_guard(&p, "seed", ranked),
            vec![("c1".to_string(), 0.9f32)]
        );
        // A genreless seed is a no-op (keeps everything).
        let ranked = vec![("c1".to_string(), 0.9f32), ("c2".to_string(), 0.5f32)];
        assert_eq!(genre_guard(&p, "nogen", ranked).len(), 2);
    }
}

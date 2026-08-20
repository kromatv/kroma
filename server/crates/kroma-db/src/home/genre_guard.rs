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
pub fn genre_coherent_ids(pool: &Pool, seed: &str, candidates: &[String]) -> Result<Option<std::collections::HashSet<String>>> {
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
    let seed_genres: Vec<String> =
        gstmt.query_map(params![seed], |r| r.get::<_, String>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
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
        Ok(Some(keep)) => ranked.into_iter().filter(|(id, _)| keep.contains(id)).collect(),
        _ => ranked,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::home::test_support::*;

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
        assert_eq!(genre_guard(&p, "seed", ranked), vec![("c1".to_string(), 0.9f32)]);
        // A genreless seed is a no-op (keeps everything).
        let ranked = vec![("c1".to_string(), 0.9f32), ("c2".to_string(), 0.5f32)];
        assert_eq!(genre_guard(&p, "nogen", ranked).len(), 2);
    }
}

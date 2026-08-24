//! Brute-force cosine search over the stored vectors.

use std::collections::HashSet;

use super::load_vectors;
use crate::Pool;
use anyhow::Result;
use rusqlite::params;

/// "More like this": the `n` nearest titles to `id` (excluding itself). Empty if
/// the seed has no stored vector yet.
pub fn similar(pool: &Pool, id: &str, n: usize) -> Result<Vec<(String, f32)>> {
    let vectors = load_vectors(pool)?;
    let Some(query) = vectors
        .iter()
        .find(|(vid, _)| vid == id)
        .map(|(_, v)| v.clone())
    else {
        return Ok(Vec::new());
    };
    let exclude: HashSet<&str> = std::iter::once(id).collect();
    Ok(rank(&vectors, &query, &exclude, n))
}

/// Zero-shot themed row: the `n` titles nearest to a free-text `query` vector
/// (embed the phrase e.g. "christmas movie" with the same embedder first).
pub fn themed(pool: &Pool, query: &[f32], n: usize) -> Result<Vec<(String, f32)>> {
    let vectors = load_vectors(pool)?;
    Ok(rank(&vectors, query, &HashSet::new(), n))
}

/// Personalized "For You": average the vectors of what `user_id` recently watched
/// into a taste centroid, then return the `n` nearest *unwatched* titles.
pub fn for_you(pool: &Pool, user_id: &str, n: usize) -> Result<Vec<(String, f32)>> {
    let watched = recent_watched_ids(pool, user_id)?;
    if watched.is_empty() {
        return Ok(Vec::new());
    }
    let vectors = load_vectors(pool)?;
    let Some(centroid) = centroid_of(&vectors, &watched) else {
        return Ok(Vec::new());
    };
    let exclude: HashSet<&str> = watched.iter().map(String::as_str).collect();
    Ok(rank(&vectors, &centroid, &exclude, n))
}

/// Most-recently-watched distinct item ids for one user (newest first, capped) —
/// the taste window for [`for_you`] and the section generator.
pub fn recent_watched_ids(pool: &Pool, user_id: &str) -> Result<Vec<String>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT item_id FROM play_history \
         WHERE user_id = ?1 AND item_id IS NOT NULL \
         GROUP BY item_id ORDER BY MAX(ended_at) DESC LIMIT 50",
    )?;
    let rows = stmt.query_map(params![user_id], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn centroid_of(vectors: &[(String, Vec<f32>)], ids: &[String]) -> Option<Vec<f32>> {
    let want: HashSet<&str> = ids.iter().map(String::as_str).collect();
    let mut sum: Vec<f32> = Vec::new();
    let mut count = 0usize;
    for (id, v) in vectors {
        if !want.contains(id.as_str()) {
            continue;
        }
        if sum.is_empty() {
            sum = vec![0.0; v.len()];
        }
        if sum.len() == v.len() {
            for (s, x) in sum.iter_mut().zip(v) {
                *s += x;
            }
            count += 1;
        }
    }
    if count == 0 {
        return None;
    }
    l2_normalize(&mut sum);
    Some(sum)
}

fn rank(
    vectors: &[(String, Vec<f32>)],
    query: &[f32],
    exclude: &HashSet<&str>,
    n: usize,
) -> Vec<(String, f32)> {
    let mut scored: Vec<(String, f32)> = vectors
        .iter()
        .filter(|(id, v)| v.len() == query.len() && !exclude.contains(id.as_str()))
        .map(|(id, v)| (id.clone(), dot(query, v)))
        .collect();
    scored.sort_by(|a, b| b.1.total_cmp(&a.1));
    scored.truncate(n);
    scored
}

fn dot(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

fn l2_normalize(v: &mut [f32]) {
    let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 {
        for x in v.iter_mut() {
            *x /= norm;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vectors::test_support::*;

    #[test]
    fn similar_ranks_nearest_and_excludes_self() {
        let p = seeded();
        let near = similar(&p, "a", 10).unwrap();
        // a's nearest is b (dot 0.8), then c (dot 0.0); a itself excluded.
        assert_eq!(
            near.iter().map(|(id, _)| id.as_str()).collect::<Vec<_>>(),
            ["b", "c"]
        );
        assert!(near[0].1 > near[1].1);
        // A seed without a stored vector yields nothing.
        assert!(similar(&p, "ghost", 10).unwrap().is_empty());

        // Themed query nearest [1,0] is a, then b.
        let themed_hits = themed(&p, &[1.0, 0.0], 2).unwrap();
        assert_eq!(themed_hits[0].0, "a");
    }

    #[test]
    fn for_you_uses_watch_centroid_and_excludes_watched() {
        let p = seeded();
        // No history yet -> empty.
        assert!(for_you(&p, "u1", 10).unwrap().is_empty());
        assert!(recent_watched_ids(&p, "u1").unwrap().is_empty());

        p.get()
            .unwrap()
            .execute(
                "INSERT INTO play_history (id,user_id,item_id,kind,title,started_at,ended_at) \
                 VALUES ('h1','u1','a','movie','T',0,100)",
                [],
            )
            .unwrap();
        assert_eq!(recent_watched_ids(&p, "u1").unwrap(), vec!["a".to_string()]);
        let recs = for_you(&p, "u1", 10).unwrap();
        let ids: Vec<&str> = recs.iter().map(|(id, _)| id.as_str()).collect();
        // Centroid is 'a'; nearest unwatched is b then c, and 'a' is excluded.
        assert_eq!(ids, ["b", "c"]);
    }

    #[test]
    fn a_taste_window_of_never_embedded_titles_recommends_nothing() {
        let p = seeded();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO items (id,kind,title,container,library,added_at) \
                 VALUES ('z','movie','Z','mkv','lib','t')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO play_history (id,user_id,item_id,kind,title,started_at,ended_at) \
                 VALUES ('h1','u1','z','movie','Z',0,100)",
                [],
            )
            .unwrap();
        }
        assert_eq!(recent_watched_ids(&p, "u1").unwrap(), vec!["z".to_string()]);
        assert!(
            for_you(&p, "u1", 10).unwrap().is_empty(),
            "no vector, so no centroid to rank from"
        );
    }

    #[test]
    fn a_centroid_averages_only_the_vectors_of_its_own_width() {
        assert!(centroid_of(&[], &["a".to_string()]).is_none());

        let vectors = vec![
            ("a".to_string(), vec![1.0, 0.0]),
            ("b".to_string(), vec![0.0, 1.0, 0.0]),
        ];
        assert!(centroid_of(&vectors, &["ghost".to_string()]).is_none());
        assert_eq!(
            centroid_of(&vectors, &["a".to_string(), "b".to_string()]),
            Some(vec![1.0, 0.0])
        );
    }

    #[test]
    fn normalizing_a_zero_vector_leaves_it_alone() {
        let mut zero = vec![0.0f32, 0.0];
        l2_normalize(&mut zero);
        assert_eq!(
            zero,
            vec![0.0, 0.0],
            "dividing by a zero norm would yield NaN"
        );

        let mut v = vec![3.0f32, 4.0];
        l2_normalize(&mut v);
        assert_eq!(v, vec![0.6, 0.8]);
    }
}

//! Content-embedding storage + brute-force vector search.
//!
//! One row per title (movie OR show) in `item_vectors`, stored L2-normalized so
//! cosine similarity is a plain dot product. Past ~50k items, swap
//! [`load_vectors`] for an ANN index; the public functions stay the same.

use std::collections::HashSet;

use rusqlite::OptionalExtension;

use super::*;

/// Insert/replace one title's embedding. `vec` MUST already be L2-normalized.
pub fn set_item_vector(pool: &Pool, id: &str, vec: &[f32]) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO item_vectors (id, dim, vec, updated_at) VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(id) DO UPDATE SET dim=excluded.dim, vec=excluded.vec, updated_at=excluded.updated_at",
        params![id, vec.len() as i64, vec_to_blob(vec), now_or_blank()],
    )?;
    Ok(())
}

/// Ids that have a stored embedding.
pub fn item_ids_with_vector(pool: &Pool) -> Result<HashSet<String>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT id FROM item_vectors")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Whether a title has a stored embedding.
pub fn has_vector(pool: &Pool, id: &str) -> Result<bool> {
    let conn = pool.get()?;
    let n: i64 =
        conn.query_row("SELECT COUNT(*) FROM item_vectors WHERE id=?1", params![id], |r| r.get(0))?;
    Ok(n > 0)
}

/// Delete one title's stored embedding, so a reprocess recomputes it.
pub fn clear_item_vector(pool: &Pool, id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute("DELETE FROM item_vectors WHERE id=?1", params![id])?;
    Ok(())
}

/// The stored embedding dimension for one id, or `None` if unset. Cheaper than
/// [`vector_dims`] when checking a single id.
pub fn vector_dim(pool: &Pool, id: &str) -> Result<Option<usize>> {
    let conn = pool.get()?;
    let dim: Option<i64> = conn
        .query_row("SELECT dim FROM item_vectors WHERE id=?1", params![id], |r| r.get(0))
        .optional()?;
    Ok(dim.map(|d| d as usize))
}

/// Current stored embedding dimension per id, so a re-embed can skip vectors
/// already at the active embedder's dim.
pub fn vector_dims(pool: &Pool) -> Result<std::collections::HashMap<String, usize>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT id, dim FROM item_vectors")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)? as usize)))?;
    Ok(rows.filter_map(std::result::Result::ok).collect())
}

/// Drop vectors whose id is no longer a live item or show (call after a rescan;
/// `item_vectors` has no FK because it spans both tables).
pub fn prune_orphan_vectors(pool: &Pool) -> Result<usize> {
    let conn = pool.get()?;
    let n = conn.execute(
        "DELETE FROM item_vectors WHERE id NOT IN (SELECT id FROM items) \
                                     AND id NOT IN (SELECT id FROM shows)",
        [],
    )?;
    Ok(n)
}

/// Load every stored vector as `(id, vector)`. The working set for all searches.
pub fn load_vectors(pool: &Pool) -> Result<Vec<(String, Vec<f32>)>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT id, vec FROM item_vectors")?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get::<_, String>(0)?, blob_to_vec(&r.get::<_, Vec<u8>>(1)?)))
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// "More like this": the `n` nearest titles to `id` (excluding itself). Empty if
/// the seed has no stored vector yet.
pub fn similar(pool: &Pool, id: &str, n: usize) -> Result<Vec<(String, f32)>> {
    let vectors = load_vectors(pool)?;
    let Some(query) = vectors.iter().find(|(vid, _)| vid == id).map(|(_, v)| v.clone()) else {
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

fn vec_to_blob(v: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(v.len() * 4);
    for x in v {
        bytes.extend_from_slice(&x.to_le_bytes());
    }
    bytes
}

fn blob_to_vec(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

fn hydrate(pool: &Pool, ranked: &[(String, f32)]) -> Result<Vec<MediaItem>> {
    let conn = pool.get()?;
    let ids: Vec<&str> = ranked.iter().map(|(id, _)| id.as_str()).collect();
    Ok(items_by_ids_ordered(&conn, &ids)?)
}

/// "For You" as render-ready movies. Over-fetches since show ids drop during
/// hydration, then trims to `n`.
pub fn recommended_for(pool: &Pool, user_id: &str, n: usize) -> Result<Vec<MediaItem>> {
    let ranked = for_you(pool, user_id, n + 8)?;
    let mut items = hydrate(pool, &ranked)?;
    items.truncate(n);
    Ok(items)
}

/// "More like this": [`similar`] + a genre-overlap guard (the lexical embedder is
/// weakly discriminative item↔item) + hydration.
pub fn similar_items(pool: &Pool, id: &str, n: usize) -> Result<Vec<MediaItem>> {
    let raw = similar(pool, id, (n + 8).max(48))?;
    let guarded = super::genre_guard(pool, id, raw.clone());
    // The guard can prune below `n` (few neighbours share a genre); top up from
    // the unguarded neighbours so it still fills when candidates exist.
    let ranked = if guarded.len() >= n {
        guarded
    } else {
        let mut out = guarded;
        let have: std::collections::HashSet<String> = out.iter().map(|(id, _)| id.clone()).collect();
        for cand in raw {
            if out.len() >= n {
                break;
            }
            if !have.contains(&cand.0) {
                out.push(cand);
            }
        }
        out
    };
    let mut items = hydrate(pool, &ranked)?;
    items.truncate(n);
    // Embeddings can be sparse or absent (a fresh library before the embed stage
    // runs, an un-embedded title, or - for a series - an episode id, which carries
    // no vector of its own), which would leave the player's "up next" rail nearly
    // empty. Top up with recently-added titles, excluding the seed + what we
    // already have, so the rail always fills when the library has content.
    if items.len() < n {
        let mut have: std::collections::HashSet<String> =
            items.iter().map(|i| i.id.clone()).collect();
        have.insert(id.to_string());
        let recent = super::recently_added_ids(pool, n * 3)?;
        let mut extra_ids: Vec<&str> =
            recent.iter().filter(|r| !have.contains(r.as_str())).map(String::as_str).collect();
        // Only hydrate what actually fills the rail (each item is a full MediaItem).
        extra_ids.truncate(n - items.len());
        items.extend(super::items_by_ids(pool, &extra_ids)?);
    }
    Ok(items)
}

/// Themed row as render-ready movies: [`themed`] + hydration. `query` is an
/// already-embedded phrase vector; matches below `floor` cosine are dropped as
/// noise (so an off-library query like "christmas" returns few/none rather than
/// random classics).
pub fn themed_items(pool: &Pool, query: &[f32], n: usize, floor: f32) -> Result<Vec<MediaItem>> {
    let ranked: Vec<(String, f32)> =
        themed(pool, query, n + 8)?.into_iter().filter(|(_, s)| *s >= floor).collect();
    let mut items = hydrate(pool, &ranked)?;
    items.truncate(n);
    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::TempPool;

    // Seed three movies a/b/c (with genres for the guard) + their unit vectors.
    // a=[1,0], b=[0.8,0.6], c=[0,1]: a is nearest b, orthogonal to c.
    fn seeded() -> TempPool {
        let pool = crate::testing::temp_pool("vec");
        {
            let conn = pool.get().unwrap();
            conn.execute("INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')", []).unwrap();
            let mk = |id: &str, genre: &str| {
                conn.execute(
                    "INSERT INTO items (id,kind,title,container,library,added_at,metadata) \
                     VALUES (?1,'movie','T','mkv','lib','t',?2)",
                    params![id, format!("{{\"tmdbId\":1,\"tmdbUrl\":\"x\",\"genres\":[\"{genre}\"]}}")],
                )
                .unwrap();
            };
            mk("a", "Horror");
            mk("b", "Horror");
            mk("c", "Comedy");
        }
        set_item_vector(&pool, "a", &[1.0, 0.0]).unwrap();
        set_item_vector(&pool, "b", &[0.8, 0.6]).unwrap();
        set_item_vector(&pool, "c", &[0.0, 1.0]).unwrap();
        pool
    }

    #[test]
    fn store_query_and_dims() {
        let p = seeded();
        assert!(has_vector(&p, "a").unwrap());
        assert!(!has_vector(&p, "ghost").unwrap());
        assert_eq!(item_ids_with_vector(&p).unwrap().len(), 3);
        assert_eq!(vector_dim(&p, "a").unwrap(), Some(2));
        assert!(vector_dim(&p, "ghost").unwrap().is_none());
        assert_eq!(vector_dims(&p).unwrap().len(), 3);

        // Blob roundtrip is bit-exact.
        let loaded: std::collections::HashMap<String, Vec<f32>> = load_vectors(&p).unwrap().into_iter().collect();
        assert_eq!(loaded["b"], vec![0.8, 0.6]);

        // Upsert overwrites in place (dim can change).
        set_item_vector(&p, "a", &[0.0, 0.0, 1.0]).unwrap();
        assert_eq!(vector_dim(&p, "a").unwrap(), Some(3));

        clear_item_vector(&p, "a").unwrap();
        assert!(!has_vector(&p, "a").unwrap());
    }

    #[test]
    fn similar_ranks_nearest_and_excludes_self() {
        let p = seeded();
        let near = similar(&p, "a", 10).unwrap();
        // a's nearest is b (dot 0.8), then c (dot 0.0); a itself excluded.
        assert_eq!(near.iter().map(|(id, _)| id.as_str()).collect::<Vec<_>>(), ["b", "c"]);
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
        assert!(for_you(&p, "u1", 10).unwrap().is_empty(), "no vector, so no centroid to rank from");
    }

    #[test]
    fn a_centroid_averages_only_the_vectors_of_its_own_width() {
        assert!(centroid_of(&[], &["a".to_string()]).is_none());

        let vectors =
            vec![("a".to_string(), vec![1.0, 0.0]), ("b".to_string(), vec![0.0, 1.0, 0.0])];
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
        assert_eq!(zero, vec![0.0, 0.0], "dividing by a zero norm would yield NaN");

        let mut v = vec![3.0f32, 4.0];
        l2_normalize(&mut v);
        assert_eq!(v, vec![0.6, 0.8]);
    }

    #[test]
    fn a_rail_that_the_genre_guard_already_fills_is_not_topped_up() {
        let p = seeded();
        let one = similar_items(&p, "a", 1).unwrap();
        assert_eq!(one.len(), 1);
        assert_eq!(one[0].id, "b");
    }

    #[test]
    fn a_rail_stops_topping_up_the_moment_it_is_full() {
        let p = seeded();
        p.get()
            .unwrap()
            .execute(
                "INSERT INTO items (id,kind,title,container,library,added_at,metadata) \
                 VALUES ('d','movie','T','mkv','lib','t',?1)",
                params![r#"{"tmdbId":1,"tmdbUrl":"x","genres":["Comedy"]}"#],
            )
            .unwrap();
        set_item_vector(&p, "d", &[0.1, 0.99]).unwrap();

        let ids: Vec<String> = similar_items(&p, "a", 2).unwrap().into_iter().map(|i| i.id).collect();
        assert_eq!(ids, ["b", "d"]);
    }

    #[test]
    fn prune_orphans_drops_vectors_without_a_title() {
        let p = seeded();
        // Add a vector for an id that is neither an item nor a show.
        set_item_vector(&p, "orphan", &[1.0, 1.0]).unwrap();
        assert_eq!(prune_orphan_vectors(&p).unwrap(), 1);
        assert!(!has_vector(&p, "orphan").unwrap());
        assert!(has_vector(&p, "a").unwrap());
    }

    #[test]
    fn render_ready_rows_hydrate() {
        let p = seeded();
        // similar_items tops up past the genre guard so the rail fills.
        let sim = similar_items(&p, "a", 2).unwrap();
        assert_eq!(sim.len(), 2);
        assert_eq!(sim[0].id, "b"); // nearest + shares Horror

        p.get()
            .unwrap()
            .execute(
                "INSERT INTO play_history (id,user_id,item_id,kind,title,started_at,ended_at) \
                 VALUES ('h1','u1','a','movie','T',0,100)",
                [],
            )
            .unwrap();
        let recs = recommended_for(&p, "u1", 2).unwrap();
        assert!(recs.iter().any(|i| i.id == "b"));

        // Themed row keeps only above-floor matches, then hydrates.
        let themed = themed_items(&p, &[1.0, 0.0], 5, 0.5).unwrap();
        let ids: Vec<&str> = themed.iter().map(|i| i.id.as_str()).collect();
        assert!(ids.contains(&"a") && ids.contains(&"b") && !ids.contains(&"c"));
    }

    #[test]
    fn similar_items_fills_from_recent_when_no_embedding() {
        let p = seeded();
        // 'z' is a movie with NO vector (un-embedded, like a fresh library or an
        // episode id): similar() is empty, so the rail must fall back to
        // recently-added titles rather than returning nothing.
        p.get()
            .unwrap()
            .execute(
                "INSERT INTO items (id,kind,title,container,library,added_at,metadata) \
                 VALUES ('z','movie','Z','mkv','lib','z','{\"tmdbId\":1,\"tmdbUrl\":\"x\",\"genres\":[\"SciFi\"]}')",
                [],
            )
            .unwrap();
        let sim = similar_items(&p, "z", 3).unwrap();
        assert_eq!(sim.len(), 3); // filled from a/b/c
        assert!(!sim.iter().any(|i| i.id == "z")); // never recommends the seed itself
    }
}

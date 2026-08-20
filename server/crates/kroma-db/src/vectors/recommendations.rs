//! Search results as render-ready items.

use super::{for_you, similar, themed};
use crate::{items_by_ids_ordered, Pool};
use anyhow::Result;

use kroma_domain::MediaItem;

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
    use crate::vectors::set_item_vector;
    use crate::vectors::test_support::*;
    use rusqlite::params;

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

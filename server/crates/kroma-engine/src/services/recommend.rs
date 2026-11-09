//! The recommendation rows a title page and the "For You" shelf draw, ranked
//! from the in-memory vector snapshot the home sections already keep.

use std::collections::HashSet;

use anyhow::Result;

use crate::db::{self, Pool};
use crate::model::MediaItem;
use crate::services::embeddings;
use crate::state::SharedState;

/// "More like this" for `id`: its nearest neighbours, the genre guard, and the
/// recently added titles that top the rail up.
pub fn similar(state: &SharedState, pool: &Pool, id: &str, n: usize) -> Result<Vec<MediaItem>> {
    state.vectors.refresh_if_stale(pool)?;
    let raw = state.vectors.similar(id, db::similar_depth(n));
    db::similar_items_from(pool, id, raw, n)
}

/// "For You": the unwatched titles nearest to what `user_id` watched recently.
/// Empty until they have watched something embeddable.
pub fn for_you(state: &SharedState, pool: &Pool, user_id: &str, n: usize) -> Result<Vec<MediaItem>> {
    let watched = db::recent_watched_ids(pool, user_id)?;
    if watched.is_empty() {
        return Ok(Vec::new());
    }
    state.vectors.refresh_if_stale(pool)?;
    let ranked = state.vectors.for_you(&watched, db::ranking_depth(n));
    db::recommended_from(pool, &ranked, n)
}

/// The titles nearest to a free-text `phrase`, keeping only the matches above
/// the embedder's relevance floor.
pub fn themed(state: &SharedState, pool: &Pool, phrase: &str, n: usize) -> Result<Vec<MediaItem>> {
    let query = embeddings::embed(&state.embedder, phrase);
    state.vectors.refresh_if_stale(pool)?;
    let ranked = state
        .vectors
        .nearest(&query, db::ranking_depth(n), &HashSet::new());
    db::themed_items_from(pool, ranked, n, embeddings::relevance_floor(&state.embedder))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::point::Point;
    use crate::test_support::{now_secs, seed_play, test_state, test_state_with_embedder};

    fn seed_catalog(state: &SharedState) {
        let conn = state.db.get().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
            [],
        )
        .unwrap();
        for (id, genre, vector) in CATALOG {
            conn.execute(
                &format!(
                    "INSERT INTO items (id,kind,title,container,library,added_at,metadata) \
                     VALUES ('{id}','movie','{id}','mkv','lib','t','{{\"tmdbId\":1,\"tmdbUrl\":\"x\",\"genres\":[\"{genre}\"]}}')"
                ),
                [],
            )
            .unwrap();
            db::set_item_vector(&state.db, id, vector).unwrap();
        }
    }

    const CATALOG: [(&str, &str, &[f32]); 5] = [
        ("a", "Horror", &[1.0, 0.0]),
        ("b", "Horror", &[0.8, 0.6]),
        ("c", "Comedy", &[0.6, 0.8]),
        ("d", "Horror", &[0.0, 1.0]),
        ("e", "Comedy", &[0.7, 0.71]),
    ];

    fn ids(items: Vec<MediaItem>) -> Vec<String> {
        items.into_iter().map(|item| item.id).collect()
    }

    fn pointing_at_a() -> Point {
        Point::stub("embedder", |method, _| match method {
            "meta" => Some(serde_json::json!({ "dim": 2, "relevance_floor": 0.5 })),
            "embed" => Some(serde_json::json!([1.0, 0.0])),
            _ => None,
        })
    }

    #[test]
    fn similar_ranks_the_same_rail_as_the_database_does() {
        let state = test_state();
        seed_catalog(&state);

        let rail = similar(&state, &state.db, "a", 3).unwrap();

        assert_eq!(ids(rail), ids(db::similar_items(&state.db, "a", 3).unwrap()));
    }

    #[test]
    fn for_you_ranks_the_same_shelf_as_the_database_does() {
        let state = test_state();
        seed_catalog(&state);
        seed_play(&state, "u1", "a", now_secs());

        let shelf = for_you(&state, &state.db, "u1", 3).unwrap();

        assert_eq!(ids(shelf), ids(db::recommended_for(&state.db, "u1", 3).unwrap()));
    }

    #[test]
    fn for_you_is_empty_for_somebody_who_has_watched_nothing() {
        let state = test_state();
        seed_catalog(&state);

        let shelf = for_you(&state, &state.db, "u1", 3).unwrap();

        assert!(shelf.is_empty());
    }

    #[test]
    fn themed_keeps_only_the_matches_above_the_floor() {
        let state = test_state_with_embedder(pointing_at_a());
        seed_catalog(&state);

        let row = themed(&state, &state.db, "slasher", 5).unwrap();

        assert_eq!(ids(row), ["a", "b", "e", "c"]);
    }
}

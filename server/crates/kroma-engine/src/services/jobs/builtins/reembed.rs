//! `recommendations.reembed` manual-only: re-embed every title from its **stored**
//! metadata with the active embedder after an embedder switch, without re-hitting
//! TMDB. Recommendations stay empty until a dimension change is reconciled here.

use super::prelude::*;

pub(super) const SPEC: Builtin = Builtin {
    key: JobKey("recommendations.reembed"),
    category: Category::Recommendations,
    schedule: None,
    triggers: &[],
    run,
};

pub(super) fn run(ctx: &JobContext) -> Result<()> {
    use kroma_domain::build_doc;
    use crate::infra::events::ServerEvent;
    use crate::model::Kind;

    let state = &ctx.state;
    let embedder = state.embedder.clone();
    let target = embedder.dim();
    let current = crate::db::vector_dims(&state.db)?;
    let (items, shows) = crate::db::index_snapshot(&state.db)?;
    // Movies/loose videos + shows carry metadata; episodes inherit (no vector).
    let movies: Vec<&crate::model::MediaItem> =
        items.iter().filter(|i| !matches!(i.kind, Kind::Episode)).collect();
    let total = movies.len() + shows.len();
    ctx.info(format!("re-embedding to dim {target} ({total} titles; skipping any already at {target})"));

    let mut embedded = 0usize;
    let mut skipped = 0usize;
    // Chunked because the embedder is out-of-process: one `embed_batch` per chunk
    // is a single round-trip, versus one IPC per title for `embed`.
    let mut pending: Vec<(String, String)> = Vec::new();
    let mut consider = |id: &str, title: &str, year: Option<u32>, meta: Option<&crate::model::Metadata>| {
        if current.get(id).copied() == Some(target) {
            skipped += 1;
        } else if let Some(meta) = meta {
            pending.push((id.to_string(), build_doc(title, year, meta)));
        }
    };
    for m in movies {
        consider(&m.id, &m.title, m.year, m.metadata.as_ref());
    }
    for s in &shows {
        consider(&s.id, &s.title, s.year, s.metadata.as_ref());
    }

    const CHUNK: usize = 128;
    let mut done = skipped;
    for chunk in pending.chunks(CHUNK) {
        if ctx.cancelled() {
            ctx.warn("cancellation requested stopping");
            return Ok(());
        }
        let docs: Vec<String> = chunk.iter().map(|(_, doc)| doc.clone()).collect();
        // An absent sidecar returns an empty batch, so the zip yields nothing and
        // the pass is a graceful no-op.
        for ((id, _), vec) in chunk.iter().zip(embedder.embed_batch(&docs)) {
            match crate::db::set_item_vector(&state.db, id, &vec) {
                Ok(()) => embedded += 1,
                Err(e) => ctx.error(format!("{id}: failed to store vector: {e}")),
            }
        }
        done += chunk.len();
        ctx.progress(done, total);
    }

    ctx.info(format!("re-embedded {embedded} titles, skipped {skipped} already at dim {target}"));
    state.vectors.refresh_if_stale(&state.db)?;
    state.events.publish(ServerEvent::LibraryUpdated);
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::run;
    use crate::ports::Embedder;
    use crate::services::jobs::JobContext;
    use crate::state::SharedState;
    use crate::test_support::{seed_movie, test_state_with_embedder};

    // Stamps a call counter into every vector, so a re-embed is distinguishable
    // from a skip.
    struct FixedDim {
        dim: usize,
        calls: std::sync::atomic::AtomicUsize,
    }

    impl Embedder for FixedDim {
        fn dim(&self) -> usize {
            self.dim
        }
        fn embed(&self, _text: &str) -> Vec<f32> {
            let n = self.calls.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
            let mut v = vec![0.0f32; self.dim];
            if let Some(first) = v.first_mut() {
                *first = n as f32;
            }
            v
        }
        fn relevance_floor(&self) -> f32 {
            0.1
        }
    }

    fn state_with_dim(dim: usize) -> SharedState {
        test_state_with_embedder(Arc::new(FixedDim {
            dim,
            calls: std::sync::atomic::AtomicUsize::new(0),
        }))
    }

    fn vector_of(state: &SharedState, id: &str) -> Option<Vec<f32>> {
        crate::db::load_vectors(&state.db)
            .unwrap()
            .into_iter()
            .find(|(vid, _)| vid == id)
            .map(|(_, v)| v)
    }

    fn seed_enriched_movie(state: &SharedState, id: &str) {
        seed_movie(state, id);
        let meta = serde_json::json!({
            "tmdbId": 1234,
            "title": format!("Title {id}"),
            "overview": "A crew pulls off one last job.",
            "genres": ["Thriller", "Crime"],
            "tmdbUrl": "https://www.themoviedb.org/movie/1234",
        })
        .to_string();
        state
            .db
            .get()
            .unwrap()
            .execute(&format!("UPDATE items SET metadata = json('{meta}') WHERE id = '{id}'"), [])
            .unwrap();
    }

    fn stored_dims(state: &SharedState) -> Vec<usize> {
        let mut dims: Vec<usize> =
            crate::db::vector_dims(&state.db).unwrap().into_values().collect();
        dims.sort_unstable();
        dims
    }

    #[test]
    fn an_empty_library_is_a_no_op_not_an_error() {
        let state = state_with_dim(8);
        run(&JobContext::for_test(state.clone())).unwrap();
        assert!(stored_dims(&state).is_empty());
    }

    #[test]
    fn a_title_with_no_stored_metadata_is_skipped() {
        // The job never re-hits TMDB, so a title that was never enriched has no
        // document to embed and must not be embedded from its filename.
        let state = state_with_dim(8);
        seed_movie(&state, "itm-bare");
        run(&JobContext::for_test(state.clone())).unwrap();
        assert!(stored_dims(&state).is_empty());
    }

    #[test]
    fn every_enriched_title_gets_a_vector_at_the_active_dimension() {
        let state = state_with_dim(8);
        seed_enriched_movie(&state, "itm-1");
        seed_enriched_movie(&state, "itm-2");
        run(&JobContext::for_test(state.clone())).unwrap();
        assert_eq!(stored_dims(&state), vec![8, 8]);
    }

    #[test]
    fn a_show_is_re_embedded_from_its_own_metadata_like_a_film() {
        let state = state_with_dim(8);
        let (show, _ep) = crate::test_support::seed_show_episode(&state, "shw-1", "ep-1");
        let meta = serde_json::json!({
            "tmdbId": 99,
            "title": "A Show",
            "overview": "Six seasons and a movie.",
            "genres": ["Comedy"],
            "tmdbUrl": "https://www.themoviedb.org/tv/99",
        })
        .to_string();
        state
            .db
            .get()
            .unwrap()
            .execute(&format!("UPDATE shows SET metadata = json('{meta}') WHERE id = '{show}'"), [])
            .unwrap();

        run(&JobContext::for_test(state.clone())).unwrap();

        assert!(vector_of(&state, &show).is_some());
        assert!(vector_of(&state, "ep-1").is_none(), "the episode inherits, it is not embedded");
    }

    #[test]
    fn a_title_whose_vector_will_not_store_is_reported_and_the_pass_goes_on() {
        let state = state_with_dim(8);
        seed_enriched_movie(&state, "itm-1");
        seed_enriched_movie(&state, "itm-2");
        state
            .db
            .get()
            .unwrap()
            .execute(
                "CREATE TRIGGER no_writes BEFORE INSERT ON item_vectors                  BEGIN SELECT RAISE(ABORT, 'read-only'); END",
                [],
            )
            .unwrap();

        let handle = std::sync::Arc::new(crate::services::jobs::RunHandle::new(
            "run-ro".into(),
            "recommendations.reembed".into(),
        ));
        run(&JobContext::from_handle(state.clone(), handle)).unwrap();

        assert!(stored_dims(&state).is_empty());
        let conn = state.db.get().unwrap();
        let mut stmt = conn
            .prepare("SELECT message FROM job_logs WHERE run_id = 'run-ro' AND level = 'error'")
            .unwrap();
        let errors: Vec<String> =
            stmt.query_map([], |r| r.get::<_, String>(0)).unwrap().map(|r| r.unwrap()).collect();
        assert_eq!(errors.len(), 2, "one line per title, not one for the pass: {errors:?}");
        assert!(errors.iter().all(|e| e.contains("failed to store vector")), "{errors:?}");
    }

    #[test]
    fn a_cancelled_pass_stops_before_the_next_chunk() {
        let state = state_with_dim(8);
        seed_enriched_movie(&state, "itm-1");
        let handle = std::sync::Arc::new(crate::services::jobs::RunHandle::new(
            "r".into(),
            "recommendations.reembed".into(),
        ));
        handle.request_cancel();

        run(&JobContext::from_handle(state.clone(), handle)).unwrap();
        assert!(stored_dims(&state).is_empty());
    }

    #[test]
    fn a_second_pass_at_the_same_dimension_rewrites_nothing() {
        let state = state_with_dim(8);
        seed_enriched_movie(&state, "itm-1");
        run(&JobContext::for_test(state.clone())).unwrap();

        let before = vector_of(&state, "itm-1").expect("first pass stored a vector");
        run(&JobContext::for_test(state.clone())).unwrap();
        assert_eq!(vector_of(&state, "itm-1"), Some(before));
    }

    #[test]
    fn a_stale_vector_from_the_previous_embedder_is_replaced() {
        let state = state_with_dim(4);
        seed_enriched_movie(&state, "itm-1");
        run(&JobContext::for_test(state.clone())).unwrap();
        assert_eq!(stored_dims(&state), vec![4]);

        let bigger = state_with_dim(16);
        seed_enriched_movie(&bigger, "itm-1");
        crate::db::set_item_vector(&bigger.db, "itm-1", &[0.5f32; 4]).unwrap();
        assert_eq!(stored_dims(&bigger), vec![4]);
        run(&JobContext::for_test(bigger.clone())).unwrap();
        assert_eq!(stored_dims(&bigger), vec![16], "the 4-dim vector was left behind");
    }

    // A missing sidecar: `embed_batch` answers with no vectors at all, rather
    // than with one empty vector per document.
    struct SilentBatch;

    impl Embedder for SilentBatch {
        fn dim(&self) -> usize {
            384
        }
        fn embed(&self, _text: &str) -> Vec<f32> {
            Vec::new()
        }
        fn embed_batch(&self, _texts: &[String]) -> Vec<Vec<f32>> {
            Vec::new()
        }
        fn relevance_floor(&self) -> f32 {
            1.0
        }
    }

    #[test]
    fn an_unreachable_sidecar_stores_nothing_instead_of_failing() {
        // A hard error here would be a red job on every install running without
        // the vector module.
        let state = test_state_with_embedder(Arc::new(SilentBatch));
        seed_enriched_movie(&state, "itm-1");
        run(&JobContext::for_test(state.clone())).unwrap();
        assert!(stored_dims(&state).is_empty());
    }

    #[test]
    fn the_in_process_fallback_writes_placeholder_vectors_rather_than_none() {
        // Unlike the unreachable-sidecar case, NoopEmbedder's inherited
        // embed_batch loops `embed`, so a zero-length row is stored per title.
        let state = crate::test_support::test_state();
        seed_enriched_movie(&state, "itm-1");
        run(&JobContext::for_test(state.clone())).unwrap();
        assert_eq!(stored_dims(&state), vec![0]);
    }
}

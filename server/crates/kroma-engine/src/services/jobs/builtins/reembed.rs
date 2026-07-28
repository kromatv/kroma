//! `recommendations.reembed` manual-only. Re-embed every title from its
//! **stored** metadata with the active embedder for after an embedder switch
//! (e.g. enabling MiniLM, 256→384-dim), WITHOUT re-hitting TMDB. Until this runs,
//! recommendations are empty whenever the stored vector dimension no longer
//! matches the embedder. Refreshes the in-memory vector cache when done.

use super::prelude::*;

/// Manual-only: recompute content embeddings (heavy; run on demand).
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
    // Skip vectors already at the active dim → an embedder switch (or a re-run
    // after an interrupted pass) only touches what's stale.
    let current = crate::db::vector_dims(&state.db)?;
    let (items, shows) = crate::db::index_snapshot(&state.db)?;
    // Movies/loose videos + shows carry metadata; episodes inherit (no vector).
    let movies: Vec<&crate::model::MediaItem> =
        items.iter().filter(|i| !matches!(i.kind, Kind::Episode)).collect();
    let total = movies.len() + shows.len();
    ctx.info(format!("re-embedding to dim {target} ({total} titles; skipping any already at {target})"));

    let mut embedded = 0usize;
    let mut skipped = 0usize;
    // Collect the titles that need a fresh vector (id + its document), skipping
    // any already at the active dim. Then embed in CHUNKS: with the embedder now
    // out-of-process (the tv.kroma.vector .kmod), one `embed_batch` per chunk is
    // a single round-trip, versus one IPC per title (thousands) for `embed`.
    let mut pending: Vec<(String, String)> = Vec::new();
    let mut consider = |id: &str, title: &str, year: Option<u32>, meta: Option<&crate::model::Metadata>| {
        if current.get(id).copied() == Some(target) {
            skipped += 1; // already current leave it
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
        // On an absent sidecar `embed_batch` returns empty → the zip is empty and
        // nothing is stored (graceful no-op), matching the old NoopEmbedder path.
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

    /// An embedder with a real dimension, so "already at the active dim" means
    /// something. Each call stamps its own sequence number into the vector, so a
    /// re-embed is distinguishable from a skip.
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

    /// A movie plus the stored metadata the job re-embeds FROM - without a
    /// metadata row there is no document, and the title is skipped entirely.
    fn seed_enriched_movie(state: &SharedState, id: &str) {
        seed_movie(state, id);
        // `items.metadata` is the stored TMDB document the job re-embeds FROM.
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
        // The job deliberately does NOT re-hit TMDB, so a title that was never
        // enriched has no document to embed and must be passed over rather than
        // embedded from its filename.
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
    fn a_second_pass_at_the_same_dimension_rewrites_nothing() {
        // This is the point of the skip: re-running after an interrupted pass,
        // or on a schedule, must not re-embed a catalogue that is already
        // current - on a real library that is the difference between seconds and
        // a very long job.
        let state = state_with_dim(8);
        seed_enriched_movie(&state, "itm-1");
        run(&JobContext::for_test(state.clone())).unwrap();

        // The embedder stamps a call counter into every vector it produces, so
        // an unchanged vector proves the second pass never asked for one.
        let before = vector_of(&state, "itm-1").expect("first pass stored a vector");
        run(&JobContext::for_test(state.clone())).unwrap();
        assert_eq!(vector_of(&state, "itm-1"), Some(before));
    }

    #[test]
    fn a_stale_vector_from_the_previous_embedder_is_replaced() {
        // The situation the job exists for: the embedder changed dimension, so
        // every stored vector is unusable and recommendations are empty until
        // this runs.
        let state = state_with_dim(4);
        seed_enriched_movie(&state, "itm-1");
        run(&JobContext::for_test(state.clone())).unwrap();
        assert_eq!(stored_dims(&state), vec![4]);

        let bigger = state_with_dim(16);
        seed_enriched_movie(&bigger, "itm-1");
        crate::db::set_item_vector(&bigger.db, "itm-1", &vec![0.5f32; 4]).unwrap();
        assert_eq!(stored_dims(&bigger), vec![4]);
        run(&JobContext::for_test(bigger.clone())).unwrap();
        assert_eq!(stored_dims(&bigger), vec![16], "the 4-dim vector was left behind");
    }

    /// A sidecar that is not there: `embed_batch` answers with no vectors at
    /// all, rather than with one empty vector per document.
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
        // With the vector module disabled the batch comes back empty, so the zip
        // yields nothing. The pass still has to end cleanly - a hard error here
        // would show up as a red job on every install that runs without the
        // module.
        let state = test_state_with_embedder(Arc::new(SilentBatch));
        seed_enriched_movie(&state, "itm-1");
        run(&JobContext::for_test(state.clone())).unwrap();
        assert!(stored_dims(&state).is_empty());
    }

    #[test]
    fn the_in_process_fallback_writes_placeholder_vectors_rather_than_none() {
        // Worth pinning because it differs from the unreachable-sidecar case
        // above: NoopEmbedder's inherited embed_batch loops `embed`, so it
        // returns one EMPTY vector per title and a zero-length row is stored for
        // each. Harmless (nothing matches a zero-length vector) but it is what
        // happens, and a future change here should be deliberate.
        let state = crate::test_support::test_state();
        seed_enriched_movie(&state, "itm-1");
        run(&JobContext::for_test(state.clone())).unwrap();
        assert_eq!(stored_dims(&state), vec![0]);
    }
}

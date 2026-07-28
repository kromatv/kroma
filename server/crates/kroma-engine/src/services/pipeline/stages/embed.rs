//! Pipeline stage `embed`: compute the content embedding (for "For You" / similar
//! rows) per title from its stored metadata, using the active embedder. Depends on
//! `metadata` (only titles that already have metadata are enumerated). Signed by
//! the embedder's dimension, so switching models re-embeds everything; a vector
//! already at the current dim is a no-op.

use anyhow::{anyhow, Result};

use kroma_domain::build_doc;
use crate::model::{Kind, Metadata};
use crate::services::jobs::{JobContext, JobKey, Trigger};
use crate::state::SharedState;

use super::common::stage;

// BERT embedding is in-process CPU work, so it yields to live playback. Nightly +
// after the metadata stage (fresh metadata -> fresh embedding) + manual.
stage! {
    short: "embed",
    subject_kind: "item",
    concurrency: 4,
    pause_for_playback: true,
    schedule: Some("45 4 * * *"),
    triggers: &[Trigger::AfterJob(JobKey("pipeline.metadata"))],
}

/// Every movie/show that already has metadata, signed by the active embedder's
/// dimension so a model switch re-queues them all.
fn enumerate(state: &SharedState) -> Result<Vec<(String, String)>> {
    let sig = state.embedder.dim().to_string();
    let (items, shows) = crate::db::index_snapshot(&state.db)?;
    let mut out = Vec::new();
    for i in items {
        if !matches!(i.kind, Kind::Episode) && i.metadata.is_some() {
            out.push((i.id, sig.clone()));
        }
    }
    for s in shows {
        if s.metadata.is_some() {
            out.push((s.id, sig.clone()));
        }
    }
    Ok(out)
}

fn process(ctx: &JobContext, id: &str) -> Result<()> {
    let embedder = ctx.state.embedder.clone();
    let target = embedder.dim();
    // Already at the active dim? nothing to do. Single-row lookup (not the whole
    // `item_vectors` table) so a full re-embed stays O(N), not O(N^2).
    if crate::db::vector_dim(&ctx.state.db, id)? == Some(target) {
        return Ok(());
    }
    let Some((title, year, meta)) = title_year_meta(&ctx.state, id)? else {
        return Ok(()); // gone, or no metadata yet (waiting on the metadata stage)
    };
    let vec = embedder.embed(&build_doc(&title, year, &meta));
    crate::db::set_item_vector(&ctx.state.db, id, &vec).map_err(|e| anyhow!(e))
}

/// `(title, year, metadata)` for a movie or show id, or `None` when it has no
/// metadata to embed yet.
fn title_year_meta(
    state: &SharedState,
    id: &str,
) -> Result<Option<(String, Option<u32>, Metadata)>> {
    if let Some(item) = crate::db::get_item(&state.db, id)? {
        return Ok(item.metadata.map(|m| (item.title, item.year, m)));
    }
    if let Some(detail) = crate::db::get_show(&state.db, id)? {
        let show = detail.show;
        return Ok(show.metadata.map(|m| (show.title, show.year, m)));
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::ports::Embedder;
    use crate::test_support::{seed_movie, seed_show_episode, test_state_with_embedder};

    /// An embedder of a fixed width, so "already at the active dim" is a real
    /// distinction (NoopEmbedder reports 0 and makes every comparison vacuous).
    struct FixedDim(usize);

    impl Embedder for FixedDim {
        fn dim(&self) -> usize {
            self.0
        }
        fn embed(&self, _text: &str) -> Vec<f32> {
            vec![0.5; self.0]
        }
        fn relevance_floor(&self) -> f32 {
            0.1
        }
    }

    fn state(dim: usize) -> SharedState {
        test_state_with_embedder(Arc::new(FixedDim(dim)))
    }

    const META: &str = r#"{"tmdbId":1,"title":"T","overview":"o","genres":["Drama"],"tmdbUrl":"https://x/1"}"#;

    fn give_metadata(state: &SharedState, table: &str, id: &str) {
        state
            .db
            .get()
            .unwrap()
            .execute(
                &format!("UPDATE {table} SET metadata = json('{META}') WHERE id = '{id}'"),
                [],
            )
            .unwrap();
    }

    #[test]
    fn only_titles_that_already_have_metadata_are_enumerated() {
        // The stage depends on `metadata`; queuing a title before its metadata
        // lands would embed a document that is mostly the filename.
        let st = state(8);
        seed_movie(&st, "itm-with");
        seed_movie(&st, "itm-without");
        give_metadata(&st, "items", "itm-with");

        let queued = enumerate(&st).unwrap();
        let ids: Vec<&str> = queued.iter().map(|(id, _)| id.as_str()).collect();
        assert_eq!(ids, ["itm-with"]);
    }

    #[test]
    fn episodes_are_never_enumerated() {
        // An episode inherits its show's embedding; embedding each one would
        // multiply the work by the size of the library and add nothing.
        let st = state(8);
        let (show, ep) = seed_show_episode(&st, "shw-1", "ep-1");
        give_metadata(&st, "shows", &show);
        give_metadata(&st, "items", &ep);

        let ids: Vec<String> = enumerate(&st).unwrap().into_iter().map(|(id, _)| id).collect();
        assert!(ids.contains(&show), "the show itself should be queued");
        assert!(!ids.contains(&ep), "an episode must not be");
    }

    #[test]
    fn the_signature_is_the_embedder_dimension_so_a_model_switch_requeues() {
        // The signature is what makes the ledger re-run a title. Without the dim
        // in it, switching models would leave every vector at the old width and
        // recommendations silently empty.
        let st = state(8);
        seed_movie(&st, "itm-1");
        give_metadata(&st, "items", "itm-1");
        assert_eq!(enumerate(&st).unwrap()[0].1, "8");

        let bigger = state(384);
        seed_movie(&bigger, "itm-1");
        give_metadata(&bigger, "items", "itm-1");
        assert_eq!(enumerate(&bigger).unwrap()[0].1, "384");
    }

    #[test]
    fn processing_writes_a_vector_at_the_active_dimension() {
        let st = state(8);
        seed_movie(&st, "itm-1");
        give_metadata(&st, "items", "itm-1");

        process(&JobContext::for_test(st.clone()), "itm-1").unwrap();
        assert_eq!(crate::db::vector_dim(&st.db, "itm-1").unwrap(), Some(8));
    }

    #[test]
    fn a_vector_already_at_the_active_dimension_is_left_alone() {
        // This is what keeps a nightly re-run cheap: the check is a single-row
        // lookup, so a full pass stays O(N) rather than O(N^2).
        let st = state(4);
        seed_movie(&st, "itm-1");
        give_metadata(&st, "items", "itm-1");
        crate::db::set_item_vector(&st.db, "itm-1", &[1.0, 2.0, 3.0, 4.0]).unwrap();

        process(&JobContext::for_test(st.clone()), "itm-1").unwrap();
        let stored = crate::db::load_vectors(&st.db)
            .unwrap()
            .into_iter()
            .find(|(id, _)| id == "itm-1")
            .map(|(_, v)| v)
            .unwrap();
        assert_eq!(stored, vec![1.0, 2.0, 3.0, 4.0], "the vector was rewritten");
    }

    #[test]
    fn a_stale_vector_from_another_model_is_replaced() {
        let st = state(8);
        seed_movie(&st, "itm-1");
        give_metadata(&st, "items", "itm-1");
        crate::db::set_item_vector(&st.db, "itm-1", &[1.0, 2.0]).unwrap();

        process(&JobContext::for_test(st.clone()), "itm-1").unwrap();
        assert_eq!(crate::db::vector_dim(&st.db, "itm-1").unwrap(), Some(8));
    }

    #[test]
    fn a_title_with_no_metadata_yet_is_skipped_rather_than_failed() {
        // It is waiting on the metadata stage; failing here would mark the task
        // failed and need a manual retry once metadata lands.
        let st = state(8);
        seed_movie(&st, "itm-1");
        process(&JobContext::for_test(st.clone()), "itm-1").unwrap();
        assert_eq!(crate::db::vector_dim(&st.db, "itm-1").unwrap(), None);
    }

    #[test]
    fn a_title_deleted_between_enumerate_and_process_is_not_an_error() {
        // The ledger is enumerated up front, so a title removed in between is a
        // normal race - not a failure to record against the run.
        let st = state(8);
        process(&JobContext::for_test(st.clone()), "gone").unwrap();
        assert_eq!(crate::db::vector_dim(&st.db, "gone").unwrap(), None);
    }

    #[test]
    fn a_show_is_embedded_from_its_own_metadata() {
        // Shows and movies live in different tables; only one lookup would leave
        // every series without a vector.
        let st = state(8);
        let (show, _ep) = seed_show_episode(&st, "shw-1", "ep-1");
        give_metadata(&st, "shows", &show);

        process(&JobContext::for_test(st.clone()), &show).unwrap();
        assert_eq!(crate::db::vector_dim(&st.db, &show).unwrap(), Some(8));
    }
}

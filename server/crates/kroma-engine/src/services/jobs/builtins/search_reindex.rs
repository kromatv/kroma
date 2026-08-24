//! `search.reindex` rebuild the in-RAM full-text search index from the database.

use super::prelude::*;

// Chained after the `metadata` stage, which rewrites the fields the index is
// built from; without it a corrected title stays unsearchable.
pub(super) const SPEC: Builtin = Builtin {
    key: JobKey("search.reindex"),
    category: Category::Library,
    schedule: None,
    triggers: &[Trigger::AfterJob(JobKey("pipeline.metadata"))],
    run,
};

pub(super) fn run(ctx: &JobContext) -> Result<()> {
    ctx.info("rebuilding the search index from the database…");
    ctx.state.search.reindex_from_db(&ctx.state.db)?;
    ctx.info("search index rebuilt");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::run;
    use crate::services::jobs::JobContext;
    use crate::test_support::{seed_movie, test_state};

    #[test]
    fn a_title_added_since_the_last_build_becomes_searchable() {
        let state = test_state();
        seed_movie(&state, "itm-1");
        assert!(
            state.search.search("itm-1", 5).is_empty(),
            "not indexed yet"
        );

        run(&JobContext::for_test(state.clone())).unwrap();

        let hits = state.search.search("Title itm-1", 5);
        assert_eq!(hits.first().map(|h| h.id.as_str()), Some("itm-1"));
    }
}

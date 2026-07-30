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

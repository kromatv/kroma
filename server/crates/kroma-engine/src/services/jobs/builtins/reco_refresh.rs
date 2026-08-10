//! `recommendations.refresh` refresh the in-memory embedding snapshot that
//! powers "For You" / similar / themed rows, so the home sections reflect the
//! latest catalog + art.

use super::prelude::*;

// Nightly: rebuild the recommendation indexes from the current library.
pub(super) const SPEC: Builtin = Builtin {
    key: JobKey("recommendations.refresh"),
    category: Category::Recommendations,
    schedule: Some("0 5 * * *"),
    triggers: &[],
    run,
};

pub(super) fn run(ctx: &JobContext) -> Result<()> {
    ctx.info("refreshing recommendation vectors from the database…");
    ctx.state.vectors.refresh_if_stale(&ctx.state.db)?;
    ctx.info("recommendation vectors are up to date");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::run;
    use crate::services::jobs::JobContext;
    use crate::test_support::{seed_movie, test_state};

    #[test]
    fn a_vector_stored_since_the_last_refresh_reaches_the_in_memory_snapshot() {
        let state = test_state();
        seed_movie(&state, "itm-1");
        crate::db::set_item_vector(&state.db, "itm-1", &[1.0f32, 0.0]).unwrap();
        assert!(state.vectors.vectors_for(&["itm-1".to_string()]).is_empty());

        run(&JobContext::for_test(state.clone())).unwrap();

        assert_eq!(state.vectors.vectors_for(&["itm-1".to_string()]).len(), 1);
    }
}

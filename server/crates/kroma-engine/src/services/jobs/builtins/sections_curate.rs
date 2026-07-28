//! `sections.curate` the editorial curation job: deterministic director
//! collections (from crew metadata) + LLM-curated genre/list/franchise/decade/
//! mood rows, tool-driven when the provider can function-call, else a
//! catalog-in-prompt fallback. Members are grounded to the real catalog either
//! way. The curation *logic* lives in `services::sections::curate`; this is the
//! job that orchestrates it.

use super::prelude::*;

/// Nightly: build editorial collections (director rows + LLM-curated rows).
pub(super) const SPEC: Builtin = Builtin {
    key: JobKey("sections.curate"),
    category: Category::Recommendations,
    schedule: Some("0 6 * * *"),
    triggers: &[],
    run,
};

/// How many catalog titles to hand the model when curating editorial collections
/// (highest-rated/most-recent first), bounding the prompt's token budget. Only
/// used by the catalog-in-prompt fallback the tool-driven path queries instead.
const MAX_CURATE_CATALOG: usize = 600;

/// Max model turns in the tool-driven curate loop. A model that batches tool
/// calls finishes in a handful of turns; a one-call-per-turn model needs ~2
/// (genres+people) + up to `MAX_LLM` (14, in `curate.rs`) `find_titles` + a few
/// `get_title` + the final JSON reply, so 24 keeps real headroom before it bails.
const MAX_TOOL_STEPS: usize = 24;

pub(super) fn run(ctx: &JobContext) -> Result<()> {
    use crate::infra::events::ServerEvent;
    use crate::services::sections::curate;
    let state = &ctx.state;

    let items = crate::db::list_items(&state.db, None)?;
    let shows = crate::db::list_shows(&state.db, None)?;
    let catalog = curate::build_catalog(&items, &shows);
    let movies = items.iter().filter(|i| !matches!(i.kind, crate::model::Kind::Episode)).count();
    ctx.info(format!("catalog: {} entries ({movies} movies/videos + {} shows)", catalog.len(), shows.len()));

    // 1) Deterministic director collections (accurate, from crew metadata).
    let director_rows = curate::director_collections(&catalog);
    ctx.debug(format!("director collections: {}", director_rows.len()));
    if director_rows.is_empty() {
        ctx.debug("no director collections crew metadata may be missing; re-run metadata.enrich");
    }

    // 2) LLM editorial collections tool-driven when the provider supports
    //    function calling (the model queries the library directly), else the
    //    catalog-in-prompt fallback.
    let mut llm_rows = Vec::new();
    let llm = crate::infra::llm::from_settings(&state.settings);
    if llm.available() {
        // Curating many collections × many members is a large reply far bigger
        // than the per-user naming task so floor the budget well above the
        // provider's default to avoid a truncated (unparseable) JSON array.
        let max_tokens = crate::services::settings::default_provider(&state.settings)
            .map(|p| p.max_tokens)
            .unwrap_or(900)
            .clamp(4096, 8192) as u32;
        if llm.supports_tools() {
            match curate_with_tools(ctx, &*llm, &catalog, max_tokens) {
                Ok(rows) if !rows.is_empty() => llm_rows = rows,
                Ok(_) => {
                    ctx.warn("tool-driven curate returned no usable collections falling back to catalog-in-prompt");
                    llm_rows = curate_with_prompt(ctx, &*llm, &catalog, max_tokens);
                }
                Err(e) => {
                    ctx.error(format!("tool-driven curate failed: {e:#} falling back to catalog-in-prompt"));
                    llm_rows = curate_with_prompt(ctx, &*llm, &catalog, max_tokens);
                }
            }
        } else {
            ctx.debug("LLM does not support tool calling using catalog-in-prompt curate");
            llm_rows = curate_with_prompt(ctx, &*llm, &catalog, max_tokens);
        }
    } else {
        ctx.warn("no LLM configured only deterministic director collections (enable one under Admin → IA)");
    }

    // Interleave the two sources for variety, assign rank, persist (replace-all).
    let mut rows = interleave(director_rows.into_iter(), llm_rows.into_iter());
    for (i, r) in rows.iter_mut().enumerate() {
        r.rank = i as i64;
    }
    let n = rows.len();
    crate::db::set_curated(&state.db, &rows)?;
    ctx.info(format!("curated {n} collections"));
    state.events.publish(ServerEvent::LibraryUpdated);
    Ok(())
}

/// Tool-driven editorial curation: hand the model the catalog connector and let
/// it query the library directly, then resolve its **id**-based members exactly.
/// Errors so the caller can fall back to the catalog-in-prompt path.
fn curate_with_tools(
    ctx: &JobContext,
    llm: &dyn crate::infra::llm::LlmClient,
    catalog: &[crate::services::sections::curate::CatalogEntry],
    max_tokens: u32,
) -> Result<Vec<crate::db::CuratedRow>> {
    use crate::infra::llm::ToolBox;
    use crate::services::llm::CatalogTools;
    use crate::services::sections::curate;

    // Logger so each tool call shows in the Tâches run log (name + args + size).
    let tools = CatalogTools::new(ctx.state.db.clone(), Some(ctx.debug_logger()));
    let defs = tools.defs();
    let (system, user) = curate::tool_curate_prompt();
    ctx.debug(format!(
        "tool-driven curate via {} ({} tools, ≤{} steps)",
        llm.describe(),
        defs.len(),
        MAX_TOOL_STEPS
    ));
    let reply = llm.run_tools(&system, &user, &defs, &tools, max_tokens, MAX_TOOL_STEPS)?;
    let specs = curate::parse_curate(&reply)?;
    let (rows, dropped) = curate::resolve_members_by_id(&specs, catalog);
    ctx.info(format!(
        "LLM tool collections: {} kept, {} dropped (< {} valid ids)",
        rows.len(),
        dropped,
        curate::MIN_ITEMS
    ));
    Ok(rows)
}

/// Catalog-in-prompt editorial curation (fallback): hand the model a pruned slice
/// of titles in the prompt and match its **title**-based members back to ids.
/// Logs and returns whatever it produced (empty on request/parse failure).
fn curate_with_prompt(
    ctx: &JobContext,
    llm: &dyn crate::infra::llm::LlmClient,
    catalog: &[crate::services::sections::curate::CatalogEntry],
    max_tokens: u32,
) -> Vec<crate::db::CuratedRow> {
    use crate::services::sections::curate;

    let pruned = curate::prune_for_prompt(catalog, MAX_CURATE_CATALOG);
    let (system, user) = curate::build_curate_prompt(&pruned);
    ctx.debug(format!(
        "catalog-in-prompt curate: {} titles, {} chars → {}",
        pruned.len(),
        system.len() + user.len(),
        llm.describe()
    ));
    match llm.complete(&system, &user, max_tokens) {
        Ok(reply) => match curate::parse_curate(&reply) {
            Ok(specs) => {
                let (rows, dropped) = curate::resolve_members(&specs, catalog);
                ctx.info(format!(
                    "LLM collections: {} kept, {} dropped (< {} catalog matches)",
                    rows.len(),
                    dropped,
                    curate::MIN_ITEMS
                ));
                rows
            }
            Err(e) => {
                ctx.error(format!("could not parse model reply: {e} reply: {}", snippet(&reply)));
                Vec::new()
            }
        },
        Err(e) => {
            ctx.error(format!("LLM request failed: {e:#}"));
            Vec::new()
        }
    }
}

/// Alternate two iterators (a, b, a, b, …) so a mix of both sources surfaces even
/// when one dominates.
fn interleave<T>(mut a: impl Iterator<Item = T>, mut b: impl Iterator<Item = T>) -> Vec<T> {
    let mut out = Vec::new();
    loop {
        match (a.next(), b.next()) {
            (Some(x), Some(y)) => {
                out.push(x);
                out.push(y);
            }
            (Some(x), None) => out.push(x),
            (None, Some(y)) => out.push(y),
            (None, None) => break,
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::{interleave, run};
    use crate::services::jobs::JobContext;
    use crate::test_support::{seed_movie, seed_show_episode, test_state};


    /// A curated row already in the table, so a run can be shown to REPLACE it.
    fn stale_row() -> crate::db::CuratedRow {
        crate::db::CuratedRow {
            key: "stale".into(),
            rank: 0,
            source: "llm".into(),
            item_ids: vec!["itm-gone".into()],
            titles: HashMap::from([("en".to_string(), "Yesterday's row".to_string())]),
            reasons: HashMap::new(),
        }
    }

    #[test]
    fn runs_on_an_empty_library() {
        // A fresh install runs this nightly before anything is scanned; it must
        // be a no-op rather than an error in the job log.
        let state = test_state();
        run(&JobContext::for_test(state.clone())).unwrap();
        assert!(crate::db::get_curated(&state.db).unwrap().is_empty());
    }

    #[test]
    fn runs_without_an_llm_configured() {
        // The common case for a self-hosted install: no AI provider. The
        // deterministic director collections still run - only the editorial rows
        // are skipped - so the job must not fail or bail early.
        let state = test_state();
        seed_movie(&state, "itm-1");
        seed_show_episode(&state, "shw-1", "ep-1");

        run(&JobContext::for_test(state.clone())).unwrap();
    }

    #[test]
    fn replaces_whatever_was_curated_before() {
        let state = test_state();
        crate::db::set_curated(&state.db, &[stale_row()]).unwrap();
        assert_eq!(crate::db::get_curated(&state.db).unwrap().len(), 1);

        run(&JobContext::for_test(state.clone())).unwrap();
        // REPLACE-all, not merge: a collection whose members have since been
        // deleted must not survive the next curation as a row pointing at
        // nothing.
        let after = crate::db::get_curated(&state.db).unwrap();
        assert!(after.iter().all(|r| r.key != "stale"), "{:?}", after);
    }

    #[test]
    fn ranks_every_row_contiguously_from_zero() {
        let state = test_state();
        seed_movie(&state, "itm-1");
        run(&JobContext::for_test(state.clone())).unwrap();

        // Rank is the display order the home screen reads; a gap or a duplicate
        // is a row that sorts unpredictably against its neighbours.
        let ranks: Vec<i64> = crate::db::get_curated(&state.db).unwrap().iter().map(|r| r.rank).collect();
        assert_eq!(ranks, (0..ranks.len() as i64).collect::<Vec<_>>());
    }

    #[test]
    fn interleave_alternates_and_drains_the_longer_side() {
        // Equal length: strict a, b, a, b.
        assert_eq!(interleave([1, 2].into_iter(), [3, 4].into_iter()), vec![1, 3, 2, 4]);
        // Longer left tail is appended one per remaining step.
        assert_eq!(interleave([1, 2, 3].into_iter(), [9].into_iter()), vec![1, 9, 2, 3]);
        // Longer right tail likewise.
        assert_eq!(interleave([1].into_iter(), [7, 8, 9].into_iter()), vec![1, 7, 8, 9]);
        // Either side empty degenerates to the other in order.
        assert_eq!(interleave(std::iter::empty(), [1, 2].into_iter()), vec![1, 2]);
        assert_eq!(interleave([1, 2].into_iter(), std::iter::empty()), vec![1, 2]);
        // Both empty.
        assert!(interleave(std::iter::empty::<i32>(), std::iter::empty()).is_empty());
    }
}

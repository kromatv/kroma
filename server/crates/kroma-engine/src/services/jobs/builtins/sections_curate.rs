//! `sections.curate`: the job orchestrating editorial curation — deterministic
//! director collections plus LLM-curated rows. The curation logic itself lives
//! in `services::sections::curate`.

use super::prelude::*;

pub(super) const SPEC: Builtin = Builtin {
    key: JobKey("sections.curate"),
    category: Category::Recommendations,
    schedule: Some("0 6 * * *"),
    triggers: &[],
    run,
};

const MAX_CURATE_CATALOG: usize = 600;

// A one-call-per-turn model needs ~2 turns (genres+people) + up to `MAX_LLM`
// (14, in `curate.rs`) `find_titles` + a few `get_title` + the final reply.
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

    let director_rows = curate::director_collections(&catalog);
    ctx.debug(format!("director collections: {}", director_rows.len()));
    if director_rows.is_empty() {
        ctx.debug("no director collections crew metadata may be missing; re-run metadata.enrich");
    }

    let mut llm_rows = Vec::new();
    let llm = crate::infra::llm::from_settings(&state.settings);
    if llm.available() {
        // Many collections × many members is a large reply: floor the budget
        // well above the provider's default or the JSON array comes back
        // truncated and unparseable.
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

// Errors on purpose, so the caller can fall back to the catalog-in-prompt path.
fn curate_with_tools(
    ctx: &JobContext,
    llm: &dyn crate::infra::llm::LlmClient,
    catalog: &[crate::services::sections::curate::CatalogEntry],
    max_tokens: u32,
) -> Result<Vec<crate::db::CuratedRow>> {
    use crate::infra::llm::ToolBox;
    use crate::services::llm::CatalogTools;
    use crate::services::sections::curate;

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

// The fallback: titles go in the prompt and come back as titles, matched to
// ids. Logs and returns empty on a request or parse failure.
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

    use super::{curate_with_prompt, curate_with_tools, interleave, run};
    use crate::services::jobs::JobContext;
    use crate::test_support::{seed_movie, seed_show_episode, test_state};


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
        let state = test_state();
        run(&JobContext::for_test(state.clone())).unwrap();
        assert!(crate::db::get_curated(&state.db).unwrap().is_empty());
    }

    #[test]
    fn runs_without_an_llm_configured() {
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
        let after = crate::db::get_curated(&state.db).unwrap();
        assert!(after.iter().all(|r| r.key != "stale"), "{:?}", after);
    }

    #[test]
    fn ranks_every_row_contiguously_from_zero() {
        let state = test_state();
        seed_movie(&state, "itm-1");
        run(&JobContext::for_test(state.clone())).unwrap();

        let ranks: Vec<i64> = crate::db::get_curated(&state.db).unwrap().iter().map(|r| r.rank).collect();
        assert_eq!(ranks, (0..ranks.len() as i64).collect::<Vec<_>>());
    }

    #[test]
    fn interleave_alternates_and_drains_the_longer_side() {
        assert_eq!(interleave([1, 2].into_iter(), [3, 4].into_iter()), vec![1, 3, 2, 4]);
        assert_eq!(interleave([1, 2, 3].into_iter(), [9].into_iter()), vec![1, 9, 2, 3]);
        assert_eq!(interleave([1].into_iter(), [7, 8, 9].into_iter()), vec![1, 7, 8, 9]);
        assert_eq!(interleave(std::iter::empty(), [1, 2].into_iter()), vec![1, 2]);
        assert_eq!(interleave([1, 2].into_iter(), std::iter::empty()), vec![1, 2]);
        assert!(interleave(std::iter::empty::<i32>(), std::iter::empty()).is_empty());
    }

    use std::sync::Mutex;

    use crate::infra::llm::{LlmClient, ToolBox, ToolDef};
    use crate::services::sections::curate;

    struct ScriptedLlm {
        reply: anyhow::Result<String>,
        tools: bool,
        seen: Mutex<Vec<String>>,
    }

    impl ScriptedLlm {
        fn saying(reply: &str) -> Self {
            Self { reply: Ok(reply.to_string()), tools: false, seen: Mutex::new(Vec::new()) }
        }
        fn failing(message: &str) -> Self {
            Self {
                reply: Err(anyhow::anyhow!("{message}")),
                tools: false,
                seen: Mutex::new(Vec::new()),
            }
        }
        fn with_tools(mut self) -> Self {
            self.tools = true;
            self
        }
        fn answer(&self, user: &str) -> anyhow::Result<String> {
            self.seen.lock().unwrap().push(user.to_string());
            match &self.reply {
                Ok(r) => Ok(r.clone()),
                Err(e) => Err(anyhow::anyhow!("{e}")),
            }
        }
    }

    impl LlmClient for ScriptedLlm {
        fn available(&self) -> bool {
            true
        }
        fn complete(&self, _system: &str, user: &str, _max_tokens: u32) -> anyhow::Result<String> {
            self.answer(user)
        }
        fn supports_tools(&self) -> bool {
            self.tools
        }
        fn run_tools(
            &self,
            _system: &str,
            user: &str,
            _tools: &[ToolDef],
            _toolbox: &dyn ToolBox,
            _max_tokens: u32,
            _max_steps: usize,
        ) -> anyhow::Result<String> {
            self.answer(user)
        }
        fn describe(&self) -> String {
            "scripted".into()
        }
    }

    fn entry(id: &str, title: &str) -> curate::CatalogEntry {
        curate::CatalogEntry {
            id: id.into(),
            title: title.into(),
            year: Some(2000),
            rating: 7.5,
            genres: vec!["Drama".into()],
            directors: vec!["Someone".into()],
        }
    }

    // Big enough that a collection can clear MIN_ITEMS.
    fn catalog() -> Vec<curate::CatalogEntry> {
        (1..=8).map(|n| entry(&format!("itm-{n}"), &format!("Title {n}"))).collect()
    }

    fn reply_with(members: &[&str]) -> String {
        let list = members.iter().map(|m| format!("\"{m}\"")).collect::<Vec<_>>().join(",");
        format!(
            r#"[{{"title":{{"en":"Slow Burn Thrillers"}},"reason":{{"en":"Because"}},"members":[{list}]}}]"#
        )
    }

    #[test]
    fn the_tool_path_resolves_members_as_catalog_ids() {
        let state = test_state();
        let ctx = JobContext::for_test(state);
        let llm = ScriptedLlm::saying(&reply_with(&[
            "itm-1", "itm-2", "itm-3", "itm-4", "itm-5", "not-a-real-id",
        ]))
        .with_tools();

        let rows = curate_with_tools(&ctx, &llm, &catalog(), 4096).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].item_ids, ["itm-1", "itm-2", "itm-3", "itm-4", "itm-5"]);
        assert_eq!(rows[0].source, "llm");
        assert_eq!(rows[0].titles.get("en").map(String::as_str), Some("Slow Burn Thrillers"));
    }

    #[test]
    fn a_collection_that_cannot_reach_the_floor_is_dropped_whole() {
        let state = test_state();
        let ctx = JobContext::for_test(state);
        let llm =
            ScriptedLlm::saying(&reply_with(&["itm-1", "itm-2", "itm-3", "itm-4"])).with_tools();
        assert!(curate_with_tools(&ctx, &llm, &catalog(), 4096).unwrap().is_empty());
        assert!(curate::MIN_ITEMS > 4);
    }

    #[test]
    fn the_prompt_path_matches_members_back_by_title() {
        // Matching is case- and punctuation-insensitive, hence the mixed casing.
        let state = test_state();
        let ctx = JobContext::for_test(state);
        let llm = ScriptedLlm::saying(&reply_with(&[
            "Title 1", "TITLE 2", "title 3", "Title 4", "Title 5",
        ]));

        let rows = curate_with_prompt(&ctx, &llm, &catalog(), 4096);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].item_ids.len(), 5);
        assert!(rows[0].item_ids.contains(&"itm-2".to_string()), "{:?}", rows[0].item_ids);
    }

    #[test]
    fn a_title_the_model_invented_does_not_resolve() {
        let state = test_state();
        let ctx = JobContext::for_test(state);
        let llm = ScriptedLlm::saying(&reply_with(&[
            "Title 1", "Title 2", "Title 3", "Title 4", "A Film We Do Not Have",
        ]));
        // Only four matched, so the whole collection goes.
        assert!(curate_with_prompt(&ctx, &llm, &catalog(), 4096).is_empty());
    }

    #[test]
    fn a_reply_that_is_not_json_is_logged_not_propagated() {
        // This path is already the fallback; failing hard would lose the
        // deterministic director collections too.
        let state = test_state();
        let ctx = JobContext::for_test(state);
        let llm = ScriptedLlm::saying("I'm sorry, I can't help with that.");
        assert!(curate_with_prompt(&ctx, &llm, &catalog(), 4096).is_empty());
    }

    #[test]
    fn a_request_that_fails_outright_is_logged_not_propagated() {
        let state = test_state();
        let ctx = JobContext::for_test(state);
        let llm = ScriptedLlm::failing("connection refused");
        assert!(curate_with_prompt(&ctx, &llm, &catalog(), 4096).is_empty());
    }

    #[test]
    fn the_tool_path_surfaces_its_failure_so_the_caller_can_fall_back() {
        let state = test_state();
        let ctx = JobContext::for_test(state);
        let llm = ScriptedLlm::failing("tool loop exhausted").with_tools();
        assert!(curate_with_tools(&ctx, &llm, &catalog(), 4096).is_err());

        let unparseable = ScriptedLlm::saying("not json at all").with_tools();
        assert!(curate_with_tools(&ctx, &unparseable, &catalog(), 4096).is_err());
    }

    #[test]
    fn a_reply_wrapped_in_prose_or_fences_is_still_read() {
        // Small local models routinely do both.
        let state = test_state();
        let ctx = JobContext::for_test(state);
        let inner = reply_with(&["itm-1", "itm-2", "itm-3", "itm-4", "itm-5"]);
        let llm = ScriptedLlm::saying(&format!(
            "Sure! Here are the collections:\n```json\n{inner}\n```\nHope that helps."
        ))
        .with_tools();
        assert_eq!(curate_with_tools(&ctx, &llm, &catalog(), 4096).unwrap().len(), 1);
    }
}

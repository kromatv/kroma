//! The built-in jobs shipped with KROMA one self-contained handler file per job
//! in this directory, gathered into the ordered [`JOBS`] roster below. Each
//! handler owns its own [`Builtin`] descriptor next to its `run`; a duplicate
//! key across handlers is rejected at compile time by [`NO_DUPLICATE_KEYS`].

use crate::model::Category;

use super::{JobContext, JobKey, JobManager, Trigger};

mod cache_cleanup;
mod library_missing;
mod library_scan;
mod metadata_enrich;
mod notifications_digest;
mod reco_refresh;
mod reembed;
mod search_reindex;
mod sections_curate;
mod sections_personalize;

/// A built-in job descriptor: identity ([`JobKey`]) + metadata + handler.
/// Constructed as a `const SPEC` in the handler's own file; this is just the
/// registry entry type.
pub struct Builtin {
    // This job's identity the stable dotted key that is also the DB key,
    // `/api/admin/jobs/:key` URL segment and i18n base (`jobs.{key}.name`).
    // Unique across the roster (enforced by `NO_DUPLICATE_KEYS`).
    pub key: JobKey,
    pub category: Category,
    // Default cron schedule (user-overridable), or `None` for manual-only.
    pub schedule: Option<&'static str>,
    // Extra trigger sources beyond manual + cron (file-watch, chaining).
    pub triggers: &'static [Trigger],
    pub run: fn(&JobContext) -> anyhow::Result<()>,
}

// Every built-in job, in admin-listing order. A `const` (not `static`) so the
// compile-time duplicate-key guard below can read it.
const JOBS: &[Builtin] = &[
    cache_cleanup::SPEC,
    reco_refresh::SPEC,
    reembed::SPEC,
    sections_personalize::SPEC,
    sections_curate::SPEC,
    library_scan::SPEC,
    library_missing::SPEC,
    metadata_enrich::SPEC,
    search_reindex::SPEC,
    notifications_digest::SPEC,
    // Acquisition jobs (search/import/match) moved to the tv.kroma.torrents
    // crate; the binary registers them separately via `AppState::new`.
    // Per-element pipeline stages: each drains its `pipeline_tasks` queue via
    // the shared dispatcher, incrementally and per-item.
    crate::services::pipeline::stages::probe::SPEC,
    crate::services::pipeline::stages::loudness::SPEC,
    crate::services::pipeline::stages::metadata::SPEC,
    crate::services::pipeline::stages::storyboard::SPEC,
    crate::services::pipeline::stages::subtitles::SPEC,
    crate::services::pipeline::stages::markers::SPEC,
    crate::services::pipeline::stages::embed::SPEC,
];

// Compile-time guard: a job's key indexes the DB, the URL and i18n, so two
// jobs sharing one would silently collide. Rejected here as a hard build
// error rather than a runtime surprise.
const NO_DUPLICATE_KEYS: () = {
    let mut i = 0;
    while i < JOBS.len() {
        let mut j = i + 1;
        while j < JOBS.len() {
            assert!(!str_eq(JOBS[i].key.0, JOBS[j].key.0), "duplicate job key in the JOBS roster");
            j += 1;
        }
        i += 1;
    }
};

// `const`-evaluable string equality (there is no `==` for `&str` in const yet).
const fn str_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    let mut i = 0;
    while i < a.len() {
        if a[i] != b[i] {
            return false;
        }
        i += 1;
    }
    true
}

/// Register every built-in job on the manager (roster order = listing order).
/// Called once at startup.
pub fn register_all(m: &mut JobManager) {
    // Force the compile-time duplicate-key/id check to be evaluated.
    let () = NO_DUPLICATE_KEYS;
    for b in JOBS {
        m.register(b);
    }
}

/// Shared imports for the per-job handler files `use super::prelude::*;`, so each
/// can declare its `SPEC` and `run` tersely.
pub(crate) mod prelude {
    pub(crate) use super::{snippet, Builtin};
    pub(crate) use crate::model::Category;
    pub(crate) use crate::services::jobs::{JobContext, JobKey, Trigger};
    pub use anyhow::Result;
}

/// A single-line, length-capped snippet of an LLM reply, for error logs (so a
/// parse failure shows *what* the model returned without flooding). Shared by the
/// personalize + curate jobs.
pub(crate) fn snippet(text: &str) -> String {
    let one_line: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if one_line.chars().count() > 500 {
        format!("{}…", one_line.chars().take(500).collect::<String>())
    } else {
        one_line
    }
}

#[cfg(test)]
mod tests {
    use super::{snippet, str_eq, JOBS};
    use std::collections::HashSet;

    #[test]
    fn the_rosters_duplicate_guard_compares_keys_exactly() {
        assert!(str_eq("pipeline.probe", "pipeline.probe"));
        assert!(str_eq("", ""));
        assert!(!str_eq("pipeline.probe", "pipeline.embed"), "same length, different bytes");
        assert!(!str_eq("library.scan", "library.scan2"), "a prefix is not a match");
        for b in JOBS {
            assert!(str_eq(b.key.0, b.key.0));
        }
    }

    #[test]
    fn snippet_collapses_whitespace_and_caps_length() {
        // Runs of any whitespace collapse to single spaces, edges trimmed.
        assert_eq!(snippet("  hello   world \n foo "), "hello world foo");
        assert_eq!(snippet(""), "");
        assert_eq!(snippet("   \t\n  "), "");
        // A very long reply is capped at 500 chars plus a single ellipsis.
        let long = "word ".repeat(600);
        let s = snippet(&long);
        assert_eq!(s.chars().count(), 501);
        assert!(s.ends_with('…'));
        // A short reply is returned intact (no ellipsis).
        let short = snippet("just a few words");
        assert_eq!(short, "just a few words");
        assert!(!short.ends_with('…'));
    }

    // Keys are unique (also a compile-time guard, see NO_DUPLICATE_KEYS) and
    // shaped like the dotted `group.action` the DB/URL/i18n expect.
    #[test]
    fn job_keys_are_unique_and_well_formed() {
        let mut seen = HashSet::new();
        for b in JOBS {
            let key = b.key.0;
            assert!(seen.insert(key), "duplicate job key {key:?}");
            assert!(
                key.split('.').count() == 2 && key.chars().all(|c| c.is_ascii_lowercase() || c == '.'),
                "job key {key:?} must be lowercase `group.action`",
            );
        }
    }
}

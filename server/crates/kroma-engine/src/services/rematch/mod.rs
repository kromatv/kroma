//! Correcting a wrong TMDB match.
//!
//! Automatic resolution is a guess from a filename, so it is sometimes wrong and
//! nothing downstream ever re-questions it. This is the manual override: list the
//! TMDB candidates for an element (ranked by the same scoring the automatic path
//! uses, so the operator can see *why* it went wrong), then pin the right one.
//!
//! Pinning is deliberately heavy-handed: it wipes every derived row for the
//! subject and re-runs the metadata stage from the pinned id, because the element
//! is changing *identity*, not just refreshing. See [`db::tmdb_pin`] for why the
//! pin outlives re-scans and nightly runs.

use anyhow::{bail, Result};

use crate::db;
use crate::infra::metadata::discover;
use crate::model::MatchCandidates;
use crate::services::jobs::now_ms;
use crate::state::SharedState;

mod search;

pub use search::{ranked, MatchTarget};

// A correction jumps ahead of the nightly backlog (mirrors `pipeline::reprocess`).
const HIGH: i64 = 100;

/// Which catalog subject is being rematched. The wire vocabulary is
/// `movie` | `show`; everything downstream needs a different spelling of it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Subject {
    Movie,
    Show,
}

impl Subject {
    /// Parse the `{kind}` path segment. `tv` is accepted as a TMDB-flavoured
    /// alias for `show`, matching `/api/discover/{kind}/{tmdb_id}`.
    pub fn parse(s: &str) -> Option<Subject> {
        match s {
            "movie" | "item" => Some(Subject::Movie),
            "show" | "tv" => Some(Subject::Show),
            _ => None,
        }
    }
    // The `metadata_core` / `translations` / `tmdb_pin` subject-kind discriminant.
    fn core_kind(self) -> &'static str {
        match self {
            Subject::Movie => db::metadata_core::ITEM,
            Subject::Show => db::metadata_core::SHOW,
        }
    }
    fn scope(self) -> discover::DiscoverScope {
        match self {
            Subject::Movie => discover::DiscoverScope::Movies,
            Subject::Show => discover::DiscoverScope::Shows,
        }
    }
    fn is_show(self) -> bool {
        self == Subject::Show
    }
}

// What the catalog knows about the element we are rematching.
struct Local {
    title: String,
    year: Option<u32>,
    current_tmdb_id: Option<u64>,
}

fn load(state: &SharedState, subject: Subject, id: &str) -> Result<Local> {
    let local = if subject.is_show() {
        let Some(show) = db::get_show(&state.db, id)?.map(|d| d.show) else {
            bail!("unknown show {id}");
        };
        Local {
            title: show.title,
            year: show.year,
            current_tmdb_id: show.metadata.map(|m| m.tmdb_id),
        }
    } else {
        let Some(item) = db::get_item(&state.db, id)? else {
            bail!("unknown item {id}");
        };
        Local {
            title: item.title,
            year: item.year,
            current_tmdb_id: item.metadata.map(|m| m.tmdb_id),
        }
    };
    // A stored 0 means "resolved to nothing", not "TMDB id 0".
    Ok(Local {
        current_tmdb_id: local.current_tmdb_id.filter(|&i| i != 0),
        ..local
    })
}
/// The ranked TMDB candidates for one element. `query` overrides the search text
/// when the operator types their own (the parsed title is often the reason the
/// automatic match failed); scoring still compares against the *parsed* title and
/// year, so the displayed confidence stays honest about the file on disk.
pub fn candidates(
    state: &SharedState,
    subject: Subject,
    id: &str,
    query: Option<&str>,
) -> Result<MatchCandidates> {
    let local = load(state, subject, id)?;
    let pinned = {
        let conn = state.db.get()?;
        db::tmdb_pin::get(&conn, subject.core_kind(), id)?.is_some()
    };
    let search_text = query
        .map(str::trim)
        .filter(|q| !q.is_empty())
        .unwrap_or(&local.title)
        .to_string();
    let target = search::MatchTarget {
        title: local.title.clone(),
        year: local.year,
        current_tmdb_id: local.current_tmdb_id,
    };
    let results = search::ranked(state, subject.scope(), &search_text, &target)?;
    Ok(MatchCandidates {
        query: search_text,
        year: local.year,
        current_tmdb_id: local.current_tmdb_id,
        pinned,
        results,
    })
}

/// Pin `tmdb_id` to this element (or clear the pin with `None`, restoring
/// automatic matching), wipe its derived metadata and re-run the metadata stage
/// now. Returns once the work is *queued*; clients watch for the
/// `ItemUpdated` / `ShowUpdated` event.
pub fn apply(state: &SharedState, subject: Subject, id: &str, tmdb_id: Option<u64>) -> Result<()> {
    // Fails for an unknown id before anything is written.
    load(state, subject, id)?;
    let kind = subject.core_kind();
    match tmdb_id {
        Some(0) | None => db::tmdb_pin::clear(&state.db, kind, id)?,
        Some(tmdb_id) => db::tmdb_pin::set(&state.db, kind, id, tmdb_id)?,
    }
    // The identity is changing, so the old core / translations / embedding must
    // go with the blob: leaving them would keep the wrong title matching as
    // in-library and serving stale localized text.
    db::clear_subject_metadata(&state.db, kind, id)?;
    // The metadata stage tracks movies and shows alike under the `item` subject
    // kind (see `services::pipeline::stages::metadata`).
    db::pipeline::enqueue(&state.db, "metadata", "item", id, HIGH, now_ms())?;
    if let Some(job) = state.jobs.resolve("pipeline.metadata") {
        let _ = state.jobs.trigger(state.clone(), job, "rematch");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn subject_parses_every_accepted_spelling() {
        assert_eq!(Subject::parse("movie"), Some(Subject::Movie));
        assert_eq!(Subject::parse("item"), Some(Subject::Movie));
        assert_eq!(Subject::parse("show"), Some(Subject::Show));
        assert_eq!(Subject::parse("tv"), Some(Subject::Show));
        assert_eq!(Subject::parse("person"), None);
    }

    #[test]
    fn an_unknown_show_is_refused_by_name_like_an_unknown_film() {
        let state = crate::test_support::test_state_with_tmdb("test-key");
        let err = candidates(&state, Subject::Show, "ghost", None)
            .unwrap_err()
            .to_string();
        assert_eq!(err, "unknown show ghost");
    }

    #[test]
    fn a_show_is_searched_against_tmdbs_tv_index_rather_than_its_films() {
        let state = crate::test_support::test_state_with_tmdb("test-key");
        crate::test_support::seed_show_episode(&state, "sh1", "e1");
        let tmdb = crate::test_support::FakeTmdb::start(|_| {
            (
                200,
                serde_json::json!({ "page": 1, "total_pages": 1, "results": [] }),
            )
        });

        let out = candidates(&state, Subject::Show, "sh1", None).unwrap();
        assert!(out.results.is_empty());
        let asked = tmdb.requests();
        assert!(!asked.is_empty());
        assert!(
            asked.iter().all(|r| r.starts_with("/search/tv")),
            "{asked:?}"
        );
    }

    use crate::test_support::{seed_movie, test_state_with_tmdb, FakeTmdb};

    fn page(results: serde_json::Value) -> serde_json::Value {
        serde_json::json!({ "page": 1, "total_pages": 1, "results": results })
    }

    fn tmdb_hit(id: u64, title: &str, year: &str) -> serde_json::Value {
        serde_json::json!({ "id": id, "title": title, "release_date": year })
    }

    // A movie in the catalogue whose parsed title is `title`.
    fn seed_titled(state: &crate::state::SharedState, id: &str, title: &str, year: Option<u32>) {
        seed_movie(state, id);
        let year_sql = year.map(|y| y.to_string()).unwrap_or_else(|| "NULL".into());
        // Titles here carry apostrophes on purpose (that is half the point of
        // the folded retry), so escape them the SQL way.
        let title = title.replace('\'', "''");
        state
            .db
            .get()
            .unwrap()
            .execute(
                &format!("UPDATE items SET title = '{title}', year = {year_sql} WHERE id = '{id}'"),
                [],
            )
            .unwrap();
    }

    #[test]
    fn candidates_are_ranked_against_the_parsed_title_not_the_typed_query() {
        // The operator often types a better query than the filename gave us, but
        // the confidence shown has to stay honest about the FILE - otherwise a
        // hand-typed exact title makes every result look certain.
        let state = test_state_with_tmdb("test-key");
        seed_titled(&state, "itm-1", "Matrix", Some(1999));

        let _tmdb = FakeTmdb::start(|_| {
            (
                200,
                page(serde_json::json!([
                    tmdb_hit(603, "The Matrix", "1999-03-31"),
                    tmdb_hit(605, "The Matrix Revolutions", "2003-11-05"),
                ])),
            )
        });

        let out = candidates(&state, Subject::Movie, "itm-1", Some("the matrix")).unwrap();
        assert_eq!(
            out.query, "the matrix",
            "the typed query is what was searched"
        );
        assert_eq!(
            out.year,
            Some(1999),
            "but the year compared against is the file's"
        );
        assert_eq!(out.results.len(), 2);
        // The 1999 title outranks the 2003 sequel because the FILE says 1999.
        assert_eq!(out.results[0].tmdb_id, 603);
    }

    #[test]
    fn an_empty_result_is_retried_with_the_folded_title() {
        // TMDB is picky about apostrophes and leading articles: "L'Île aux chiens"
        // comes back empty while "ile aux chiens" finds it. Without the retry the
        // operator sees "no matches" for a title TMDB clearly has.
        //
        // The fake answers on the QUERY, so it can only be satisfied by the
        // second, folded attempt.
        let state = test_state_with_tmdb("test-key");
        seed_titled(&state, "itm-1", "L\'Île aux chiens", Some(2018));

        let tmdb = FakeTmdb::start(|_| (200, page(serde_json::json!([]))));
        let out = candidates(&state, Subject::Movie, "itm-1", None).unwrap();
        assert!(out.results.is_empty(), "nothing matched either spelling");
        // BOTH spellings were tried - that is the behaviour under test.
        let asked = tmdb.requests();
        assert_eq!(asked.len(), 2, "expected a retry, got {asked:?}");
        assert_ne!(
            asked[0], asked[1],
            "the retry must not repeat the same query"
        );
        // The retry drops the apostrophe and the accent.
        assert!(
            !asked[1].contains("%27"),
            "the apostrophe survived: {}",
            asked[1]
        );
    }

    #[test]
    fn a_title_that_folds_to_the_query_already_sent_is_not_searched_twice() {
        let state = test_state_with_tmdb("test-key");
        seed_titled(&state, "itm-1", "dune", Some(2021));

        let tmdb = FakeTmdb::start(|_| (200, page(serde_json::json!([]))));

        let out = candidates(&state, Subject::Movie, "itm-1", None).unwrap();

        assert!(out.results.is_empty());
        assert_eq!(tmdb.requests().len(), 1, "{:?}", tmdb.requests());
    }

    #[test]
    fn a_decomposed_accent_is_stripped_before_the_search() {
        // macOS filenames are NFD, so a parsed title carries `é` as `e` + U+0301.
        // TMDB returns nothing for those - it even mismatches "Amélie" to an
        // unrelated title - so the combining marks go before the query is sent.
        let state = test_state_with_tmdb("test-key");
        seed_titled(&state, "itm-1", "Ame\u{301}lie", Some(2001));

        let tmdb = FakeTmdb::start(|_| {
            (
                200,
                page(serde_json::json!([tmdb_hit(194, "Amélie", "2001-04-25")])),
            )
        });
        candidates(&state, Subject::Movie, "itm-1", None).unwrap();

        let sent = tmdb.requests();
        assert!(!sent.is_empty());
        // curl percent-encodes in LOWERCASE hex, so compare case-insensitively:
        // U+0301 is %cc%81 on the wire.
        let query = sent[0].to_ascii_lowercase();
        assert!(
            !query.contains("%cc%81"),
            "the combining acute reached TMDB: {}",
            sent[0]
        );
        assert!(query.contains("query=amelie"), "{}", sent[0]);
    }

    #[test]
    fn rematching_without_a_tmdb_key_says_which_setting_is_missing() {
        let state = crate::test_support::test_state();
        seed_titled(&state, "itm-1", "Matrix", Some(1999));
        let err = candidates(&state, Subject::Movie, "itm-1", None)
            .unwrap_err()
            .to_string();
        assert!(err.contains("KROMA_TMDB_API_KEY"), "{err}");
    }

    #[test]
    fn rematching_something_the_catalogue_does_not_have_is_an_error() {
        let state = test_state_with_tmdb("test-key");
        let err = candidates(&state, Subject::Movie, "nope", None)
            .unwrap_err()
            .to_string();
        assert!(err.contains("nope"), "{err}");
    }

    #[test]
    fn a_tmdb_search_that_fails_is_reported_rather_than_read_as_no_matches() {
        // "No matches" sends the operator hunting for a better query; a failure
        // tells them the problem is upstream.
        let state = test_state_with_tmdb("test-key");
        seed_titled(&state, "itm-1", "Matrix", Some(1999));
        let _tmdb = FakeTmdb::start(|_| (500, serde_json::json!({ "status_message": "boom" })));

        let err = candidates(&state, Subject::Movie, "itm-1", None)
            .unwrap_err()
            .to_string();
        assert!(err.contains("TMDB search failed"), "{err}");
    }
}

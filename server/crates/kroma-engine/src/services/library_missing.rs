//! Library "missing" scan (Sonarr-style): for every library show that resolved a
//! TMDB id, diff TMDB's AIRED episode list against what is on disk and record the
//! gaps in `library_gaps`. This is what lets the Wanted/Missing view surface a
//! series with missing episodes even when it was never requested in-app (a show
//! added by scanning has no request ledger). Best-effort + per-show isolated: a
//! vanished TMDB id or a transient error skips that show, never the whole run.
//!
//! Only episodes with a known air date in the past/today count as "missing"
//! (matching Sonarr: an undated or future episode has not aired, so its absence
//! is not a gap). Movies are out of scope a movie is either present or not, with
//! no episode granularity to be "partially" missing.

use std::collections::HashSet;

use anyhow::{anyhow, Result};

use kroma_module_host::HostCtx;

use crate::db;
use crate::infra::metadata::{self, discover};
use crate::model::RequestKind;
use crate::services::jobs::now_ms;
use crate::services::requests::today_ymd;

/// One missing episode: `(season, episode, air_date)`.
type Gap = (u32, u32, Option<String>);

#[derive(Debug, Default)]
pub struct MissingScanSummary {
    /// Shows with a TMDB id that were scanned.
    pub shows: usize,
    /// Shows that had at least one missing aired episode.
    pub with_gaps: usize,
    /// Total missing aired episodes across the library.
    pub episodes: usize,
}

/// Scan every library show, recording each one's missing aired episodes. Reports
/// progress + honours cancellation between shows (a full scan is a lot of TMDB
/// calls). Rewrites `library_gaps` per show, so a show that is now complete has
/// its rows cleared.
pub fn scan<S: HostCtx>(
    state: &S,
    progress: &dyn Fn(usize, usize),
    cancelled: &dyn Fn() -> bool,
) -> Result<MissingScanSummary> {
    let key = state.tmdb_api_key().ok_or_else(|| anyhow!("TMDB is not configured"))?;
    let lang = state.metadata_language();
    let today = today_ymd();
    let shows = db::list_shows(state.db(), None)?;
    let total = shows.len();
    let mut summary = MissingScanSummary::default();

    for (i, show) in shows.iter().enumerate() {
        if cancelled() {
            break;
        }
        progress(i, total);
        let Some(tmdb_id) = show.metadata.as_ref().map(|m| m.tmdb_id) else {
            continue; // not enriched yet no TMDB episode list to diff against
        };
        summary.shows += 1;
        match scan_one(state, &key, &lang, &today, &show.id, tmdb_id) {
            Ok((poster, gaps)) => {
                if !gaps.is_empty() {
                    summary.with_gaps += 1;
                    summary.episodes += gaps.len();
                }
                // Rewrite even when empty, so a now-complete show is cleared.
                db::replace_show_gaps(
                    state.db(),
                    &show.id,
                    tmdb_id,
                    &show.title,
                    poster.as_deref(),
                    &gaps,
                    now_ms(),
                )?;
            }
            Err(e) => {
                tracing::warn!(target: "library", show = %show.id, "missing scan failed: {e:#}");
            }
        }
    }
    progress(total, total);
    Ok(summary)
}

/// Diff one show against TMDB: fetch its seasons + each season's episodes, keep
/// the aired ones not present on disk. Returns the show's poster (for the gap
/// rows) and the gaps.
fn scan_one<S: HostCtx>(
    state: &S,
    key: &str,
    lang: &str,
    today: &str,
    show_id: &str,
    tmdb_id: u64,
) -> Result<(Option<String>, Vec<Gap>)> {
    let detail = discover::detail(key, lang, RequestKind::Show, tmdb_id)
        .map_err(|()| anyhow!("TMDB lookup failed"))?
        .ok_or_else(|| anyhow!("show not found on TMDB"))?;

    let conn = state.db().get()?;
    let present: HashSet<(u32, u32)> =
        db::episodes_present(&conn, show_id)?.into_iter().collect();
    drop(conn);

    let mut gaps: Vec<Gap> = Vec::new();
    // `detail.seasons` already excludes specials (season 0).
    for s in &detail.seasons {
        let data = metadata::season_episodes(key, lang, tmdb_id, s.season);
        for ep in data.episodes {
            let aired = ep.air_date.as_deref().is_some_and(|d| d <= today);
            if aired && !present.contains(&(s.season, ep.episode)) {
                gaps.push((s.season, ep.episode, ep.air_date));
            }
        }
    }
    Ok((detail.poster_url, gaps))
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;

    use super::*;
    use crate::test_support::{seed_show_episode, test_state, test_state_with_tmdb};

    /// A progress sink recording every `(done, total)` the scan reported.
    #[derive(Default)]
    struct Progress(RefCell<Vec<(usize, usize)>>);

    impl Progress {
        fn record(&self) -> impl Fn(usize, usize) + '_ {
            move |done, total| self.0.borrow_mut().push((done, total))
        }
        fn seen(&self) -> Vec<(usize, usize)> {
            self.0.borrow().clone()
        }
    }

    fn never_cancelled() -> impl Fn() -> bool {
        || false
    }

    /// How many gap rows the scan left behind. Zero for every case here: none of
    /// them reaches TMDB, so none of them can discover a gap.
    fn gap_rows(state: &crate::state::SharedState) -> i64 {
        state
            .db
            .get()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM library_gaps", [], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn refuses_to_scan_without_tmdb() {
        // The whole scan is a TMDB diff, so with no key there is nothing to diff
        // against - and saying so beats reporting an empty, "complete" library.
        let state = test_state();
        let progress = Progress::default();
        let err = scan(&state, &progress.record(), &never_cancelled()).unwrap_err();
        assert!(err.to_string().contains("TMDB is not configured"), "{err}");
        assert!(progress.seen().is_empty(), "nothing was scanned, so nothing to report");
    }

    #[test]
    fn an_empty_library_is_a_clean_scan() {
        let state = test_state_with_tmdb("k");
        let progress = Progress::default();
        let summary = scan(&state, &progress.record(), &never_cancelled()).unwrap();

        assert_eq!(summary.shows, 0);
        assert_eq!(summary.with_gaps, 0);
        assert_eq!(summary.episodes, 0);
        // Still reports completion, so a caller's progress bar reaches the end
        // rather than sitting at zero forever.
        assert_eq!(progress.seen().last().copied(), Some((0, 0)));
    }

    #[test]
    fn skips_a_show_that_has_not_been_enriched() {
        // No TMDB id means no episode list to diff against. Counting it as
        // scanned would report a complete show that was never checked.
        let state = test_state_with_tmdb("k");
        seed_show_episode(&state, "shw-1", "ep-1");
        let progress = Progress::default();

        let summary = scan(&state, &progress.record(), &never_cancelled()).unwrap();
        assert_eq!(summary.shows, 0, "an un-enriched show is not a scanned show");
        assert_eq!(summary.episodes, 0);
        assert_eq!(gap_rows(&state), 0, "and it records no gaps for it");
    }

    #[test]
    fn reports_the_real_total_while_it_walks() {
        let state = test_state_with_tmdb("k");
        seed_show_episode(&state, "shw-1", "ep-1");
        seed_show_episode(&state, "shw-2", "ep-2");
        let progress = Progress::default();

        scan(&state, &progress.record(), &never_cancelled()).unwrap();
        let seen = progress.seen();
        // The total is every show in the library, not only the enriched ones -
        // the bar measures the walk, and the walk visits all of them.
        assert!(seen.iter().all(|&(_, total)| total == 2), "{seen:?}");
        assert_eq!(seen.first().copied(), Some((0, 2)));
        assert_eq!(seen.last().copied(), Some((2, 2)));
    }

    #[test]
    fn stops_when_cancelled() {
        // Checked BEFORE each show, so a cancel lands between shows rather than
        // part-way through one - which is what keeps `library_gaps` consistent.
        let state = test_state_with_tmdb("k");
        seed_show_episode(&state, "shw-1", "ep-1");
        let progress = Progress::default();

        let summary = scan(&state, &progress.record(), &|| true).unwrap();
        assert_eq!(summary.shows, 0);
        assert_eq!(gap_rows(&state), 0);
        // A cancelled run is not a failed one: the caller gets a summary of what
        // it did manage, not an error.
        assert_eq!(progress.seen(), vec![(1, 1)], "only the closing report");
    }
}

//! Asking every enabled indexer at once, each one answering for itself in the
//! report.

use std::collections::VecDeque;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};

use crate::peers::indexers::IndexerRef;

use crate::dtos::IndexerReport;

const MAX_PARALLEL: usize = 8;

/// Run `ask` against every indexer, [`MAX_PARALLEL`] at a time, and report what
/// each one answered, in indexer order. Never fails as a whole: an indexer that
/// errors or panics contributes a report and no rows. Under a `budget`, one still
/// searching when it runs out is left behind, rows and report both.
pub fn sweep<T, F>(
    indexers: &[IndexerRef],
    budget: Option<Duration>,
    ask: F,
) -> (Vec<T>, Vec<IndexerReport>)
where
    T: Send + 'static,
    F: Fn(&IndexerRef) -> anyhow::Result<Vec<T>> + Send + Sync + 'static,
{
    let deadline = budget.map(|budget| Instant::now() + budget);
    let queue: Arc<Mutex<VecDeque<(usize, IndexerRef)>>> =
        Arc::new(Mutex::new(indexers.iter().cloned().enumerate().collect()));
    let ask = Arc::new(ask);
    let (sender, answers) = mpsc::channel();
    for _ in 0..MAX_PARALLEL.min(indexers.len()) {
        let (queue, ask, sender) = (Arc::clone(&queue), Arc::clone(&ask), sender.clone());
        std::thread::spawn(move || {
            while let Some((slot, indexer)) = queue.lock().ok().and_then(|mut q| q.pop_front()) {
                let answer = catch_unwind(AssertUnwindSafe(|| ask_one(&indexer, &*ask)))
                    .unwrap_or_else(|_| panicked(&indexer));
                if sender.send((slot, answer)).is_err() {
                    return;
                }
            }
        });
    }
    drop(sender);
    let mut answered: Vec<Option<(IndexerReport, Vec<T>)>> =
        indexers.iter().map(|_| None).collect();
    loop {
        let answer = match deadline {
            None => answers.recv().ok(),
            Some(deadline) => deadline
                .checked_duration_since(Instant::now())
                .and_then(|left| answers.recv_timeout(left).ok()),
        };
        let Some((slot, answer)) = answer else {
            break;
        };
        answered[slot] = Some(answer);
    }
    let (mut rows, mut reports) = (Vec::new(), Vec::new());
    for (indexer, answer) in indexers.iter().zip(answered) {
        let Some((report, found)) = answer else {
            tracing::warn!(indexer = %indexer.name, "indexer too slow; left behind");
            continue;
        };
        reports.push(report);
        rows.extend(found);
    }
    (rows, reports)
}

pub struct IndexerFailure<'a> {
    pub indexer: &'a str,
    pub error: &'a str,
}

/// What each indexer said when not one of them answered, in indexer order. None
/// as soon as one answered, however little it found.
pub fn unanswered(reports: &[IndexerReport]) -> Option<Vec<IndexerFailure<'_>>> {
    if reports.is_empty() {
        return None;
    }
    reports
        .iter()
        .map(|report| {
            Some(IndexerFailure {
                indexer: &report.name,
                error: report.error.as_deref()?,
            })
        })
        .collect()
}

/// The report for a sweep that never ran: the scope selected nothing to ask for.
/// The indexers still appear, because "there was nothing to search" is a fact
/// about the request, not about them.
pub fn unasked(indexers: &[IndexerRef]) -> Vec<IndexerReport> {
    indexers
        .iter()
        .map(|indexer| IndexerReport {
            id: indexer.id.clone(),
            name: indexer.name.clone(),
            found: 0,
            error: None,
            elapsed_ms: 0,
        })
        .collect()
}

fn ask_one<T, F>(indexer: &IndexerRef, ask: &F) -> (IndexerReport, Vec<T>)
where
    F: Fn(&IndexerRef) -> anyhow::Result<Vec<T>>,
{
    let started = Instant::now();
    let (found, error) = match ask(indexer) {
        Ok(found) => (found, None),
        Err(e) => (Vec::new(), Some(format!("{e:#}"))),
    };
    let elapsed_ms = started.elapsed().as_millis();
    match &error {
        Some(e) => {
            tracing::warn!(indexer = %indexer.name, elapsed_ms, error = %e, "indexer failed")
        }
        None => tracing::info!(
            indexer = %indexer.name,
            elapsed_ms,
            found = found.len(),
            "indexer answered",
        ),
    }
    (report(indexer, found.len(), error, started), found)
}

fn panicked<T>(indexer: &IndexerRef) -> (IndexerReport, Vec<T>) {
    (
        IndexerReport {
            id: indexer.id.clone(),
            name: indexer.name.clone(),
            found: 0,
            error: Some("the search panicked".into()),
            elapsed_ms: 0,
        },
        Vec::new(),
    )
}

fn report(
    indexer: &IndexerRef,
    found: usize,
    error: Option<String>,
    started: Instant,
) -> IndexerReport {
    IndexerReport {
        id: indexer.id.clone(),
        name: indexer.name.clone(),
        found: found as u32,
        error,
        elapsed_ms: started.elapsed().as_millis() as u64,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(id: &str) -> IndexerRef {
        IndexerRef {
            id: id.into(),
            name: id.to_uppercase(),
            kind: "torznab".into(),
            enabled: true,
            priority: 0,
        }
    }

    #[test]
    fn results_keep_indexer_order_however_they_finish() {
        let indexers: Vec<IndexerRef> = ["a", "b", "c"].iter().map(|id| row(id)).collect();
        let (rows, reports) = sweep(&indexers, None, |i| Ok(vec![i.id.clone()]));
        assert_eq!(rows, vec!["a", "b", "c"]);
        assert_eq!(
            reports.iter().map(|r| r.id.as_str()).collect::<Vec<_>>(),
            ["a", "b", "c"]
        );
    }

    #[test]
    fn a_failing_indexer_reports_and_the_others_still_answer() {
        let indexers: Vec<IndexerRef> = ["good", "bad"].iter().map(|id| row(id)).collect();
        let (rows, reports) = sweep(&indexers, None, |i| {
            if i.id == "bad" {
                anyhow::bail!("connection refused");
            }
            Ok(vec![i.id.clone()])
        });
        assert_eq!(rows, vec!["good"]);
        assert_eq!(reports[0].found, 1);
        assert!(reports[0].error.is_none());
        assert_eq!(reports[1].found, 0);
        assert_eq!(reports[1].error.as_deref(), Some("connection refused"));
    }

    #[test]
    fn more_indexers_than_the_cap_all_get_asked() {
        let indexers: Vec<IndexerRef> = (0..MAX_PARALLEL * 2 + 1)
            .map(|n| row(&format!("i{n}")))
            .collect();
        let (rows, reports) = sweep(&indexers, None, |i| Ok(vec![i.id.clone()]));
        assert_eq!(rows.len(), indexers.len());
        assert_eq!(reports.len(), indexers.len());
    }

    #[test]
    fn an_indexer_still_searching_when_the_budget_runs_out_is_left_behind() {
        let indexers: Vec<IndexerRef> = ["fast", "stuck"].iter().map(|id| row(id)).collect();
        let held = Arc::new(Mutex::new(()));
        let _hold = held.lock().unwrap();
        let blocking = Arc::clone(&held);

        let (rows, reports) = sweep(&indexers, Some(Duration::from_millis(200)), move |i| {
            if i.id == "stuck" {
                drop(blocking.lock());
            }
            Ok(vec![i.id.clone()])
        });

        assert_eq!(rows, vec!["fast"]);
        assert_eq!(reports.len(), 1);
    }

    #[test]
    fn a_sweep_not_one_indexer_answered_hands_back_what_each_of_them_said() {
        let indexers: Vec<IndexerRef> = ["a", "b"].iter().map(|id| row(id)).collect();

        let (_, reports) = sweep(&indexers, None, |i| -> anyhow::Result<Vec<String>> {
            anyhow::bail!("{} is down", i.id)
        });

        let said = unanswered(&reports).expect("not one of them answered");

        assert_eq!(
            said.iter()
                .map(|f| (f.indexer, f.error))
                .collect::<Vec<_>>(),
            [("A", "a is down"), ("B", "b is down")]
        );
    }

    #[test]
    fn one_indexer_answering_with_nothing_makes_the_sweep_answered() {
        let indexers: Vec<IndexerRef> = ["quiet", "down"].iter().map(|id| row(id)).collect();

        let (_, reports) = sweep(&indexers, None, |i| {
            if i.id == "down" {
                anyhow::bail!("connection refused");
            }
            Ok(Vec::<String>::new())
        });

        assert!(unanswered(&reports).is_none());
    }

    #[test]
    fn a_sweep_that_never_ran_answered_nothing_and_failed_at_nothing() {
        assert!(unanswered(&unasked(&[])).is_none());
    }

    #[test]
    fn a_scope_with_nothing_to_ask_still_names_every_indexer() {
        let indexers: Vec<IndexerRef> = ["a", "b"].iter().map(|id| row(id)).collect();
        let reports = unasked(&indexers);
        assert_eq!(reports.len(), 2);
        assert!(reports.iter().all(|r| r.found == 0 && r.error.is_none()));
    }
}

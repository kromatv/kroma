//! Asking every enabled indexer at once, each one answering for itself in the
//! report. Each round asks one query of a batch of indexers, none waiting on
//! another, and an indexer has one call open at a time.

use std::time::{Duration, Instant};

use kroma_module_sdk::host::HostStorage;

use crate::dtos::IndexerReport;
use crate::peers::indexers::{search_all, IndexerRef, Query, Release};

const MAX_PARALLEL: usize = 8;

/// Ask every indexer each of `queries`, in indexer order, and report what each one
/// answered. Never fails as a whole: an indexer that errors contributes a report
/// and no rows, unless another of its queries found something.
pub fn sweep_queries<S, T, F>(
    state: &S,
    indexers: &[IndexerRef],
    queries: &[&Query],
    row: F,
) -> (Vec<T>, Vec<IndexerReport>)
where
    S: HostStorage,
    F: Fn(&IndexerRef, usize, Release) -> T,
{
    sweep(indexers, queries.len(), |batch, round| {
        let asks: Vec<(&str, &Query)> = batch
            .iter()
            .map(|indexer| (indexer.id.as_str(), queries[round]))
            .collect();
        search_all(state, &asks)
            .into_iter()
            .zip(batch)
            .map(|(answer, indexer)| {
                let releases = answer.and_then(|outcome| crate::releases_of(state, indexer, outcome))?;
                Ok(releases
                    .into_iter()
                    .map(|release| row(indexer, round, release))
                    .collect())
            })
            .collect()
    })
}

fn sweep<T, F>(indexers: &[IndexerRef], rounds: usize, ask: F) -> (Vec<T>, Vec<IndexerReport>)
where
    F: Fn(&[IndexerRef], usize) -> Vec<anyhow::Result<Vec<T>>>,
{
    let mut rows: Vec<T> = Vec::new();
    let mut reports: Vec<IndexerReport> = Vec::new();
    for batch in indexers.chunks(MAX_PARALLEL) {
        let mut tallies: Vec<Tally<T>> = batch.iter().map(|_| Tally::default()).collect();
        let started = Instant::now();
        for round in 0..rounds {
            for (tally, answer) in tallies.iter_mut().zip(ask(batch, round)) {
                match answer {
                    Ok(found) => tally.found.extend(found),
                    Err(e) => tally.errors.push(format!("{e:#}")),
                }
            }
        }
        let elapsed = started.elapsed();
        for (indexer, tally) in batch.iter().zip(tallies) {
            let (report, found) = settled(indexer, tally, elapsed);
            reports.push(report);
            rows.extend(found);
        }
    }
    (rows, reports)
}

struct Tally<T> {
    found: Vec<T>,
    errors: Vec<String>,
}

impl<T> Default for Tally<T> {
    fn default() -> Self {
        Self {
            found: Vec::new(),
            errors: Vec::new(),
        }
    }
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

fn settled<T>(indexer: &IndexerRef, tally: Tally<T>, elapsed: Duration) -> (IndexerReport, Vec<T>) {
    let error = (tally.found.is_empty() && !tally.errors.is_empty())
        .then(|| tally.errors.join("; "));
    let elapsed_ms = elapsed.as_millis() as u64;
    match &error {
        Some(e) => {
            tracing::warn!(indexer = %indexer.name, elapsed_ms, error = %e, "indexer failed")
        }
        None => tracing::info!(
            indexer = %indexer.name,
            elapsed_ms,
            found = tally.found.len(),
            "indexer answered",
        ),
    }
    (
        IndexerReport {
            id: indexer.id.clone(),
            name: indexer.name.clone(),
            found: tally.found.len() as u32,
            error,
            elapsed_ms,
        },
        tally.found,
    )
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

    fn each_answers_its_id(batch: &[IndexerRef], _round: usize) -> Vec<anyhow::Result<Vec<String>>> {
        batch.iter().map(|i| Ok(vec![i.id.clone()])).collect()
    }

    #[test]
    fn results_keep_indexer_order_however_they_finish() {
        let indexers: Vec<IndexerRef> = ["a", "b", "c"].iter().map(|id| row(id)).collect();
        let (rows, reports) = sweep(&indexers, 1, each_answers_its_id);
        assert_eq!(rows, vec!["a", "b", "c"]);
        assert_eq!(
            reports.iter().map(|r| r.id.as_str()).collect::<Vec<_>>(),
            ["a", "b", "c"]
        );
    }

    #[test]
    fn a_failing_indexer_reports_and_the_others_still_answer() {
        let indexers: Vec<IndexerRef> = ["good", "bad"].iter().map(|id| row(id)).collect();
        let (rows, reports) = sweep(&indexers, 1, |batch, _| {
            batch
                .iter()
                .map(|i| {
                    if i.id == "bad" {
                        anyhow::bail!("connection refused");
                    }
                    Ok(vec![i.id.clone()])
                })
                .collect()
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
        let (rows, reports) = sweep(&indexers, 1, each_answers_its_id);
        assert_eq!(rows.len(), indexers.len());
        assert_eq!(reports.len(), indexers.len());
    }

    #[test]
    fn no_batch_is_larger_than_the_cap() {
        let indexers: Vec<IndexerRef> = (0..MAX_PARALLEL + 1)
            .map(|n| row(&format!("i{n}")))
            .collect();
        let sizes = std::cell::RefCell::new(Vec::new());

        sweep(&indexers, 1, |batch, round| {
            sizes.borrow_mut().push(batch.len());
            each_answers_its_id(batch, round)
        });

        assert_eq!(sizes.into_inner(), [MAX_PARALLEL, 1]);
    }

    #[test]
    fn an_indexer_is_asked_each_query_in_turn_and_its_rows_stay_together() {
        let indexers: Vec<IndexerRef> = ["a", "b"].iter().map(|id| row(id)).collect();

        let (rows, _) = sweep(&indexers, 2, |batch, round| {
            batch
                .iter()
                .map(|i| Ok(vec![format!("{}{round}", i.id)]))
                .collect()
        });

        assert_eq!(rows, ["a0", "a1", "b0", "b1"]);
    }

    #[test]
    fn a_query_that_fails_is_forgotten_when_another_found_something() {
        let indexers = [row("a")];

        let (rows, reports) = sweep(&indexers, 2, |_, round| {
            if round == 0 {
                vec![Err(anyhow::anyhow!("timed out"))]
            } else {
                vec![Ok(vec!["found".to_string()])]
            }
        });

        assert_eq!(rows, ["found"]);
        assert_eq!(reports[0].error, None);
    }

    #[test]
    fn every_query_failing_says_why_each_did() {
        let indexers = [row("a")];

        let (rows, reports) = sweep(&indexers, 2, |_, round| {
            vec![anyhow::Result::<Vec<String>>::Err(anyhow::anyhow!("no {round}"))]
        });

        assert!(rows.is_empty());
        assert_eq!(reports[0].error.as_deref(), Some("no 0; no 1"));
    }

    #[test]
    fn a_scope_with_nothing_to_ask_still_names_every_indexer() {
        let indexers: Vec<IndexerRef> = ["a", "b"].iter().map(|id| row(id)).collect();
        let reports = unasked(&indexers);
        assert_eq!(reports.len(), 2);
        assert!(reports.iter().all(|r| r.found == 0 && r.error.is_none()));
    }
}

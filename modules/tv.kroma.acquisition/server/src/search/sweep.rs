//! Asking every enabled indexer at once. A sweep used to walk the list one
//! tracker at a time, so a single slow or unreachable one set the wall clock for
//! all of them; now the wall clock is the slowest indexer rather than their sum,
//! and each one answers for itself in the report.

use std::time::Instant;

use crate::peers::indexers::IndexerRef;

use crate::dtos::IndexerReport;

// One thread per indexer, capped: a sweep is network-bound, but a list of fifty
// trackers should not become fifty threads and fifty simultaneous connections.
const MAX_PARALLEL: usize = 8;

/// Run `ask` against every indexer concurrently, in indexer order, and report
/// what each one answered. Never fails as a whole: an indexer that errors or
/// panics contributes a report and no rows.
pub fn sweep<T, F>(indexers: &[IndexerRef], ask: F) -> (Vec<T>, Vec<IndexerReport>)
where
    T: Send,
    F: Fn(&IndexerRef) -> anyhow::Result<Vec<T>> + Sync,
{
    let mut rows: Vec<T> = Vec::new();
    let mut reports: Vec<IndexerReport> = Vec::new();
    for chunk in indexers.chunks(MAX_PARALLEL) {
        let answers = std::thread::scope(|scope| {
            let handles: Vec<_> =
                chunk.iter().map(|indexer| scope.spawn(|| ask_one(indexer, &ask))).collect();
            handles
                .into_iter()
                .zip(chunk)
                .map(|(handle, indexer)| handle.join().unwrap_or_else(|_| panicked(indexer)))
                .collect::<Vec<_>>()
        });
        for (report, found) in answers {
            reports.push(report);
            rows.extend(found);
        }
    }
    (rows, reports)
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
        Some(e) => tracing::warn!(indexer = %indexer.name, elapsed_ms, error = %e, "indexer failed"),
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
        let (rows, reports) = sweep(&indexers, |i| Ok(vec![i.id.clone()]));
        assert_eq!(rows, vec!["a", "b", "c"]);
        assert_eq!(reports.iter().map(|r| r.id.as_str()).collect::<Vec<_>>(), ["a", "b", "c"]);
    }

    #[test]
    fn a_failing_indexer_reports_and_the_others_still_answer() {
        let indexers: Vec<IndexerRef> = ["good", "bad"].iter().map(|id| row(id)).collect();
        let (rows, reports) = sweep(&indexers, |i| {
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
        let indexers: Vec<IndexerRef> =
            (0..MAX_PARALLEL * 2 + 1).map(|n| row(&format!("i{n}"))).collect();
        let (rows, reports) = sweep(&indexers, |i| Ok(vec![i.id.clone()]));
        assert_eq!(rows.len(), indexers.len());
        assert_eq!(reports.len(), indexers.len());
    }

    #[test]
    fn a_scope_with_nothing_to_ask_still_names_every_indexer() {
        let indexers: Vec<IndexerRef> = ["a", "b"].iter().map(|id| row(id)).collect();
        let reports = unasked(&indexers);
        assert_eq!(reports.len(), 2);
        assert!(reports.iter().all(|r| r.found == 0 && r.error.is_none()));
    }
}

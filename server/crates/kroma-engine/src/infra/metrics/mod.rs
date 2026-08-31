mod bytes;
mod disks;
mod history;
mod range;
mod ring;
mod rollup;
mod sampler;
mod snapshot;
mod tree;

use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::Duration;

use anyhow::Result;

use crate::db::Pool;

pub use bytes::ByteSink;
pub use disks::{read_disks, DiskInfo};
pub use range::Range;
pub use snapshot::{Means, Series, Snapshot};

use bytes::Bytes;
use ring::Ring;

const HOUR: i64 = 3_600;
const DAY: i64 = 24 * HOUR;

// 3s still reads as live on the dashboard while keeping the permanent
// background procfs churn low; this loop runs forever, viewer or not, so it
// must be near-free on a weak NAS.
const SAMPLE_INTERVAL: Duration = Duration::from_millis(3000);
const HISTORY: usize = 120;

/// Shared, cheap-to-clone handle to the rolling metrics history.
#[derive(Clone)]
pub struct Metrics {
    inner: Arc<RwLock<Ring>>,
    bytes: Bytes,
    store: Pool,
}

impl Metrics {
    pub fn new(store: Pool) -> Self {
        Metrics {
            inner: Arc::new(RwLock::new(Ring::default())),
            bytes: Bytes::default(),
            store,
        }
    }

    pub fn sink(&self, is_lan: bool) -> ByteSink {
        self.bytes.sink(is_lan)
    }

    /// Current values + the in-memory ring, for `?range=live`.
    pub fn snapshot(&self) -> Snapshot {
        self.inner.read().unwrap().live()
    }

    /// Current values + the series over `range`. Reads SQLite for every range
    /// but [`Range::Live`], so call it off the async runtime.
    pub fn snapshot_over(&self, range: Range) -> Result<Snapshot> {
        let mut snap = self.snapshot();
        if range == Range::Live {
            return Ok(snap);
        }
        snap.range = range;
        let now = now_unix();
        let earliest = crate::db::earliest_metric_sample(&self.store)?;
        let Some(window) = history::window(range, now, earliest) else {
            snap.series = Series::default();
            snap.means = Means::default();
            snap.started_at = now;
            snap.step_secs = range.bucket_secs().unwrap_or(DAY);
            snap.complete = false;
            return Ok(snap);
        };
        let stored = crate::db::metric_samples(&self.store, window.from, window.to)?;
        let folded = history::bucket(&stored, &window);
        snap.series = folded.series;
        snap.means = folded.means;
        snap.started_at = folded.started_at;
        snap.step_secs = window.step;
        snap.complete = folded.complete;
        Ok(snap)
    }

    /// What one child process is costing the box, as a percentage of it.
    pub fn process_cpu(&self, pid: u32) -> Option<f32> {
        self.inner.read().unwrap().process_cpu(pid)
    }

    fn push(&self, current: Snapshot, point: Means, by_pid: HashMap<u32, f32>) {
        self.inner.write().unwrap().push(current, point, by_pid);
    }

    pub fn spawn_sampler(&self) {
        let metrics = self.clone();
        // sysinfo work is blocking-ish but cheap; a dedicated OS thread keeps it
        // off the async runtime and lets us sleep precisely.
        std::thread::spawn(move || sampler::run(metrics));
    }
}

fn now_unix() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::MetricSample;

    fn metrics() -> (Metrics, kroma_db::testing::TempPool) {
        let pool = kroma_db::testing::temp_pool("metrics");
        let metrics = Metrics::new((*pool).clone());
        (metrics, pool)
    }

    fn store(pool: &Pool, at: i64, step_secs: i64, level: f32) {
        crate::db::record_metric_sample(
            pool,
            &MetricSample {
                at,
                step_secs,
                cpu_kroma: level,
                cpu_system: level,
                cpu_media: level,
                ram_kroma: level,
                ram_system: level,
                bw_local: level as f64,
                bw_remote: level as f64,
            },
        )
        .unwrap();
    }

    #[test]
    fn a_stored_range_with_no_record_behind_it_draws_nothing_and_says_so() {
        let (m, _pool) = metrics();

        let snap = m.snapshot_over(Range::Week).unwrap();

        assert_eq!(snap.range, Range::Week);
        assert_eq!(snap.series.len(), 0);
        assert_eq!(snap.step_secs, HOUR);
        assert!(!snap.complete);
    }

    #[test]
    fn a_stored_range_reads_the_rows_the_sampler_persisted() {
        let (m, pool) = metrics();
        let now = now_unix();
        for i in 1..=12 {
            store(&pool, now - i * 300, 300, 40.0);
        }

        let snap = m.snapshot_over(Range::Week).unwrap();

        assert_eq!(snap.range, Range::Week);
        assert_eq!(snap.step_secs, HOUR);
        assert!(!snap.series.cpu_kroma.is_empty());
        assert_eq!(snap.means.cpu_kroma, 40.0);
        assert!(!snap.complete);
    }

    #[test]
    fn a_record_reaching_back_over_the_whole_window_is_complete() {
        let (m, pool) = metrics();
        let now = now_unix();
        for i in 0..=(13 * 12) {
            store(&pool, now - i * 300, 300, 25.0);
        }

        let snap = m.snapshot_over(Range::HalfDay).unwrap();

        assert_eq!(snap.step_secs, 300);
        assert_eq!(snap.series.len(), 144);
        assert_eq!(snap.means.cpu_kroma, 25.0);
        assert!(snap.complete);
    }

    #[test]
    fn asking_for_live_leaves_the_ring_exactly_as_it_was() {
        let (m, _pool) = metrics();
        m.push(Snapshot::default(), Means::default(), HashMap::new());

        let asked = m.snapshot_over(Range::Live).unwrap();

        assert_eq!(asked.range, Range::Live);
        assert_eq!(asked.step_secs, 3);
        assert_eq!(asked.series.len(), m.snapshot().series.len());
        assert!(asked.complete);
    }
}


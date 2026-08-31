use anyhow::Result;
use rusqlite::params;

use crate::Pool;

const COLS: &str =
    "at,step_secs,cpu_kroma,cpu_system,cpu_media,ram_kroma,ram_system,bw_local,bw_remote";

/// One stored window of the resource series: `at` is the unix second it opens
/// on, `step_secs` how wide it is. A row carries its own width because the
/// retention ladder folds older rows coarser, so one read spans several.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MetricSample {
    pub at: i64,
    pub step_secs: i64,
    pub cpu_kroma: f32,
    pub cpu_system: f32,
    pub cpu_media: f32,
    pub ram_kroma: f32,
    pub ram_system: f32,
    pub bw_local: f64,
    pub bw_remote: f64,
}

/// Append one rolled-up window, replacing whatever sat at the same `(step, at)`.
pub fn record_metric_sample(pool: &Pool, sample: &MetricSample) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        &format!(
            "INSERT OR REPLACE INTO metric_samples ({COLS}) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)"
        ),
        params![
            sample.at,
            sample.step_secs,
            sample.cpu_kroma,
            sample.cpu_system,
            sample.cpu_media,
            sample.ram_kroma,
            sample.ram_system,
            sample.bw_local,
            sample.bw_remote,
        ],
    )?;
    Ok(())
}

/// Every stored window opening in `[from, to)`, oldest first.
pub fn metric_samples(pool: &Pool, from: i64, to: i64) -> Result<Vec<MetricSample>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLS} FROM metric_samples WHERE at >= ?1 AND at < ?2 ORDER BY at"
    ))?;
    let rows = stmt.query_map(params![from, to], |r| {
        Ok(MetricSample {
            at: r.get(0)?,
            step_secs: r.get(1)?,
            cpu_kroma: r.get(2)?,
            cpu_system: r.get(3)?,
            cpu_media: r.get(4)?,
            ram_kroma: r.get(5)?,
            ram_system: r.get(6)?,
            bw_local: r.get(7)?,
            bw_remote: r.get(8)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// The unix second of the oldest stored window, or `None` on an empty record.
pub fn earliest_metric_sample(pool: &Pool) -> Result<Option<i64>> {
    let conn = pool.get()?;
    Ok(conn.query_row("SELECT MIN(at) FROM metric_samples", [], |r| r.get(0))?)
}

/// Fold every window finer than `step` that closes before `before` into whole
/// `step`-wide windows, each the width-weighted mean of what it replaces, and
/// drop the rows it folded.
///
/// Only whole windows are folded: `before` is rounded down to a `step`
/// boundary, so a window is never averaged twice as the threshold advances.
/// Returns how many rows were folded away.
pub fn fold_metric_samples(pool: &Pool, before: i64, step: i64) -> Result<usize> {
    let aligned = before.div_euclid(step) * step;
    let conn = pool.get()?;
    conn.execute(
        &format!(
            "INSERT OR REPLACE INTO metric_samples ({COLS}) \
             SELECT (at / ?2) * ?2, ?2, \
                SUM(cpu_kroma * step_secs) / SUM(step_secs), \
                SUM(cpu_system * step_secs) / SUM(step_secs), \
                SUM(cpu_media * step_secs) / SUM(step_secs), \
                SUM(ram_kroma * step_secs) / SUM(step_secs), \
                SUM(ram_system * step_secs) / SUM(step_secs), \
                SUM(bw_local * step_secs) / SUM(step_secs), \
                SUM(bw_remote * step_secs) / SUM(step_secs) \
             FROM metric_samples WHERE at < ?1 AND step_secs < ?2 GROUP BY at / ?2"
        ),
        params![aligned, step],
    )?;
    let folded = conn.execute(
        "DELETE FROM metric_samples WHERE at < ?1 AND step_secs < ?2",
        params![aligned, step],
    )?;
    Ok(folded)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::admin::test_support::*;

    fn sample(at: i64, step_secs: i64, level: f32) -> MetricSample {
        MetricSample {
            at,
            step_secs,
            cpu_kroma: level,
            cpu_system: level * 2.0,
            cpu_media: level / 2.0,
            ram_kroma: level,
            ram_system: level,
            bw_local: level as f64,
            bw_remote: level as f64 * 3.0,
        }
    }

    #[test]
    fn reads_back_the_windows_opening_inside_the_asked_span() {
        let p = pool();

        record_metric_sample(&p, &sample(100, 60, 1.0)).unwrap();
        record_metric_sample(&p, &sample(160, 60, 2.0)).unwrap();
        record_metric_sample(&p, &sample(220, 60, 3.0)).unwrap();

        let got = metric_samples(&p, 160, 220).unwrap();
        assert_eq!(got, vec![sample(160, 60, 2.0)]);
        assert_eq!(earliest_metric_sample(&p).unwrap(), Some(100));
    }

    #[test]
    fn an_empty_record_has_no_earliest_window() {
        let p = pool();

        assert_eq!(earliest_metric_sample(&p).unwrap(), None);
    }

    #[test]
    fn folding_replaces_the_fine_windows_with_one_weighted_mean() {
        let p = pool();
        for (i, level) in [10.0, 20.0, 30.0, 40.0, 50.0].iter().enumerate() {
            record_metric_sample(&p, &sample(i as i64 * 60, 60, *level)).unwrap();
        }

        let folded = fold_metric_samples(&p, 300, 300).unwrap();

        assert_eq!(folded, 5);
        let rows = metric_samples(&p, 0, 300).unwrap();
        assert_eq!(rows, vec![sample(0, 300, 30.0)]);
    }

    #[test]
    fn folding_weights_a_window_by_the_width_it_covers() {
        let p = pool();
        record_metric_sample(&p, &sample(0, 240, 10.0)).unwrap();
        record_metric_sample(&p, &sample(240, 60, 60.0)).unwrap();

        fold_metric_samples(&p, 300, 300).unwrap();

        let rows = metric_samples(&p, 0, 300).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].cpu_kroma, 20.0);
    }

    #[test]
    fn folding_leaves_a_window_the_threshold_does_not_close_alone() {
        let p = pool();
        record_metric_sample(&p, &sample(0, 60, 10.0)).unwrap();
        record_metric_sample(&p, &sample(300, 60, 20.0)).unwrap();
        record_metric_sample(&p, &sample(360, 60, 30.0)).unwrap();

        let folded = fold_metric_samples(&p, 420, 300).unwrap();

        assert_eq!(folded, 1);
        let rows = metric_samples(&p, 0, 600).unwrap();
        assert_eq!(
            rows.iter().map(|r| (r.at, r.step_secs)).collect::<Vec<_>>(),
            vec![(0, 300), (300, 60), (360, 60)]
        );
    }

    #[test]
    fn folding_an_already_coarse_window_a_second_time_changes_nothing() {
        let p = pool();
        record_metric_sample(&p, &sample(0, 300, 42.0)).unwrap();

        assert_eq!(fold_metric_samples(&p, 900, 300).unwrap(), 0);
        assert_eq!(
            metric_samples(&p, 0, 900).unwrap(),
            vec![sample(0, 300, 42.0)]
        );
    }
}

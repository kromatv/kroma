use anyhow::Result;

use crate::db::{fold_metric_samples, MetricSample, Pool};

use super::snapshot::Means;
use super::{DAY, HOUR};

pub(super) const STEP: i64 = 60;

const LADDER: &[(i64, i64)] = &[
    (DAY, 5 * 60),
    (7 * DAY, 30 * 60),
    (30 * DAY, 6 * HOUR),
    (365 * DAY, DAY),
];

const FOLD_EVERY: i64 = HOUR;

#[derive(Default)]
pub(super) struct Rollup {
    opened_at: i64,
    samples: f64,
    cpu_kroma: f64,
    cpu_system: f64,
    cpu_media: f64,
    ram_kroma: f64,
    ram_system: f64,
    bw_local: f64,
    bw_remote: f64,
}

impl Rollup {
    pub(super) fn add(&mut self, at: i64, point: Means) -> Option<MetricSample> {
        let opened_at = at.div_euclid(STEP) * STEP;
        let closed = (self.samples > 0.0 && opened_at != self.opened_at).then(|| self.close());
        self.opened_at = opened_at;
        self.samples += 1.0;
        self.cpu_kroma += point.cpu_kroma as f64;
        self.cpu_system += point.cpu_system as f64;
        self.cpu_media += point.cpu_media as f64;
        self.ram_kroma += point.ram_kroma as f64;
        self.ram_system += point.ram_system as f64;
        self.bw_local += point.bw_local;
        self.bw_remote += point.bw_remote;
        closed
    }

    fn close(&mut self) -> MetricSample {
        let taken = std::mem::take(self);
        let n = taken.samples;
        MetricSample {
            at: taken.opened_at,
            step_secs: STEP,
            cpu_kroma: (taken.cpu_kroma / n) as f32,
            cpu_system: (taken.cpu_system / n) as f32,
            cpu_media: (taken.cpu_media / n) as f32,
            ram_kroma: (taken.ram_kroma / n) as f32,
            ram_system: (taken.ram_system / n) as f32,
            bw_local: taken.bw_local / n,
            bw_remote: taken.bw_remote / n,
        }
    }
}

pub(super) fn fold_due(opened_at: i64) -> bool {
    opened_at.rem_euclid(FOLD_EVERY) == 0
}

pub(super) fn fold(pool: &Pool, now: i64) -> Result<()> {
    for (age, step) in LADDER {
        fold_metric_samples(pool, now - age, *step)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::metric_samples;

    fn point(level: f32) -> Means {
        Means {
            cpu_kroma: level,
            cpu_system: level * 2.0,
            cpu_media: level / 2.0,
            ram_kroma: level,
            ram_system: level,
            bw_local: level as f64,
            bw_remote: level as f64 * 3.0,
        }
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
    fn a_window_closes_only_when_the_next_one_opens() {
        let mut rollup = Rollup::default();

        assert!(rollup.add(0, point(10.0)).is_none());
        assert!(rollup.add(30, point(20.0)).is_none());
        let closed = rollup.add(60, point(99.0)).unwrap();

        assert_eq!(closed.at, 0);
        assert_eq!(closed.step_secs, STEP);
        assert_eq!(closed.cpu_kroma, 15.0);
        assert_eq!(closed.bw_remote, 45.0);
    }

    #[test]
    fn the_window_after_a_close_averages_only_its_own_samples() {
        let mut rollup = Rollup::default();
        rollup.add(0, point(10.0));
        rollup.add(60, point(40.0));

        let closed = rollup.add(120, point(0.0)).unwrap();

        assert_eq!(closed.at, 60);
        assert_eq!(closed.cpu_kroma, 40.0);
    }

    #[test]
    fn a_fold_is_due_once_an_hour() {
        assert!(fold_due(0));
        assert!(fold_due(7 * HOUR));
        assert!(!fold_due(HOUR - STEP));
        assert!(!fold_due(HOUR + STEP));
    }

    #[test]
    fn the_ladder_folds_each_row_to_the_width_its_age_earns() {
        let pool = kroma_db::testing::temp_pool("metrics-ladder");
        let now = 400 * DAY;
        for (age, level) in [
            (HOUR, 1.0),
            (2 * DAY, 2.0),
            (10 * DAY, 3.0),
            (60 * DAY, 4.0),
        ] {
            store(&pool, now - age, STEP, level);
        }
        store(&pool, now - 380 * DAY, 6 * HOUR, 5.0);

        fold(&pool, now).unwrap();

        let widths: Vec<i64> = metric_samples(&pool, 0, now + 1)
            .unwrap()
            .iter()
            .map(|s| s.step_secs)
            .collect();
        assert_eq!(widths, vec![DAY, 6 * HOUR, 30 * 60, 5 * 60, STEP]);
    }

    #[test]
    fn a_row_young_enough_for_every_tier_keeps_its_own_width() {
        let pool = kroma_db::testing::temp_pool("metrics-ladder-young");
        let now = 400 * DAY;
        store(&pool, now - 60, STEP, 7.0);

        fold(&pool, now).unwrap();

        let rows = metric_samples(&pool, 0, now + 1).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].step_secs, STEP);
        assert_eq!(rows[0].cpu_kroma, 7.0);
    }
}

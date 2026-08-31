use crate::db::MetricSample;

use super::range::Range;
use super::snapshot::{Means, Series};
use super::DAY;

const MAX_POINTS: i64 = 400;

pub(super) struct Window {
    pub from: i64,
    pub to: i64,
    pub step: i64,
}

pub(super) struct History {
    pub series: Series,
    pub means: Means,
    pub started_at: i64,
    pub complete: bool,
}

pub(super) fn window(range: Range, now: i64, earliest: Option<i64>) -> Option<Window> {
    let earliest = earliest?;
    let (span, step) = match (range.span_secs(), range.bucket_secs()) {
        (Some(span), Some(step)) => (span, step),
        _ if range == Range::All => whole_record(now - earliest),
        _ => return None,
    };
    let last = now.div_euclid(step) * step;
    let points = whole_buckets(span, step);
    Some(Window {
        from: last - (points - 1) * step,
        to: last + step,
        step,
    })
}

fn whole_buckets(span: i64, step: i64) -> i64 {
    (span.max(0) as u64).div_ceil(step as u64) as i64
}

fn whole_record(span: i64) -> (i64, i64) {
    let days = span.div_euclid(DAY).max(1);
    let step = DAY * whole_buckets(days, MAX_POINTS);
    (days * DAY, step)
}

pub(super) fn bucket(samples: &[MetricSample], window: &Window) -> History {
    let count = ((window.to - window.from) / window.step).max(0) as usize;
    let mut buckets = vec![Bucket::default(); count];
    let mut whole = Bucket::default();
    for sample in samples {
        let index = (sample.at - window.from).div_euclid(window.step);
        let Some(bucket) = usize::try_from(index).ok().and_then(|i| buckets.get_mut(i)) else {
            continue;
        };
        bucket.add(sample);
        whole.add(sample);
    }

    let mut series = Series::default();
    let mut first = None;
    for (index, bucket) in buckets.iter().enumerate() {
        let Some(point) = bucket.mean() else { continue };
        first.get_or_insert(index);
        series.push(point);
    }
    let closed = count.saturating_sub(1);
    History {
        started_at: window.from + first.unwrap_or(0) as i64 * window.step,
        complete: first.is_some() && buckets[..closed].iter().all(Bucket::covered),
        means: whole.mean().unwrap_or_default(),
        series,
    }
}

#[derive(Clone, Default)]
struct Bucket {
    weight: f64,
    cpu_kroma: f64,
    cpu_system: f64,
    cpu_media: f64,
    ram_kroma: f64,
    ram_system: f64,
    bw_local: f64,
    bw_remote: f64,
}

impl Bucket {
    fn add(&mut self, sample: &MetricSample) {
        let weight = sample.step_secs.max(1) as f64;
        self.weight += weight;
        self.cpu_kroma += sample.cpu_kroma as f64 * weight;
        self.cpu_system += sample.cpu_system as f64 * weight;
        self.cpu_media += sample.cpu_media as f64 * weight;
        self.ram_kroma += sample.ram_kroma as f64 * weight;
        self.ram_system += sample.ram_system as f64 * weight;
        self.bw_local += sample.bw_local * weight;
        self.bw_remote += sample.bw_remote * weight;
    }

    fn covered(&self) -> bool {
        self.weight > 0.0
    }

    fn mean(&self) -> Option<Means> {
        if !self.covered() {
            return None;
        }
        Some(Means {
            cpu_kroma: (self.cpu_kroma / self.weight) as f32,
            cpu_system: (self.cpu_system / self.weight) as f32,
            cpu_media: (self.cpu_media / self.weight) as f32,
            ram_kroma: (self.ram_kroma / self.weight) as f32,
            ram_system: (self.ram_system / self.weight) as f32,
            bw_local: self.bw_local / self.weight,
            bw_remote: self.bw_remote / self.weight,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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

    fn window(from: i64, points: i64, step: i64) -> Window {
        Window {
            from,
            to: from + points * step,
            step,
        }
    }

    #[test]
    fn folds_the_windows_of_a_bucket_into_one_point() {
        let samples = [
            sample(0, 60, 10.0),
            sample(60, 60, 20.0),
            sample(300, 60, 40.0),
            sample(360, 60, 60.0),
        ];

        let history = super::bucket(&samples, &window(0, 2, 300));

        assert_eq!(history.series.cpu_kroma, vec![15.0, 50.0]);
        assert_eq!(history.series.bw_remote, vec![45.0, 150.0]);
        assert_eq!(history.started_at, 0);
    }

    #[test]
    fn weights_a_window_by_the_width_it_covers() {
        let samples = [sample(0, 240, 10.0), sample(240, 60, 60.0)];

        let history = super::bucket(&samples, &window(0, 1, 300));

        assert_eq!(history.series.cpu_kroma, vec![20.0]);
        assert_eq!(history.means.cpu_kroma, 20.0);
    }

    #[test]
    fn leaves_out_a_bucket_no_window_covers_rather_than_drawing_a_zero() {
        let samples = [sample(0, 60, 10.0), sample(600, 60, 30.0)];

        let history = super::bucket(&samples, &window(0, 3, 300));

        assert_eq!(history.series.cpu_kroma, vec![10.0, 30.0]);
        assert!(!history.complete);
    }

    #[test]
    fn starts_the_axis_where_the_record_starts_not_where_the_window_opens() {
        let samples = [sample(600, 60, 30.0), sample(900, 60, 40.0)];

        let history = super::bucket(&samples, &window(0, 4, 300));

        assert_eq!(history.started_at, 600);
        assert!(!history.complete);
    }

    #[test]
    fn a_record_covering_every_closed_bucket_is_complete() {
        let samples = [sample(0, 300, 10.0), sample(300, 300, 20.0)];

        let history = super::bucket(&samples, &window(0, 3, 300));

        assert!(history.complete);
        assert_eq!(history.series.cpu_kroma, vec![10.0, 20.0]);
    }

    #[test]
    fn an_empty_record_draws_nothing_and_says_so() {
        let history = super::bucket(&[], &window(0, 4, 300));

        assert_eq!(history.series.len(), 0);
        assert!(!history.complete);
        assert_eq!(history.means.cpu_kroma, 0.0);
    }

    #[test]
    fn means_cover_the_whole_window_not_one_bucket() {
        let samples = [
            sample(0, 300, 10.0),
            sample(300, 300, 20.0),
            sample(600, 300, 60.0),
        ];

        let history = super::bucket(&samples, &window(0, 3, 300));

        assert_eq!(history.means.cpu_kroma, 30.0);
        assert_eq!(history.means.cpu_system, 60.0);
    }

    #[test]
    fn a_named_window_ends_on_the_bucket_the_clock_is_in() {
        let now = 7 * DAY + 1_800;

        let w = super::window(Range::Week, now, Some(0)).unwrap();

        assert_eq!(w.step, 3_600);
        assert_eq!(w.to, 7 * DAY + 3_600);
        assert_eq!((w.to - w.from) / w.step, 168);
    }

    #[test]
    fn the_whole_record_reads_at_a_bucket_that_bounds_the_point_count() {
        let now = 5 * 365 * DAY;

        let w = super::window(Range::All, now, Some(0)).unwrap();

        assert_eq!(w.step, 5 * DAY);
        assert!((w.to - w.from) / w.step <= MAX_POINTS);
    }

    #[test]
    fn a_short_record_reads_at_one_day_a_point() {
        let w = super::window(Range::All, 30 * DAY, Some(0)).unwrap();

        assert_eq!(w.step, DAY);
        assert_eq!((w.to - w.from) / w.step, 30);
    }

    #[test]
    fn there_is_no_window_over_an_empty_record_or_the_live_ring() {
        assert!(super::window(Range::All, DAY, None).is_none());
        assert!(super::window(Range::Week, DAY, None).is_none());
        assert!(super::window(Range::Live, DAY, Some(0)).is_none());
    }
}

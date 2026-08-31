use crate::db::BandwidthSample;

use super::range::Range;
use super::{Series, Totals, DAY};

const MAX_POINTS: i64 = 400;

pub(super) struct Window {
    pub from: i64,
    pub to: i64,
    pub step: i64,
}

pub(super) fn window(range: Range, now: i64, earliest: Option<i64>) -> Option<Window> {
    let earliest = earliest?;
    let (span, step) = match (range.span_secs(), range.bucket_secs()) {
        (Some(span), Some(step)) => (span, step),
        _ => whole_record(now - earliest),
    };
    let last = now.div_euclid(step) * step;
    let points = whole_buckets(span, step);
    let from = (last - (points - 1) * step).max(earliest.div_euclid(step) * step);
    Some(Window {
        from,
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

pub(super) fn bucket(samples: &[BandwidthSample], window: &Window) -> (Series, Totals) {
    let count = ((window.to - window.from) / window.step).max(0) as usize;
    let mut series = Series::of_length(count);
    let mut totals = Totals::default();
    for sample in samples {
        totals.add(sample);
        let index = (sample.at - window.from).div_euclid(window.step);
        let Some(at) = usize::try_from(index).ok().filter(|i| *i < count) else {
            continue;
        };
        series.add(at, sample);
    }
    (series, totals)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(at: i64, sealed: u64, unsealed: u64, bypass: u64) -> BandwidthSample {
        BandwidthSample {
            at,
            step_secs: 60,
            sealed_down_bytes: sealed,
            sealed_up_bytes: sealed / 2,
            unsealed_down_bytes: unsealed,
            unsealed_up_bytes: unsealed / 2,
            bypass_down_bytes: bypass,
            bypass_up_bytes: bypass / 2,
            sealed_secs: if unsealed == 0 { 60 } else { 0 },
            unsealed_secs: if unsealed == 0 { 0 } else { 60 },
        }
    }

    fn spanning(from: i64, points: i64, step: i64) -> Window {
        Window {
            from,
            to: from + points * step,
            step,
        }
    }

    #[test]
    fn sums_the_windows_of_a_bucket_into_one_point() {
        let samples = [
            sample(0, 100, 0, 5),
            sample(60, 200, 0, 5),
            sample(300, 400, 0, 0),
        ];

        let (series, _) = bucket(&samples, &spanning(0, 2, 300));

        assert_eq!(series.sealed_down, [300, 400]);
        assert_eq!(series.bypass_down, [10, 0]);
    }

    #[test]
    fn draws_a_bucket_nothing_landed_in_as_a_zero_rather_than_a_gap() {
        let samples = [sample(0, 100, 0, 0), sample(600, 300, 0, 0)];

        let (series, _) = bucket(&samples, &spanning(0, 3, 300));

        assert_eq!(series.sealed_down, [100, 0, 300]);
    }

    #[test]
    fn totals_cover_the_whole_window_and_keep_the_unsealed_share_apart() {
        let samples = [sample(0, 100, 0, 0), sample(300, 50, 400, 7)];

        let (_, totals) = bucket(&samples, &spanning(0, 2, 300));

        assert_eq!(totals.sealed_down_bytes, 150);
        assert_eq!(totals.unsealed_down_bytes, 400);
        assert_eq!(totals.bypass_down_bytes, 7);
        assert_eq!(totals.sealed_secs, 60);
        assert_eq!(totals.unsealed_secs, 60);
    }

    #[test]
    fn a_sample_outside_the_window_is_left_out_of_the_series() {
        let samples = [sample(-600, 999, 0, 0), sample(0, 100, 0, 0)];

        let (series, _) = bucket(&samples, &spanning(0, 1, 300));

        assert_eq!(series.sealed_down, [100]);
    }

    #[test]
    fn a_named_window_ends_on_the_bucket_the_clock_is_in() {
        let now = 7 * DAY + 1_800;

        let w = window(Range::Week, now, Some(0)).unwrap();

        assert_eq!(w.step, 3_600);
        assert_eq!(w.to, 7 * DAY + 3_600);
        assert_eq!((w.to - w.from) / w.step, 168);
    }

    #[test]
    fn a_window_older_than_the_record_starts_where_the_record_does() {
        let now = 3 * 3_600;

        let w = window(Range::Week, now, Some(2 * 3_600)).unwrap();

        assert_eq!(w.from, 2 * 3_600);
        assert_eq!((w.to - w.from) / w.step, 2);
    }

    #[test]
    fn the_whole_record_reads_at_a_bucket_that_bounds_the_point_count() {
        let now = 5 * 365 * DAY;

        let w = window(Range::All, now, Some(0)).unwrap();

        assert_eq!(w.step, 5 * DAY);
        assert!((w.to - w.from) / w.step <= MAX_POINTS);
    }

    #[test]
    fn there_is_no_window_over_an_empty_record() {
        assert!(window(Range::Week, DAY, None).is_none());
        assert!(window(Range::All, DAY, None).is_none());
    }
}

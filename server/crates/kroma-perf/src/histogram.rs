use serde::{Deserialize, Serialize};

const STEPS_PER_OCTAVE: f64 = 4.0;
const LAST_BUCKET: u8 = 120;

/// Durations in log-spaced buckets, four per doubling from one microsecond, so a
/// quantile read from it is within 10% of the true value. Sparse: a timing seen
/// at a handful of speeds costs a handful of entries.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Histogram(Vec<(u8, u32)>);

impl Histogram {
    pub fn record(&mut self, nanos: u64) {
        self.add(bucket_of(nanos), 1);
    }

    pub fn merge(&mut self, other: &Histogram) {
        for &(bucket, count) in &other.0 {
            self.add(bucket, count);
        }
    }

    pub fn count(&self) -> u64 {
        self.0.iter().map(|&(_, n)| u64::from(n)).sum()
    }

    /// The duration below which `q` of the samples fall, in nanoseconds; 0 when
    /// nothing was recorded.
    pub fn quantile(&self, q: f64) -> u64 {
        let total = self.count();
        if total == 0 {
            return 0;
        }
        let target = ((q.clamp(0.0, 1.0) * total as f64).ceil() as u64).max(1);
        let mut seen = 0;
        for &(bucket, count) in &self.0 {
            seen += u64::from(count);
            if seen >= target {
                return value_of(bucket);
            }
        }
        self.0.last().map_or(0, |&(bucket, _)| value_of(bucket))
    }

    fn add(&mut self, bucket: u8, count: u32) {
        match self.0.binary_search_by_key(&bucket, |&(b, _)| b) {
            Ok(i) => self.0[i].1 = self.0[i].1.saturating_add(count),
            Err(i) => self.0.insert(i, (bucket, count)),
        }
    }
}

fn bucket_of(nanos: u64) -> u8 {
    let micros = nanos as f64 / 1_000.0;
    if micros < 1.0 {
        return 0;
    }
    let step = (micros.log2() * STEPS_PER_OCTAVE).floor() + 1.0;
    step.min(f64::from(LAST_BUCKET)) as u8
}

fn value_of(bucket: u8) -> u64 {
    if bucket == 0 {
        return 500;
    }
    let middle = (f64::from(bucket) - 0.5) / STEPS_PER_OCTAVE;
    (2f64.powf(middle) * 1_000.0) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn of(millis: &[u64]) -> Histogram {
        let mut histogram = Histogram::default();
        for ms in millis {
            histogram.record(ms * 1_000_000);
        }
        histogram
    }

    fn within_ten_percent(actual: u64, expected_ms: u64) -> bool {
        let expected = expected_ms as f64 * 1_000_000.0;
        (actual as f64 - expected).abs() <= expected * 0.1
    }

    #[test]
    fn a_quantile_lands_within_ten_percent_of_the_sample() {
        let histogram = of(&[10, 10, 10, 10, 10, 10, 10, 10, 10, 400]);

        let (median, p99) = (histogram.quantile(0.5), histogram.quantile(0.99));

        assert!(within_ten_percent(median, 10), "{median}");
        assert!(within_ten_percent(p99, 400), "{p99}");
    }

    #[test]
    fn merging_two_histograms_counts_both() {
        let mut left = of(&[1, 2, 3]);

        left.merge(&of(&[2, 900]));

        assert_eq!(left.count(), 5);
        assert!(within_ten_percent(left.quantile(1.0), 900));
    }

    #[test]
    fn an_empty_histogram_answers_zero() {
        assert_eq!(Histogram::default().quantile(0.95), 0);
    }

    #[test]
    fn a_sub_microsecond_sample_and_a_huge_one_both_fit() {
        let mut histogram = Histogram::default();

        histogram.record(10);
        histogram.record(u64::MAX);

        assert_eq!(histogram.count(), 2);
        assert_eq!(histogram.0.first().map(|&(b, _)| b), Some(0));
        assert_eq!(histogram.0.last().map(|&(b, _)| b), Some(LAST_BUCKET));
    }
}

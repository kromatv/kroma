pub mod meter;
mod range;
mod window;

use anyhow::Result;
use serde::Serialize;

use kroma_module_sdk::db::Pool;

use crate::db::{self, BandwidthSample};

pub use range::Range;

const HOUR: i64 = 3_600;
const DAY: i64 = 24 * HOUR;

/// One value per bucket, oldest first, every field the same length.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Series {
    pub sealed_down: Vec<u64>,
    pub sealed_up: Vec<u64>,
    pub unsealed_down: Vec<u64>,
    pub unsealed_up: Vec<u64>,
    pub bypass_down: Vec<u64>,
    pub bypass_up: Vec<u64>,
    pub unsealed_secs: Vec<i64>,
}

impl Series {
    fn of_length(count: usize) -> Self {
        Series {
            sealed_down: vec![0; count],
            sealed_up: vec![0; count],
            unsealed_down: vec![0; count],
            unsealed_up: vec![0; count],
            bypass_down: vec![0; count],
            bypass_up: vec![0; count],
            unsealed_secs: vec![0; count],
        }
    }

    fn add(&mut self, at: usize, sample: &BandwidthSample) {
        self.sealed_down[at] += sample.sealed_down_bytes;
        self.sealed_up[at] += sample.sealed_up_bytes;
        self.unsealed_down[at] += sample.unsealed_down_bytes;
        self.unsealed_up[at] += sample.unsealed_up_bytes;
        self.bypass_down[at] += sample.bypass_down_bytes;
        self.bypass_up[at] += sample.bypass_up_bytes;
        self.unsealed_secs[at] += sample.unsealed_secs;
    }

    pub fn len(&self) -> usize {
        self.sealed_down.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Totals {
    pub sealed_down_bytes: u64,
    pub sealed_up_bytes: u64,
    pub unsealed_down_bytes: u64,
    pub unsealed_up_bytes: u64,
    pub bypass_down_bytes: u64,
    pub bypass_up_bytes: u64,
    pub sealed_secs: i64,
    pub unsealed_secs: i64,
}

impl Totals {
    fn add(&mut self, sample: &BandwidthSample) {
        self.sealed_down_bytes += sample.sealed_down_bytes;
        self.sealed_up_bytes += sample.sealed_up_bytes;
        self.unsealed_down_bytes += sample.unsealed_down_bytes;
        self.unsealed_up_bytes += sample.unsealed_up_bytes;
        self.bypass_down_bytes += sample.bypass_down_bytes;
        self.bypass_up_bytes += sample.bypass_up_bytes;
        self.sealed_secs += sample.sealed_secs;
        self.unsealed_secs += sample.unsealed_secs;
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BandwidthView {
    pub range: Range,
    pub started_at: i64,
    pub step_secs: i64,
    pub series: Series,
    pub totals: Totals,
    pub bridge_configured: bool,
}

/// Blocking: call it off the async runtime.
pub fn read(
    store: &Pool,
    range: Range,
    now: i64,
    bridge_configured: bool,
) -> Result<BandwidthView> {
    let earliest = db::earliest_bandwidth_sample(store)?;
    let Some(span) = window::window(range, now, earliest) else {
        return Ok(BandwidthView {
            range,
            started_at: now,
            step_secs: range.bucket_secs().unwrap_or(DAY),
            bridge_configured,
            ..BandwidthView::default()
        });
    };
    let stored = db::bandwidth_samples(store, span.from, span.to)?;
    let (series, totals) = window::bucket(&stored, &span);
    Ok(BandwidthView {
        range,
        started_at: span.from,
        step_secs: span.step,
        series,
        totals,
        bridge_configured,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{add_bandwidth_sample, test_support::test_db};

    fn store_sealed(pool: &Pool, at: i64, down: u64) {
        add_bandwidth_sample(
            pool,
            &BandwidthSample {
                at,
                step_secs: 60,
                sealed_down_bytes: down,
                sealed_secs: 60,
                ..BandwidthSample::default()
            },
        )
        .unwrap();
    }

    #[test]
    fn an_empty_record_answers_with_no_points_rather_than_a_flat_line() {
        let pool = test_db();

        let view = read(&pool, Range::Day, 10 * HOUR, true).unwrap();

        assert!(view.series.is_empty());
        assert_eq!(view.totals, Totals::default());
        assert_eq!(view.started_at, 10 * HOUR);
        assert_eq!(view.step_secs, 10 * 60);
        assert!(view.bridge_configured);
    }

    #[test]
    fn a_days_window_buckets_the_stored_minutes_into_ten_minute_points() {
        let pool = test_db();
        store_sealed(&pool, 0, 100);
        store_sealed(&pool, 300, 200);
        store_sealed(&pool, 600, 900);

        let view = read(&pool, Range::Day, 900, false).unwrap();

        assert_eq!(view.step_secs, 600);
        assert_eq!(view.started_at, 0);
        assert_eq!(view.series.sealed_down, [300, 900]);
        assert_eq!(view.totals.sealed_down_bytes, 1200);
        assert!(!view.bridge_configured);
    }

    #[test]
    fn the_view_goes_on_the_wire_under_the_keys_the_page_reads() {
        let pool = test_db();
        store_sealed(&pool, 0, 100);

        let json = serde_json::to_value(read(&pool, Range::Week, HOUR, true).unwrap()).unwrap();

        assert_eq!(json["range"], "7d");
        assert_eq!(json["stepSecs"], 3600);
        assert_eq!(json["series"]["sealedDown"][0], 100);
        assert_eq!(json["totals"]["sealedDownBytes"], 100);
        assert_eq!(json["bridgeConfigured"], true);
    }
}

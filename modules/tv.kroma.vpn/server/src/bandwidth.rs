//! The engine is the only side that can answer: the bridge is a userspace
//! WireGuard with no kernel interface to read counters off, so the throughput
//! IS the engine's transfer while it dials the bridge.

use serde::{Deserialize, Serialize};
use serde_json::json;

use kroma_module_sdk::host::HostCtx;

pub const RANGES: [&str; 7] = ["12h", "24h", "7d", "30d", "90d", "1y", "all"];

const FALLBACK_RANGE: &str = "24h";

/// The word to ask the engine with. Anything the control does not offer becomes
/// the day, so a hand-typed query string cannot reach the engine unchecked.
pub fn range_or_default(raw: &str) -> &str {
    RANGES
        .iter()
        .find(|known| **known == raw)
        .copied()
        .unwrap_or(FALLBACK_RANGE)
}

/// One value per bucket, oldest first.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct BandwidthSeries {
    pub sealed_down: Vec<u64>,
    pub sealed_up: Vec<u64>,
    pub unsealed_down: Vec<u64>,
    pub unsealed_up: Vec<u64>,
    pub bypass_down: Vec<u64>,
    pub bypass_up: Vec<u64>,
    pub unsealed_secs: Vec<i64>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct BandwidthTotals {
    pub sealed_down_bytes: u64,
    pub sealed_up_bytes: u64,
    pub unsealed_down_bytes: u64,
    pub unsealed_up_bytes: u64,
    pub bypass_down_bytes: u64,
    pub bypass_up_bytes: u64,
    pub sealed_secs: i64,
    pub unsealed_secs: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct BandwidthView {
    pub range: String,
    pub started_at: i64,
    pub step_secs: i64,
    pub series: BandwidthSeries,
    pub totals: BandwidthTotals,
    pub bridge_configured: bool,
}

/// The engine's series over `range`, or `None` when no module answers the
/// download point at all.
pub fn engine_bandwidth(host: &dyn HostCtx, range: &str) -> Option<BandwidthView> {
    crate::port::ask_with(host, "bandwidth", &json!({ "range": range }))
}

#[cfg(test)]
mod tests {
    use super::*;

    use kroma_module_sdk::host::testing::StubHost;

    #[test]
    fn a_window_the_control_does_not_offer_becomes_the_day() {
        assert_eq!(range_or_default("7d"), "7d");
        assert_eq!(range_or_default("all"), "all");
        assert_eq!(range_or_default("live"), FALLBACK_RANGE);
        assert_eq!(range_or_default(&"9".repeat(4096)), FALLBACK_RANGE);
    }

    #[test]
    fn no_download_engine_installed_means_no_series_rather_than_a_failure() {
        let host = StubHost::new();

        assert_eq!(engine_bandwidth(&host, "24h"), None);
    }

    #[test]
    fn a_view_deserializes_from_camel_case_and_defaults_what_is_missing() {
        let json = json!({
            "range": "7d",
            "stepSecs": 3600,
            "series": { "sealedDown": [10, 20] },
            "totals": { "sealedDownBytes": 30, "unsealedSecs": 120 },
            "bridgeConfigured": true,
        });

        let view: BandwidthView = serde_json::from_value(json).unwrap();

        assert_eq!(view.range, "7d");
        assert_eq!(view.series.sealed_down, [10, 20]);
        assert_eq!(view.series.bypass_down, Vec::<u64>::new());
        assert_eq!(view.totals.sealed_down_bytes, 30);
        assert_eq!(view.totals.unsealed_secs, 120);
        assert_eq!(view.started_at, 0);
    }

    #[test]
    fn the_view_goes_back_out_under_the_keys_the_page_reads() {
        let view = BandwidthView {
            range: "24h".into(),
            step_secs: 600,
            totals: BandwidthTotals {
                unsealed_down_bytes: 4_096,
                ..BandwidthTotals::default()
            },
            ..BandwidthView::default()
        };

        let json = serde_json::to_value(view).unwrap();

        assert_eq!(json["stepSecs"], 600);
        assert_eq!(json["totals"]["unsealedDownBytes"], 4_096);
        assert_eq!(json["bridgeConfigured"], false);
    }
}

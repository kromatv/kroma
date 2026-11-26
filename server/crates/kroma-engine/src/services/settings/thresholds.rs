//! The two thresholds a saved position is judged against: where a title starts
//! to resume, and where it counts as watched.

use kroma_domain::{DEFAULT_PLAYED_PERCENT, DEFAULT_RESUME_PERCENT, WatchThresholds};
use serde_json::{Value, json};

use crate::i18n;

use super::schema::SettingRow;
use super::store::Settings;

/// The setting holding the resume threshold, a percentage of the runtime.
pub const RESUME_THRESHOLD_KEY: &str = "resumeThreshold";

/// The setting holding the played threshold, a percentage of the runtime.
pub const PLAYED_THRESHOLD_KEY: &str = "playedThreshold";

const RESUME_OPTIONS: [&str; 5] = ["0", "2", "5", "10", "15"];
const PLAYED_OPTIONS: [&str; 5] = ["75", "80", "85", "90", "95"];

/// Both thresholds as the admin set them: the resume threshold held between 0
/// and 25, the played threshold as [`super::played_percent`] holds it.
pub fn watch_thresholds(settings: &Settings) -> WatchThresholds {
    WatchThresholds {
        resume_percent: settings
            .get_i64(RESUME_THRESHOLD_KEY, DEFAULT_RESUME_PERCENT)
            .clamp(0, 25),
        played_percent: super::played_percent(settings),
    }
}

pub(super) fn threshold_defaults() -> [(&'static str, Value); 2] {
    [
        (RESUME_THRESHOLD_KEY, json!(DEFAULT_RESUME_PERCENT.to_string())),
        (PLAYED_THRESHOLD_KEY, json!(DEFAULT_PLAYED_PERCENT.to_string())),
    ]
}

pub(super) fn threshold_row(locale: &str, key: &'static str, value: Value) -> SettingRow {
    let (label, hint, options) = match key {
        RESUME_THRESHOLD_KEY => (
            "admin.resumeThreshold",
            "admin.resumeThresholdHint",
            RESUME_OPTIONS,
        ),
        _ => (
            "admin.playedThreshold",
            "admin.playedThresholdHint",
            PLAYED_OPTIONS,
        ),
    };
    SettingRow {
        key: key.into(),
        label: i18n::t(locale, label, &[]),
        desc: Some(i18n::t(locale, hint, &[])),
        kind: "select",
        options: options.map(str::to_string).to_vec(),
        value,
        applied: true,
        configured: None,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;
    use crate::db::testing::temp_pool;

    #[test]
    fn the_resume_threshold_defaults_to_five_and_stays_under_a_quarter() {
        let pool = temp_pool("settings-thresholds");
        let settings = Settings::load(&pool);

        assert_eq!(watch_thresholds(&settings), WatchThresholds::default());

        settings.set_patch(
            &pool,
            BTreeMap::from([(RESUME_THRESHOLD_KEY.to_string(), json!("60"))]),
        );
        assert_eq!(watch_thresholds(&settings).resume_percent, 25);

        settings.set_patch(
            &pool,
            BTreeMap::from([(RESUME_THRESHOLD_KEY.to_string(), json!(0))]),
        );
        assert_eq!(watch_thresholds(&settings).resume_percent, 0);
    }

    #[test]
    fn each_threshold_row_offers_its_own_percentages() {
        let resume = threshold_row("en", RESUME_THRESHOLD_KEY, json!("5"));
        let played = threshold_row("en", PLAYED_THRESHOLD_KEY, json!("90"));

        assert_eq!(resume.options, ["0", "2", "5", "10", "15"]);
        assert_eq!(played.options, ["75", "80", "85", "90", "95"]);
        assert_ne!(resume.label, played.label);
    }
}

use crate::services::settings::Settings;

use super::{ENABLED_KEY, STATISTICS_KEY, USAGE_KEY};

/// Which blocks of the heartbeat this operator lets the server send.
///
/// Nested the way Home Assistant's are: the two detail blocks say nothing on
/// their own, so both are false whenever the base switch is. A block that is
/// off is absent from the payload rather than sent empty, so the collector can
/// tell "no modules enabled" from "not telling you".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Preferences {
    pub base: bool,
    pub usage: bool,
    pub statistics: bool,
}

impl Preferences {
    pub fn read(settings: &Settings) -> Self {
        let base = settings.get_bool(ENABLED_KEY, false);
        Self {
            base,
            usage: base && settings.get_bool(USAGE_KEY, false),
            statistics: base && settings.get_bool(STATISTICS_KEY, false),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::settings::Settings;
    use serde_json::json;

    fn stored(pairs: &[(&str, bool)]) -> (kroma_db::testing::TempPool, Settings) {
        let pool = kroma_db::testing::temp_pool("prefs");
        let settings = Settings::load(&pool);
        settings.set_patch(
            &pool,
            pairs
                .iter()
                .map(|(k, v)| ((*k).to_string(), json!(v)))
                .collect(),
        );
        (pool, settings)
    }

    #[test]
    fn every_block_is_offered_and_every_block_starts_on() {
        let pool = kroma_db::testing::temp_pool("prefs-default");
        let settings = Settings::load(&pool);

        let prefs = Preferences::read(&settings);

        assert_eq!(
            prefs,
            Preferences {
                base: true,
                usage: true,
                statistics: true
            }
        );
    }

    #[test]
    fn a_detail_block_can_be_dropped_while_the_server_still_counts_itself() {
        let (_pool, settings) = stored(&[("anonStatsUsage", false)]);

        let prefs = Preferences::read(&settings);

        assert!(prefs.base);
        assert!(!prefs.usage);
        assert!(prefs.statistics);
    }

    #[test]
    fn switching_the_base_off_switches_off_everything_it_carries() {
        let (_pool, settings) = stored(&[("anonStats", false)]);

        let prefs = Preferences::read(&settings);

        assert_eq!(
            prefs,
            Preferences {
                base: false,
                usage: false,
                statistics: false
            }
        );
    }
}

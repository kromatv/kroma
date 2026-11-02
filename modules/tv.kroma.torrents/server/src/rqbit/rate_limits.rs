use std::sync::PoisonError;

use super::{RqbitEngine, wanted_limits};

impl RqbitEngine {
    /// A torrent already in flight picks the new ceiling up on its next block, and
    /// `None` is unlimited. Safe to call on a timer, because a ceiling that has not
    /// moved is left alone rather than pushed again onto a fresh token bucket.
    pub fn set_rate_limits(&self, download_bps: Option<u32>, upload_bps: Option<u32>) {
        let wanted = wanted_limits(download_bps, upload_bps);
        let mut applied = self.limits.lock().unwrap_or_else(PoisonError::into_inner);
        if *applied == wanted {
            return;
        }
        match self.api.set_limits(wanted.0, wanted.1) {
            Ok(()) => *applied = wanted,
            Err(error) => {
                tracing::warn!(error = %format!("{error:#}"), "rqbit refused a rate limit")
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::rqbit::RqbitConfig;
    use crate::rqbit::test_support::{StubApi, engine_over};

    const LIMITS: &str = "POST /torrents/limits";
    const CEILING_BPS: u32 = 64;

    fn stub() -> StubApi {
        StubApi::serving(&[(LIMITS, 200, "{}")])
    }

    #[test]
    #[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
    fn a_ceiling_re_asserted_unchanged_is_not_pushed_again() {
        let api = stub();
        let engine = engine_over(
            &api,
            RqbitConfig {
                download_bps: Some(CEILING_BPS),
                ..RqbitConfig::default()
            },
        );

        engine.set_rate_limits(Some(CEILING_BPS), None);

        assert!(api.seen(LIMITS).is_empty());
    }

    #[test]
    #[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
    fn a_ceiling_that_moved_is_pushed_through() {
        let api = stub();
        let engine = engine_over(&api, RqbitConfig::default());

        engine.set_rate_limits(None, Some(CEILING_BPS));

        let body = String::from_utf8(api.seen(LIMITS).remove(0).body).unwrap();
        let sent: serde_json::Value = serde_json::from_str(&body).unwrap();
        assert_eq!(sent["download_bps"], serde_json::Value::Null);
        assert_eq!(sent["upload_bps"], CEILING_BPS);
    }

    #[test]
    #[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
    fn a_ceiling_pushed_once_is_not_pushed_a_second_time() {
        let api = stub();
        let engine = engine_over(&api, RqbitConfig::default());

        engine.set_rate_limits(Some(CEILING_BPS), None);
        engine.set_rate_limits(Some(CEILING_BPS), None);

        assert_eq!(api.seen(LIMITS).len(), 1);
    }

    #[test]
    #[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
    fn a_ceiling_rqbit_refused_is_tried_again_next_time() {
        let api = StubApi::serving(&[(LIMITS, 500, "{}")]);
        let engine = engine_over(&api, RqbitConfig::default());

        engine.set_rate_limits(Some(CEILING_BPS), None);
        engine.set_rate_limits(Some(CEILING_BPS), None);

        assert_eq!(api.seen(LIMITS).len(), 2);
    }
}

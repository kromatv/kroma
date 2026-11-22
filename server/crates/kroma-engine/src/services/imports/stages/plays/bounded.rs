//! When the other server says a play happened and how long it lasted, as the
//! play KROMA logs. It is the importer's word, so each number is bounded here.

use super::super::clock::believed;
use crate::model::import::Play;

const LONGEST_PLAY_MS: u64 = 7 * 24 * 60 * 60 * 1000;

/// `played_at` is epoch seconds. `duration_ms` is `None` where the other
/// server recorded none.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct Timed {
    pub played_at: i64,
    pub duration_ms: Option<i64>,
}

/// `None` for a play with no believable time: one before the epoch, or further
/// ahead of this server's clock than two set clocks differ. A time ahead by
/// less is this clock's time. A duration of nothing, or longer than any play
/// lasts, is no duration.
pub(super) fn bounded(play: &Play, now_secs: i64) -> Option<Timed> {
    let played_at = believed(play.played_at, now_secs)?;
    let duration_ms = play
        .duration_ms
        .filter(|duration| (1..=LONGEST_PLAY_MS).contains(duration))
        .map(|duration| duration as i64);
    Some(Timed {
        played_at,
        duration_ms,
    })
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::*;

    const NOW: i64 = 1_700_600_000;
    const LAST_WEEK: i64 = 1_700_000_000;

    fn said(times: Value) -> Option<Timed> {
        let mut play = json!({ "id": "p1", "user": "42", "title": "t1" });
        play.as_object_mut()
            .unwrap()
            .extend(times.as_object().unwrap().clone());
        let play: Play = serde_json::from_value(play).unwrap();
        bounded(&play, NOW)
    }

    #[test]
    fn a_play_carries_the_time_it_was_played_and_how_long_it_lasted() {
        let play = said(json!({ "playedAt": LAST_WEEK, "durationMs": 5_400_000 }));

        assert_eq!(
            play,
            Some(Timed {
                played_at: LAST_WEEK,
                duration_ms: Some(5_400_000),
            })
        );
    }

    #[test]
    fn a_play_the_other_server_did_not_time_carries_no_duration() {
        let play = said(json!({ "playedAt": LAST_WEEK }));

        assert_eq!(play.map(|play| play.duration_ms), Some(None));
    }

    #[test]
    fn a_time_before_the_epoch_or_far_ahead_of_this_clock_is_no_play() {
        let at_the_epoch = said(json!({ "playedAt": 0 }));
        let before_the_epoch = said(json!({ "playedAt": i64::MIN }));
        let next_year = said(json!({ "playedAt": NOW + 365 * 86_400 }));
        let at_the_end_of_time = said(json!({ "playedAt": i64::MAX }));

        assert_eq!(at_the_epoch, None);
        assert_eq!(before_the_epoch, None);
        assert_eq!(next_year, None);
        assert_eq!(at_the_end_of_time, None);
    }

    #[test]
    fn a_time_a_few_minutes_ahead_of_this_clock_is_logged_as_this_clock_s_time() {
        let two_minutes_ahead = said(json!({ "playedAt": NOW + 120 }));
        let an_hour_ahead = said(json!({ "playedAt": NOW + 3600 }));

        assert_eq!(two_minutes_ahead.map(|play| play.played_at), Some(NOW));
        assert_eq!(an_hour_ahead, None);
    }

    #[test]
    fn a_duration_of_nothing_or_longer_than_any_play_is_no_duration() {
        let nothing = said(json!({ "playedAt": LAST_WEEK, "durationMs": 0 }));
        let a_week = said(json!({ "playedAt": LAST_WEEK, "durationMs": 604_800_000_u64 }));
        let past_a_week = said(json!({ "playedAt": LAST_WEEK, "durationMs": 604_800_001_u64 }));
        let past_any_number = said(json!({ "playedAt": LAST_WEEK, "durationMs": u64::MAX }));

        assert_eq!(nothing.map(|play| play.duration_ms), Some(None));
        assert_eq!(a_week.map(|play| play.duration_ms), Some(Some(604_800_000)));
        assert_eq!(past_a_week.map(|play| play.duration_ms), Some(None));
        assert_eq!(past_any_number.map(|play| play.duration_ms), Some(None));
    }
}

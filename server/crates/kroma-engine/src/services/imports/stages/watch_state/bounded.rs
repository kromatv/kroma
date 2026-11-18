//! What the other server says one person did with one title, as the state
//! KROMA merges. It is the importer's word, so each number is bounded here.

use crate::domain::watching::{Resume, Watching};
use crate::model::import::WatchState;

const LONGEST_RUNTIME_MS: u64 = 7 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_ALLOWANCE_SECS: i64 = 24 * 60 * 60;

/// A time before the epoch, or further ahead of this server's clock than two
/// clocks drift apart, is no time: the state is as old as a state can be. A
/// resume point at nothing, or past the end of its title, is no resume point.
pub(super) fn bounded(state: &WatchState, now_secs: i64) -> Watching {
    let believable = 1..=now_secs.saturating_add(CLOCK_SKEW_ALLOWANCE_SECS);
    let at = state
        .last_played_at
        .filter(|at| believable.contains(at))
        .unwrap_or(0);
    let duration_ms = state
        .duration_ms
        .filter(|duration| (1..=LONGEST_RUNTIME_MS).contains(duration));
    let end_ms = duration_ms.unwrap_or(LONGEST_RUNTIME_MS);
    let position_ms = state
        .position_ms
        .filter(|position| (1..=end_ms).contains(position));
    Watching {
        watched_at: state.watched.then_some(at),
        resume: position_ms.map(|position| Resume {
            position_ms: position as i64,
            duration_ms: duration_ms.map(|duration| duration as i64),
            at,
        }),
        listed: state.favourite,
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::*;

    const NOW: i64 = 1_700_600_000;
    const LAST_WEEK: i64 = 1_700_000_000;

    fn said(state: Value) -> Watching {
        let state: WatchState = serde_json::from_value(state).unwrap();
        bounded(&state, NOW)
    }

    #[test]
    fn a_state_carries_its_flag_its_resume_point_and_its_favourite_at_the_time_it_was_played() {
        let state = said(json!({
            "title": "t1",
            "watched": true,
            "positionMs": 5_025_000,
            "durationMs": 10_200_000,
            "lastPlayedAt": LAST_WEEK,
            "favourite": true,
        }));

        assert_eq!(
            state,
            Watching {
                watched_at: Some(LAST_WEEK),
                resume: Some(Resume {
                    position_ms: 5_025_000,
                    duration_ms: Some(10_200_000),
                    at: LAST_WEEK,
                }),
                listed: true,
            }
        );
    }

    #[test]
    fn a_title_nobody_touched_carries_nothing() {
        let state = said(json!({ "title": "t1", "playCount": 0, "positionMs": 0 }));

        assert!(state.is_empty());
    }

    #[test]
    fn a_state_nobody_dated_is_as_old_as_a_state_can_be() {
        let state = said(json!({ "title": "t1", "watched": true, "positionMs": 90_000 }));

        assert_eq!(state.watched_at, Some(0));
        assert_eq!(state.resume.map(|resume| resume.at), Some(0));
    }

    #[test]
    fn a_time_before_the_epoch_or_far_ahead_of_this_clock_is_no_time() {
        let negative = said(json!({ "title": "t1", "watched": true, "lastPlayedAt": -5 }));
        let next_year = said(json!({
            "title": "t1",
            "watched": true,
            "lastPlayedAt": NOW + 365 * 86_400,
        }));
        let an_hour_ahead = said(json!({
            "title": "t1",
            "watched": true,
            "lastPlayedAt": NOW + 3600,
        }));

        assert_eq!(negative.watched_at, Some(0));
        assert_eq!(next_year.watched_at, Some(0));
        assert_eq!(an_hour_ahead.watched_at, Some(NOW + 3600));
    }

    #[test]
    fn a_resume_point_past_the_end_of_its_title_is_no_resume_point() {
        let past_the_end = said(json!({
            "title": "t1",
            "positionMs": 10_200_001,
            "durationMs": 10_200_000,
        }));
        let past_any_runtime = said(json!({ "title": "t1", "positionMs": u64::MAX }));
        let at_the_end = said(json!({
            "title": "t1",
            "positionMs": 10_200_000,
            "durationMs": 10_200_000,
        }));

        assert_eq!(past_the_end.resume, None);
        assert_eq!(past_any_runtime.resume, None);
        assert_eq!(at_the_end.resume.map(|r| r.position_ms), Some(10_200_000));
    }

    #[test]
    fn a_runtime_no_title_has_is_left_out_and_its_resume_point_kept() {
        let state = said(json!({
            "title": "t1",
            "positionMs": 90_000,
            "durationMs": u64::MAX,
        }));

        assert_eq!(
            state.resume,
            Some(Resume {
                position_ms: 90_000,
                duration_ms: None,
                at: 0,
            })
        );
    }
}

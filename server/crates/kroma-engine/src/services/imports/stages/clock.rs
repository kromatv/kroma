//! The time the other server gives for something a person did, read against
//! this server's clock. It is the importer's word.

pub(super) const CLOCK_AHEAD_TOLERANCE_SECS: i64 = 5 * 60;

/// The time `said`, in epoch seconds, as this server stamps it. `None` for a
/// time before the epoch, or ahead of this server's clock by more than two
/// set clocks differ. A time ahead by less is this clock's time, so nothing is
/// ever dated later than now.
pub(super) fn believed(said: i64, now_secs: i64) -> Option<i64> {
    let believable = 1..=now_secs.saturating_add(CLOCK_AHEAD_TOLERANCE_SECS);
    believable.contains(&said).then(|| said.min(now_secs))
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_700_600_000;

    #[test]
    fn a_time_in_the_past_is_believed_as_it_is() {
        let last_week = NOW - 7 * 86_400;

        assert_eq!(believed(last_week, NOW), Some(last_week));
    }

    #[test]
    fn a_time_a_few_minutes_ahead_of_this_clock_is_this_clock_s_time() {
        assert_eq!(believed(NOW + 120, NOW), Some(NOW));
    }

    #[test]
    fn a_time_before_the_epoch_or_an_hour_ahead_of_this_clock_is_no_time() {
        assert_eq!(believed(0, NOW), None);
        assert_eq!(believed(-5, NOW), None);
        assert_eq!(believed(NOW + 3600, NOW), None);
    }
}

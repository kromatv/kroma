//! How long to wait before searching a wanted row again. Recency-driven: an
//! episode that aired an hour ago is retried in minutes, a gap from 2019 in
//! days, so a large ledger cannot starve a weekly show.
//!
//! This half picks the BASE delay from the air date. The per-row attempt
//! multiplier and the cap are applied by `db::schedule_next_search`, which owns
//! the stored counter.

const MINUTE: i64 = 60_000;
const HOUR: i64 = 60 * MINUTE;
const DAY: i64 = 24 * HOUR;

// `None` when either date is absent or unparseable, which callers read as
// "old": a row with no air date is a legacy row or a special, not a fresh
// episode.
fn days_since(air_date: Option<&str>, today: &str) -> Option<i64> {
    let air = civil_days(air_date?)?;
    Some(civil_days(today)? - air)
}

// Days since the epoch for a `YYYY-MM-DD` date, via Howard Hinnant's civil
// algorithm. Only the difference of two of these is ever used.
fn civil_days(ymd: &str) -> Option<i64> {
    let mut parts = ymd.split('-');
    let y: i64 = parts.next()?.parse().ok()?;
    let m: i64 = parts.next()?.parse().ok()?;
    let d: i64 = parts.next()?.parse().ok()?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(era * 146_097 + doe - 719_468)
}

/// The base gap between two searches of a row that aired on `air_date`. A row
/// airing right now is worth a quarter-hour; one from years ago is not worth a
/// daily round trip.
pub fn base_delay_ms(air_date: Option<&str>, today: &str) -> i64 {
    match days_since(air_date, today) {
        // Still to come, or aired today: the release is landing right now.
        Some(d) if d <= 1 => 15 * MINUTE,
        Some(d) if d <= 7 => HOUR,
        Some(d) if d <= 30 => 6 * HOUR,
        Some(d) if d <= 365 => DAY,
        _ => kroma_module_sdk::db::MAX_SEARCH_DELAY_MS,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TODAY: &str = "2026-07-16";
    const MAX: i64 = kroma_module_sdk::db::MAX_SEARCH_DELAY_MS;

    #[test]
    fn a_just_aired_episode_is_retried_in_minutes() {
        assert_eq!(base_delay_ms(Some("2026-07-16"), TODAY), 15 * MINUTE);
        assert_eq!(base_delay_ms(Some("2026-07-15"), TODAY), 15 * MINUTE);
    }

    #[test]
    fn the_delay_widens_with_the_age_of_the_air_date() {
        assert_eq!(base_delay_ms(Some("2026-07-12"), TODAY), HOUR);
        assert_eq!(base_delay_ms(Some("2026-07-01"), TODAY), 6 * HOUR);
        assert_eq!(base_delay_ms(Some("2026-01-01"), TODAY), DAY);
        assert_eq!(base_delay_ms(Some("2019-01-01"), TODAY), MAX);
    }

    #[test]
    fn an_unaired_episode_sits_in_the_freshest_bucket() {
        // The caller gates unaired rows out of the pass entirely; if one gets
        // through it must not be treated as ancient.
        assert_eq!(base_delay_ms(Some("2026-08-01"), TODAY), 15 * MINUTE);
    }

    #[test]
    fn a_row_without_an_air_date_is_treated_as_old() {
        assert_eq!(base_delay_ms(None, TODAY), MAX);
    }

    #[test]
    fn a_malformed_date_does_not_panic() {
        assert_eq!(base_delay_ms(Some("nope"), TODAY), MAX);
        assert_eq!(base_delay_ms(Some("2026-13-01"), TODAY), MAX);
        assert_eq!(base_delay_ms(Some("2026-07-16"), "nope"), MAX);
    }

    #[test]
    fn days_since_counts_across_a_month_and_a_leap_year() {
        assert_eq!(days_since(Some("2026-06-30"), "2026-07-16"), Some(16));
        assert_eq!(days_since(Some("2024-02-28"), "2024-03-01"), Some(2));
        assert_eq!(days_since(Some("2023-02-28"), "2023-03-01"), Some(1));
    }

    #[test]
    fn the_buckets_are_ordered_and_never_exceed_the_cap() {
        let delays = [
            base_delay_ms(Some("2026-07-16"), TODAY),
            base_delay_ms(Some("2026-07-12"), TODAY),
            base_delay_ms(Some("2026-07-01"), TODAY),
            base_delay_ms(Some("2026-01-01"), TODAY),
            base_delay_ms(Some("2019-01-01"), TODAY),
        ];
        assert!(delays.windows(2).all(|w| w[0] < w[1]), "{delays:?}");
        assert!(delays.iter().all(|d| *d <= MAX));
    }
}

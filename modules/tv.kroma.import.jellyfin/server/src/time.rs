const TICKS_PER_MS: u64 = 10_000;
const SECONDS_PER_DAY: i64 = 86_400;

pub(crate) fn ticks_to_ms(ticks: u64) -> u64 {
    ticks / TICKS_PER_MS
}

pub(crate) fn unix_seconds(stamp: &str) -> Option<i64> {
    let (date, clock) = stamp.trim().split_once('T')?;
    let (time, offset) = split_offset(clock)?;
    Some(days_from_civil(date)? * SECONDS_PER_DAY + seconds_of_day(time)? - offset)
}

fn numbers<const N: usize>(text: &str, separator: char) -> Option<[i64; N]> {
    let mut parts = text.split(separator);
    let mut read = [0; N];
    for slot in &mut read {
        *slot = parts.next()?.parse().ok()?;
    }
    parts.next().is_none().then_some(read)
}

fn split_offset(clock: &str) -> Option<(&str, i64)> {
    if let Some(time) = clock.strip_suffix(['Z', 'z']) {
        return Some((time, 0));
    }
    let Some(at) = clock.rfind(['+', '-']) else {
        return Some((clock, 0));
    };
    let [hours, minutes] = numbers(&clock[at + 1..], ':')?;
    let sign = if clock[at..].starts_with('-') { -1 } else { 1 };
    Some((&clock[..at], sign * (hours * 3600 + minutes * 60)))
}

fn seconds_of_day(time: &str) -> Option<i64> {
    let whole = time.split_once('.').map_or(time, |(whole, _)| whole);
    let [hours, minutes, seconds] = numbers(whole, ':')?;
    let valid =
        (0..24).contains(&hours) && (0..60).contains(&minutes) && (0..=60).contains(&seconds);
    valid.then_some(hours * 3600 + minutes * 60 + seconds)
}

// Howard Hinnant's `days_from_civil`: 400-year eras that start on 1 March.
fn days_from_civil(date: &str) -> Option<i64> {
    let [year, month, day] = numbers(date, '-')?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let year = if month <= 2 { year - 1 } else { year };
    let year_of_era = year.rem_euclid(400);
    let day_of_year = (153 * ((month + 9) % 12) + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    Some(year.div_euclid(400) * 146_097 + day_of_era - 719_468)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_stamp_with_seven_fraction_digits_and_a_z_reads_as_utc() {
        let read = unix_seconds("2023-11-14T22:13:20.0000000Z");

        assert_eq!(read, Some(1_700_000_000));
    }

    #[test]
    fn a_stamp_with_an_offset_is_moved_to_utc() {
        let ahead = unix_seconds("2023-11-14T23:13:20.5+01:00");
        let behind = unix_seconds("2023-11-14T17:13:20-05:00");

        assert_eq!(ahead, Some(1_700_000_000));
        assert_eq!(behind, Some(1_700_000_000));
    }

    #[test]
    fn a_stamp_with_no_offset_reads_as_utc() {
        let read = unix_seconds("2024-02-29T00:00:00");

        assert_eq!(read, Some(1_709_164_800));
    }

    #[test]
    fn the_first_second_of_1970_is_zero() {
        let read = unix_seconds("1970-01-01T00:00:00Z");

        assert_eq!(read, Some(0));
    }

    #[test]
    fn text_that_is_not_a_stamp_reads_as_nothing() {
        let read: Vec<Option<i64>> = [
            "",
            "yesterday",
            "2024-13-01T00:00:00Z",
            "2024-01-01",
            "2024-01-01T25:00:00Z",
        ]
        .into_iter()
        .map(unix_seconds)
        .collect();

        assert_eq!(read, vec![None; 5]);
    }

    #[test]
    fn ten_thousand_ticks_are_one_millisecond() {
        let position = ticks_to_ms(12_340_000_000);

        assert_eq!(position, 1_234_000);
    }
}

use super::YEARS;

pub(super) fn year_of(date: &str) -> Option<u32> {
    date.get(..4)?.parse().ok()
}

fn leap(year: u32) -> bool {
    year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400))
}

fn days_in(year: u32, month: u32) -> u32 {
    match month {
        2 if leap(year) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

fn day_of(date: &str) -> Option<(u32, u32, u32)> {
    let shaped = date.len() == 10
        && date.bytes().enumerate().all(|(at, b)| match at {
            4 | 7 => b == b'-',
            _ => b.is_ascii_digit(),
        });
    if !shaped {
        return None;
    }
    let number = |at: std::ops::Range<usize>| date[at].parse().ok();
    Some((number(0..4)?, number(5..7)?, number(8..10)?))
}

pub(super) fn year_of_day(date: &str) -> Option<u32> {
    let (year, month, day) = day_of(date)?;
    let real = (1..=12).contains(&month) && (1..=days_in(year, month)).contains(&day);
    (real && YEARS.contains(&year)).then_some(year)
}

//! A small, dependency-free cron parser and next-occurrence calculator: Vixie
//! 5-field syntax with an optional leading seconds field, plus the `@yearly` …
//! `@hourly` macros. When day-of-month and day-of-week are both restricted, a
//! day matches if either matches.

use anyhow::{bail, Result};
use time::{Date, Duration, Month, OffsetDateTime, Time};

#[derive(Debug, Clone)]
pub struct Cron {
    seconds: u64,
    minutes: u64,
    hours: u64,
    dom: u64,
    months: u64,
    dow: u64,
    dom_star: bool,
    dow_star: bool,
}

// A hard stop for an unsatisfiable spec like `0 0 30 2 *` (Feb 30th).
const MAX_STEPS: usize = 100_000;

impl Cron {
    pub fn parse(expr: &str) -> Result<Cron> {
        let trimmed = expr.trim();
        let expanded = expand_macro(trimmed);
        let fields: Vec<&str> = expanded.split_whitespace().collect();

        let (sec_spec, rest) = match fields.len() {
            6 => (fields[0], &fields[1..]),
            5 => ("0", &fields[..]),
            n => bail!("cron must have 5 or 6 fields, got {n}: {trimmed:?}"),
        };

        let seconds = parse_field(sec_spec, 0, 59, NO_NAMES)?.0;
        let (minutes, _) = parse_field(rest[0], 0, 59, NO_NAMES)?;
        let (hours, _) = parse_field(rest[1], 0, 23, NO_NAMES)?;
        let (dom, dom_star) = parse_field(rest[2], 1, 31, NO_NAMES)?;
        let (months, _) = parse_field(rest[3], 1, 12, MONTH_NAMES)?;
        let (mut dow, dow_star) = parse_field(rest[4], 0, 7, DOW_NAMES)?;
        // Cron allows 7 for Sunday: fold it onto bit 0.
        if dow & (1 << 7) != 0 {
            dow = (dow & !(1 << 7)) | 1;
        }

        Ok(Cron {
            seconds,
            minutes,
            hours,
            dom,
            months,
            dow,
            dom_star,
            dow_star,
        })
    }

    pub fn is_valid(expr: &str) -> bool {
        Cron::parse(expr).is_ok()
    }

    /// The first instant strictly after `after` that matches, preserving its UTC
    /// offset, so callers can evaluate in any timezone by shifting `after` to it.
    pub fn next_after(&self, after: OffsetDateTime) -> Option<OffsetDateTime> {
        let offset = after.offset();
        let mut t = after - Duration::nanoseconds(after.nanosecond() as i64) + Duration::seconds(1);

        for _ in 0..MAX_STEPS {
            if !bit(self.months, u8::from(t.month())) {
                t = first_of_next_month(t, offset)?;
                continue;
            }
            if !self.day_matches(t) {
                t = next_midnight(t, offset)?;
                continue;
            }
            if !bit(self.hours, t.hour()) {
                t = next_hour(t, offset)?;
                continue;
            }
            if !bit(self.minutes, t.minute()) {
                t = next_minute(t, offset)?;
                continue;
            }
            if !bit(self.seconds, t.second()) {
                t += Duration::seconds(1);
                continue;
            }
            return Some(t);
        }
        None
    }

    fn day_matches(&self, t: OffsetDateTime) -> bool {
        let dom_ok = bit(self.dom, t.day());
        let dow_ok = bit(self.dow, t.weekday().number_days_from_sunday());
        match (self.dom_star, self.dow_star) {
            (true, true) => true,
            (false, true) => dom_ok,
            (true, false) => dow_ok,
            (false, false) => dom_ok || dow_ok,
        }
    }
}

#[inline]
fn bit(mask: u64, v: u8) -> bool {
    mask & (1u64 << v) != 0
}

fn make(
    offset: time::UtcOffset,
    y: i32,
    mo: u8,
    d: u8,
    h: u8,
    mi: u8,
    s: u8,
) -> Option<OffsetDateTime> {
    let date = Date::from_calendar_date(y, Month::try_from(mo).ok()?, d).ok()?;
    let time = Time::from_hms(h, mi, s).ok()?;
    Some(date.with_time(time).assume_offset(offset))
}

fn first_of_next_month(t: OffsetDateTime, offset: time::UtcOffset) -> Option<OffsetDateTime> {
    let (y, m) = (t.year(), u8::from(t.month()));
    let (ny, nm) = if m == 12 { (y + 1, 1) } else { (y, m + 1) };
    make(offset, ny, nm, 1, 0, 0, 0)
}

fn next_midnight(t: OffsetDateTime, offset: time::UtcOffset) -> Option<OffsetDateTime> {
    let next = t.date().next_day()?;
    make(
        offset,
        next.year(),
        u8::from(next.month()),
        next.day(),
        0,
        0,
        0,
    )
}

fn next_hour(t: OffsetDateTime, offset: time::UtcOffset) -> Option<OffsetDateTime> {
    if t.hour() == 23 {
        return next_midnight(t, offset);
    }
    make(
        offset,
        t.year(),
        u8::from(t.month()),
        t.day(),
        t.hour() + 1,
        0,
        0,
    )
}

fn next_minute(t: OffsetDateTime, offset: time::UtcOffset) -> Option<OffsetDateTime> {
    if t.minute() == 59 {
        return next_hour(t, offset);
    }
    make(
        offset,
        t.year(),
        u8::from(t.month()),
        t.day(),
        t.hour(),
        t.minute() + 1,
        0,
    )
}

type NameMap = &'static [(&'static str, u8)];
const NO_NAMES: NameMap = &[];
const MONTH_NAMES: NameMap = &[
    ("jan", 1),
    ("feb", 2),
    ("mar", 3),
    ("apr", 4),
    ("may", 5),
    ("jun", 6),
    ("jul", 7),
    ("aug", 8),
    ("sep", 9),
    ("oct", 10),
    ("nov", 11),
    ("dec", 12),
];
const DOW_NAMES: NameMap = &[
    ("sun", 0),
    ("mon", 1),
    ("tue", 2),
    ("wed", 3),
    ("thu", 4),
    ("fri", 5),
    ("sat", 6),
];

// The returned flag is whether the field was a bare `*`, which the dom/dow
// either-or rule needs.
fn parse_field(spec: &str, min: u8, max: u8, names: NameMap) -> Result<(u64, bool)> {
    let spec = spec.trim();
    if spec.is_empty() {
        bail!("empty cron field");
    }
    let is_star = spec == "*";
    let mut mask = 0u64;
    for part in spec.split(',') {
        mask |= parse_part(part.trim(), min, max, names)?;
    }
    Ok((mask, is_star))
}

fn parse_part(part: &str, min: u8, max: u8, names: NameMap) -> Result<u64> {
    let (range, step) = match part.split_once('/') {
        Some((r, s)) => {
            let step: u8 = s
                .parse()
                .map_err(|_| anyhow::anyhow!("bad step {s:?} in {part:?}"))?;
            if step == 0 {
                bail!("step must be > 0 in {part:?}");
            }
            (r, step)
        }
        None => (part, 1),
    };

    let (lo, hi) = if range == "*" {
        (min, max)
    } else if let Some((a, b)) = range.split_once('-') {
        (resolve(a, names, min, max)?, resolve(b, names, min, max)?)
    } else {
        let v = resolve(range, names, min, max)?;
        // `a/n` (no `-`) means a..=max stepping by n; a bare `a` is just a.
        if step > 1 {
            (v, max)
        } else {
            (v, v)
        }
    };

    if lo > hi {
        bail!("range start {lo} > end {hi} in {part:?}");
    }
    let mut mask = 0u64;
    let mut v = lo;
    while v <= hi {
        mask |= 1u64 << v;
        v += step;
    }
    Ok(mask)
}

fn resolve(tok: &str, names: NameMap, min: u8, max: u8) -> Result<u8> {
    let tok = tok.trim();
    let v = if let Some(&(_, n)) = names
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case(tok))
    {
        n
    } else {
        tok.parse::<u8>()
            .map_err(|_| anyhow::anyhow!("bad cron value {tok:?}"))?
    };
    if v < min || v > max {
        bail!("value {v} out of range {min}-{max}");
    }
    Ok(v)
}

fn expand_macro(expr: &str) -> String {
    match expr {
        "@yearly" | "@annually" => "0 0 1 1 *",
        "@monthly" => "0 0 1 * *",
        "@weekly" => "0 0 * * 0",
        "@daily" | "@midnight" => "0 0 * * *",
        "@hourly" => "0 * * * *",
        other => other,
    }
    .to_string()
}

#[cfg(test)]
mod tests;

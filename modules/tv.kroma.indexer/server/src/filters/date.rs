use chrono::{Datelike, Duration, Local, NaiveDate, NaiveDateTime, TimeZone, Timelike, Utc};

// RFC 3339 (the domain layer only needs *a* parseable timestamp for age
// display).
pub(super) fn to_rfc3339(dt: NaiveDateTime) -> String {
    Utc.from_utc_datetime(&dt).to_rfc3339()
}

// `dateparse`/`date`: try each supplied Go layout, then a set of common
// formats, then relative parsing.
pub(super) fn date_parse(value: &str, layouts: &[String]) -> String {
    let v = value.trim();
    for layout in layouts {
        let fmt = go_layout_to_chrono(layout);
        if let Ok(dt) = NaiveDateTime::parse_from_str(v, &fmt) {
            return to_rfc3339(dt);
        }
        if let Ok(d) = NaiveDate::parse_from_str(v, &fmt) {
            return to_rfc3339(d.and_hms_opt(0, 0, 0).unwrap());
        }
    }
    parse_fuzzy(v).unwrap_or_else(|| value.to_string())
}

// `timeago`/`reltime`/`fuzzytime`: relative ("3 hours ago", "yesterday") and
// common absolute formats.
pub(super) fn reltime(value: &str) -> String {
    parse_fuzzy(value.trim()).unwrap_or_else(|| value.to_string())
}

pub(super) fn parse_fuzzy(v: &str) -> Option<String> {
    if let Some(dt) = parse_relative(v) {
        return Some(to_rfc3339(dt));
    }
    // RFC 2822 (`Tue, 30 Jun 2026 11:19:47 +0000`, common in RSS/Torznab
    // `pubDate`) and RFC 3339, both carrying a timezone offset.
    if let Ok(dt) = chrono::DateTime::parse_from_rfc2822(v) {
        return Some(dt.to_utc().to_rfc3339());
    }
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(v) {
        return Some(dt.to_utc().to_rfc3339());
    }
    const FORMATS: &[&str] = &[
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
        "%d-%m-%Y %H:%M:%S",
        "%d-%m-%Y %H:%M",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y",
        "%m/%d/%Y %H:%M:%S",
        "%m/%d/%Y",
        "%d.%m.%Y %H:%M:%S",
        "%d.%m.%Y",
        "%b %d %Y, %H:%M",
        "%b %d, %Y",
        "%d %b %Y %H:%M:%S",
        "%d %b %Y",
        "%B %d, %Y",
    ];
    for fmt in FORMATS {
        if let Ok(dt) = NaiveDateTime::parse_from_str(v, fmt) {
            return Some(to_rfc3339(dt));
        }
        if let Ok(d) = NaiveDate::parse_from_str(v, fmt) {
            return Some(to_rfc3339(d.and_hms_opt(0, 0, 0).unwrap()));
        }
    }
    None
}

// Parses relative expressions against the local clock: "just now",
// "5 minutes ago", "2 hours ago", "yesterday", "today", "3 days ago",
// "1 week ago", "2 months ago", "1 year ago".
pub(super) fn parse_relative(v: &str) -> Option<NaiveDateTime> {
    let now = Local::now().naive_local();
    let lower = v.to_lowercase();
    let lower = lower.trim();
    if lower == "just now" || lower == "now" {
        return Some(now);
    }
    if lower == "today" {
        return now.date().and_hms_opt(0, 0, 0);
    }
    if lower == "yesterday" {
        return (now - Duration::days(1)).date().and_hms_opt(0, 0, 0);
    }
    // "<n> <unit> ago" (also "a"/"an" for 1).
    let re = regex::Regex::new(
        r"(?i)(?:(\d+)|a|an)\s*(sec|second|min|minute|hour|day|week|month|year)s?\s*(?:ago)?",
    )
    .ok()?;
    let caps = re.captures(lower)?;
    let n: i64 = caps
        .get(1)
        .and_then(|m| m.as_str().parse().ok())
        .unwrap_or(1);
    let unit = caps.get(2)?.as_str();
    let dt = match unit {
        "sec" | "second" => now - Duration::seconds(n),
        "min" | "minute" => now - Duration::minutes(n),
        "hour" => now - Duration::hours(n),
        "day" => now - Duration::days(n),
        "week" => now - Duration::weeks(n),
        "month" => sub_months(now, n),
        "year" => now.with_year(now.year() - n as i32).unwrap_or(now),
        _ => return None,
    };
    Some(dt)
}

pub(super) fn sub_months(dt: NaiveDateTime, months: i64) -> NaiveDateTime {
    let total = dt.year() as i64 * 12 + (dt.month0() as i64) - months;
    let year = (total.div_euclid(12)) as i32;
    let month0 = total.rem_euclid(12) as u32;
    let day = dt.day().min(28); // clamp to avoid invalid dates
    NaiveDate::from_ymd_opt(year, month0 + 1, day)
        .and_then(|d| d.and_hms_opt(dt.hour(), dt.minute(), dt.second()))
        .unwrap_or(dt)
}

// Translates a Go reference-time layout ("2006-01-02 15:04:05") into a chrono
// `strftime` format. Longest tokens first so `2006` isn't split.
pub(super) fn go_layout_to_chrono(layout: &str) -> String {
    const SUBS: &[(&str, &str)] = &[
        ("2006", "%Y"),
        ("January", "%B"),
        ("Monday", "%A"),
        ("-07:00", "%:z"),
        ("-0700", "%z"),
        ("15", "%H"),
        ("Jan", "%b"),
        ("Mon", "%a"),
        ("MST", "%Z"),
        (".000", "%.3f"),
        ("06", "%y"),
        ("01", "%m"),
        ("02", "%d"),
        ("_2", "%e"),
        ("03", "%I"),
        ("04", "%M"),
        ("05", "%S"),
        ("PM", "%p"),
    ];
    let mut out = String::new();
    let mut rest = layout;
    'outer: while let Some(ch) = rest.chars().next() {
        for (go, cr) in SUBS {
            if let Some(tail) = rest.strip_prefix(go) {
                out.push_str(cr);
                rest = tail;
                continue 'outer;
            }
        }
        out.push(ch);
        rest = &rest[ch.len_utf8()..];
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::filters::tests::{f, run};

    #[test]
    fn date_absolute_and_layout() {
        // ISO absolute via the fuzzy format table.
        let out = run("2023-05-01 12:30:00", &[f("timeago", &[])]);
        assert!(out.starts_with("2023-05-01T12:30:00"), "got {out}");
        // Explicit Go layout.
        let out = run("01/05/2023", &[f("dateparse", &["02/01/2006"])]);
        assert!(out.starts_with("2023-05-01"), "got {out}");
    }

    #[test]
    fn date_relative_is_parseable() {
        // Relative dates resolve against "now"; just assert we produced an
        // RFC-3339-looking timestamp rather than the literal input.
        let out = run("3 days ago", &[f("timeago", &[])]);
        assert!(out.contains('T') && out.len() >= 19, "got {out}");
        let out = run("just now", &[f("reltime", &[])]);
        assert!(out.contains('T'), "got {out}");
    }

    #[test]
    fn a_date_only_value_parses_to_midnight() {
        let out = run("2023-05-01", &[f("timeago", &[])]);
        assert!(out.starts_with("2023-05-01T00:00:00"), "got {out}");
        let out = run("15/03/2024", &[f("dateparse", &["02/01/2006"])]);
        assert!(out.starts_with("2024-03-15T00:00:00"), "got {out}");
    }

    #[test]
    fn relative_dates_reach_back_by_month_and_year() {
        use chrono::Datelike;
        let now = chrono::Local::now().naive_local();
        let out = run("2 years ago", &[f("timeago", &[])]);
        assert!(
            out.starts_with(&format!("{}-", now.year() - 2)),
            "got {out}"
        );
        let out = run("a month ago", &[f("timeago", &[])]);
        assert!(out.contains('T') && out.len() >= 19, "got {out}");
        assert_eq!(run("whenever", &[f("timeago", &[])]), "whenever");
    }

    #[test]
    fn dateparse_datetime_layout_and_unparseable_fallback() {
        // A full datetime Go layout parses date + time.
        let out = run(
            "2023-05-01 14:30:00",
            &[f("dateparse", &["2006-01-02 15:04:05"])],
        );
        assert!(out.starts_with("2023-05-01T14:30:00"), "got {out}");
        // Nothing matches -> the original text is returned verbatim.
        assert_eq!(
            run("total garbage", &[f("dateparse", &["2006"])]),
            "total garbage"
        );
    }

    #[test]
    fn reltime_parses_rfc2822_and_rfc3339_and_keeps_unparseable() {
        // RFC 2822 (RSS/Torznab pubDate) normalises to UTC RFC 3339.
        let out = run("Tue, 30 Jun 2026 11:19:47 +0000", &[f("reltime", &[])]);
        assert!(out.starts_with("2026-06-30T11:19:47"), "got {out}");
        // RFC 3339 with an offset is shifted to UTC.
        let out = run("2026-06-30T11:19:47+02:00", &[f("timeago", &[])]);
        assert!(out.starts_with("2026-06-30T09:19:47"), "got {out}");
        // A string that is not a date at all is returned unchanged.
        assert_eq!(
            run("hello world foobar", &[f("reltime", &[])]),
            "hello world foobar"
        );
    }

    #[test]
    fn parse_relative_covers_every_unit_and_keyword() {
        // Keywords.
        assert!(parse_relative("just now").is_some());
        assert!(parse_relative("now").is_some());
        assert!(parse_relative("garbage nonsense").is_none());

        // "today" is midnight; "yesterday" is one day earlier at midnight.
        let today = parse_relative("today").unwrap();
        assert_eq!((today.hour(), today.minute(), today.second()), (0, 0, 0));
        let yesterday = parse_relative("yesterday").unwrap();
        assert_eq!((today - yesterday), Duration::days(1));

        // "<n> <unit> ago" for each supported unit, plus "a"/"an" as one.
        for expr in [
            "5 seconds ago",
            "30 minutes ago",
            "2 hours ago",
            "3 days ago",
            "1 week ago",
            "2 months ago",
            "1 year ago",
            "an hour ago",
            "a day ago",
        ] {
            assert!(parse_relative(expr).is_some(), "expected Some for {expr:?}");
        }

        // A relative time is strictly in the past.
        let two_hours_ago = parse_relative("2 hours ago").unwrap();
        let now = parse_relative("just now").unwrap();
        assert!(two_hours_ago < now);
    }

    #[test]
    fn sub_months_clamps_day_and_crosses_year_boundary() {
        // 31 Mar - 1 month clamps the day to 28 (no 31 Feb).
        let dt = NaiveDate::from_ymd_opt(2023, 3, 31)
            .unwrap()
            .and_hms_opt(12, 0, 0)
            .unwrap();
        assert_eq!(
            sub_months(dt, 1).date(),
            NaiveDate::from_ymd_opt(2023, 2, 28).unwrap()
        );
        // Subtracting across the year boundary rolls the year back.
        let dt2 = NaiveDate::from_ymd_opt(2023, 1, 15)
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap();
        assert_eq!(
            sub_months(dt2, 2).date(),
            NaiveDate::from_ymd_opt(2022, 11, 15).unwrap()
        );
    }

    #[test]
    fn go_layout_to_chrono_translates_reference_tokens() {
        assert_eq!(go_layout_to_chrono("2006-01-02"), "%Y-%m-%d");
        assert_eq!(go_layout_to_chrono("15:04:05"), "%H:%M:%S");
        assert_eq!(go_layout_to_chrono("02/01/2006"), "%d/%m/%Y");
        assert_eq!(go_layout_to_chrono("January 2006"), "%B %Y");
        assert_eq!(go_layout_to_chrono("03:04 PM"), "%I:%M %p");
        assert_eq!(go_layout_to_chrono("-0700"), "%z");
        assert_eq!(go_layout_to_chrono("-07:00"), "%:z");
    }

    #[test]
    fn go_layout_to_chrono_keeps_non_ascii_literals_intact() {
        assert_eq!(go_layout_to_chrono("02 января 2006 г."), "%d января %Y г.");
        assert_eq!(
            go_layout_to_chrono("02.01.2006 à 15:04"),
            "%d.%m.%Y à %H:%M"
        );
    }

    #[test]
    fn dateparse_with_a_non_ascii_layout_falls_back_instead_of_panicking() {
        assert_eq!(
            run("pas une date", &[f("dateparse", &["02 января 2006"])]),
            "pas une date"
        );
    }
}

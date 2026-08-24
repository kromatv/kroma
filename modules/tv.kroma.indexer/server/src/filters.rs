//! The Cardigann field/keyword filter pipeline.
//!
//! A filter takes the current string value (plus zero or more arguments) and
//! returns a transformed string. Filters chain in declaration order. Arguments
//! may themselves be templates (`append "{{ if .Config.x }}…{{ end }}"`), so
//! they are rendered against the context before the filter runs.
//!
//! The commonly-used filters are implemented faithfully; unknown filters pass
//! the value through unchanged (a definition using one exotic filter still
//! returns usable releases) - see [`apply_one`].

use chrono::{Datelike, Duration, Local, NaiveDate, NaiveDateTime, TimeZone, Timelike, Utc};

use crate::context::Context;
use crate::definition::Filter;
use crate::template;

/// Run a filter chain over `value`.
pub fn apply(value: &str, filters: &[Filter], ctx: &Context) -> String {
    let mut v = value.to_string();
    for f in filters {
        let args: Vec<String> = f.args.iter().map(|a| template::render(a, ctx)).collect();
        v = apply_one(&f.name, &v, &args);
    }
    v
}

fn apply_one(name: &str, value: &str, args: &[String]) -> String {
    let arg = |i: usize| args.get(i).map(String::as_str).unwrap_or("");
    match name {
        "re_replace" => match regex::Regex::new(arg(0)) {
            Ok(re) => re.replace_all(value, arg(1)).into_owned(),
            Err(_) => value.to_string(),
        },
        "replace" => value.replace(arg(0), arg(1)),
        "trim" => {
            if args.is_empty() {
                value.trim().to_string()
            } else {
                let cut: Vec<char> = arg(0).chars().collect();
                value.trim_matches(|c| cut.contains(&c)).to_string()
            }
        }
        "trimprefix" => value.strip_prefix(arg(0)).unwrap_or(value).to_string(),
        "trimsuffix" => value.strip_suffix(arg(0)).unwrap_or(value).to_string(),
        "prepend" => format!("{}{}", arg(0), value),
        "append" => format!("{}{}", value, arg(0)),
        "tolower" => value.to_lowercase(),
        "toupper" => value.to_uppercase(),
        "split" => split(value, arg(0), arg(1)),
        "regexp" => regexp_extract(value, arg(0)),
        "htmldecode" => html_decode(value),
        "htmlencode" => html_encode(value),
        "urldecode" => url_decode(value),
        "urlencode" => url_encode(value),
        "validate" => validate(value, arg(0)),
        "validfilename" => valid_filename(value),
        "diacritics" => remove_diacritics(value),
        "querystring" => query_param(value, arg(0)),
        "dateparse" | "date" => date_parse(value, args),
        "timeago" | "reltime" | "fuzzytime" | "timeparse" => reltime(value),
        // Debug helpers + not-yet-modeled filters: pass through unchanged.
        "hexdump" | "strdump" | "widthfix" => value.to_string(),
        _ => value.to_string(),
    }
}

// Split on a separator and take the element at `index` (negative counts from
// the end, Cardigann-style). Out-of-range yields the original value.
fn split(value: &str, sep: &str, index: &str) -> String {
    if sep.is_empty() {
        return value.to_string();
    }
    let parts: Vec<&str> = value.split(sep).collect();
    let idx: i64 = index.parse().unwrap_or(0);
    let i = if idx < 0 { parts.len() as i64 + idx } else { idx };
    if i >= 0 && (i as usize) < parts.len() {
        parts[i as usize].to_string()
    } else {
        value.to_string()
    }
}

// Returns the first capture group of `pattern` (or the whole match if the
// pattern has no groups), else empty.
fn regexp_extract(value: &str, pattern: &str) -> String {
    match regex::Regex::new(pattern) {
        Ok(re) => match re.captures(value) {
            Some(caps) => caps
                .get(1)
                .or_else(|| caps.get(0))
                .map(|m| m.as_str().to_string())
                .unwrap_or_default(),
            None => String::new(),
        },
        Err(_) => value.to_string(),
    }
}

// Keeps the value only if it is one of the comma-separated allowed values
// (case-insensitive), else empty. Used to whitelist e.g. genres.
fn validate(value: &str, allowed: &str) -> String {
    let ok = allowed
        .split(',')
        .map(str::trim)
        .any(|a| a.eq_ignore_ascii_case(value.trim()));
    if ok {
        value.to_string()
    } else {
        String::new()
    }
}

fn valid_filename(value: &str) -> String {
    value.replace(['<', '>', ':', '"', '/', '\\', '|', '?', '*'], "")
}

// Strips common Latin diacritics (à->a, é->e, ü->u, ñ->n…). A pragmatic table,
// not full Unicode normalization.
fn remove_diacritics(value: &str) -> String {
    value
        .chars()
        .map(|c| match c {
            'à'..='å' => 'a',
            'À'..='Å' => 'A',
            'è'..='ë' => 'e',
            'È'..='Ë' => 'E',
            'ì'..='ï' => 'i',
            'Ì'..='Ï' => 'I',
            'ò'..='ö' => 'o',
            'Ò'..='Ö' => 'O',
            'ù'..='ü' => 'u',
            'Ù'..='Ü' => 'U',
            'ñ' => 'n',
            'Ñ' => 'N',
            'ç' => 'c',
            'Ç' => 'C',
            'ý' | 'ÿ' => 'y',
            other => other,
        })
        .collect()
}

fn query_param(value: &str, key: &str) -> String {
    let query = value.split_once('?').map(|(_, q)| q).unwrap_or(value);
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            if k == key {
                return url_decode(v);
            }
        }
    }
    String::new()
}

fn url_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
                match u8::from_str_radix(hex, 16) {
                    Ok(b) => {
                        out.push(b);
                        i += 3;
                    }
                    Err(_) => {
                        out.push(bytes[i]);
                        i += 1;
                    }
                }
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Percent-encode (RFC 3986 unreserved). `pub(crate)` so the session layer's
/// form/query encoding shares one implementation.
pub(crate) fn url_encode(s: &str) -> String {
    let mut out = String::new();
    for &b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn html_decode(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        rest = &rest[amp..];
        if let Some(semi) = rest.find(';').filter(|&i| i <= 10) {
            let entity = &rest[1..semi];
            let decoded = match entity {
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                "apos" => Some('\''),
                "nbsp" => Some('\u{00a0}'),
                e if e.starts_with("#x") || e.starts_with("#X") => {
                    u32::from_str_radix(&e[2..], 16).ok().and_then(char::from_u32)
                }
                e if e.starts_with('#') => e[1..].parse::<u32>().ok().and_then(char::from_u32),
                _ => None,
            };
            match decoded {
                Some(c) => {
                    out.push(c);
                    rest = &rest[semi + 1..];
                }
                None => {
                    out.push('&');
                    rest = &rest[1..];
                }
            }
        } else {
            out.push('&');
            rest = &rest[1..];
        }
    }
    out.push_str(rest);
    out
}

fn html_encode(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

// RFC 3339 (the domain layer only needs *a* parseable timestamp for age
// display).
fn to_rfc3339(dt: NaiveDateTime) -> String {
    Utc.from_utc_datetime(&dt).to_rfc3339()
}

// `dateparse`/`date`: try each supplied Go layout, then a set of common
// formats, then relative parsing.
fn date_parse(value: &str, layouts: &[String]) -> String {
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
fn reltime(value: &str) -> String {
    parse_fuzzy(value.trim()).unwrap_or_else(|| value.to_string())
}

fn parse_fuzzy(v: &str) -> Option<String> {
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
fn parse_relative(v: &str) -> Option<NaiveDateTime> {
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
    let n: i64 = caps.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(1);
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

fn sub_months(dt: NaiveDateTime, months: i64) -> NaiveDateTime {
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
fn go_layout_to_chrono(layout: &str) -> String {
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
    use crate::definition::Filter;

    fn f(name: &str, args: &[&str]) -> Filter {
        Filter { name: name.into(), args: args.iter().map(|s| s.to_string()).collect() }
    }

    fn run(value: &str, filters: &[Filter]) -> String {
        apply(value, filters, &Context::default())
    }

    #[test]
    fn basic_string_filters() {
        assert_eq!(run("Hello", &[f("tolower", &[])]), "hello");
        assert_eq!(run(" x ", &[f("trim", &[])]), "x");
        assert_eq!(run("a-b-c", &[f("replace", &["-", " "])]), "a b c");
        assert_eq!(run("cat=42&x=1", &[f("regexp", &["cat=(\\d+)"])]), "42");
        assert_eq!(run("/a/b/c", &[f("split", &["/", "2"])]), "b");
        assert_eq!(run("/a/b/c", &[f("split", &["/", "-1"])]), "c");
        assert_eq!(run("abc", &[f("prepend", &["/dl/"]), f("append", &[".torrent"])]), "/dl/abc.torrent");
    }

    #[test]
    fn regexp_replace_chain() {
        let out = run("The.Matrix.1999", &[f("re_replace", &["\\.", " "])]);
        assert_eq!(out, "The Matrix 1999");
    }

    #[test]
    fn url_and_html() {
        assert_eq!(run("a%20b%2Fc", &[f("urldecode", &[])]), "a b/c");
        assert_eq!(run("a b/c", &[f("urlencode", &[])]), "a%20b%2Fc");
        assert_eq!(run("Tom &amp; Jerry &#39;s", &[f("htmldecode", &[])]), "Tom & Jerry 's");
    }

    #[test]
    fn validate_and_filename() {
        assert_eq!(run("Action", &[f("validate", &["Action, Drama"])]), "Action");
        assert_eq!(run("Nope", &[f("validate", &["Action, Drama"])]), "");
        assert_eq!(run("a/b:c", &[f("validfilename", &[])]), "abc");
    }

    #[test]
    fn querystring_filter() {
        assert_eq!(run("https://x/dl?id=99&k=v", &[f("querystring", &["id"])]), "99");
    }

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
    fn diacritics_filter() {
        assert_eq!(run("Amélie Café", &[f("diacritics", &[])]), "Amelie Cafe");
        // Uppercase accents + cedilla map to their ASCII base letter too.
        assert_eq!(run("ÀÉÎÕÜ Ñ Ç", &[f("diacritics", &[])]), "AEIOU N C");
        assert_eq!(
            run("àáâãäå ìíîï òóôõö ùúûü ñ ç ýÿ", &[f("diacritics", &[])]),
            "aaaaaa iiii ooooo uuuu n c yy"
        );
    }

    #[test]
    fn querystring_returns_empty_when_the_key_is_absent() {
        assert_eq!(run("https://x/dl?id=99&k=v", &[f("querystring", &["missing"])]), "");
        assert_eq!(run("https://x/dl", &[f("querystring", &["id"])]), "");
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
        assert!(out.starts_with(&format!("{}-", now.year() - 2)), "got {out}");
        let out = run("a month ago", &[f("timeago", &[])]);
        assert!(out.contains('T') && out.len() >= 19, "got {out}");
        assert_eq!(run("whenever", &[f("timeago", &[])]), "whenever");
    }

    #[test]
    fn trim_variants_and_case() {
        // trim with an explicit cut-set trims those chars from both ends.
        assert_eq!(run("**hi**", &[f("trim", &["*"])]), "hi");
        assert_eq!(run("xxabcx", &[f("trim", &["x"])]), "abc");
        assert_eq!(run("/dl/file", &[f("trimprefix", &["/dl/"])]), "file");
        // A prefix/suffix that is not present leaves the value unchanged.
        assert_eq!(run("file", &[f("trimprefix", &["/dl/"])]), "file");
        assert_eq!(run("file.torrent", &[f("trimsuffix", &[".torrent"])]), "file");
        assert_eq!(run("file", &[f("trimsuffix", &[".torrent"])]), "file");
        assert_eq!(run("abc", &[f("toupper", &[])]), "ABC");
    }

    #[test]
    fn html_encode_escapes_entities() {
        assert_eq!(run("1 < 2 & 3", &[f("htmlencode", &[])]), "1 &lt; 2 &amp; 3");
        assert_eq!(run("say \"hi\"", &[f("htmlencode", &[])]), "say &quot;hi&quot;");
    }

    #[test]
    fn html_decode_hex_and_unknown_entities() {
        // Hex numeric entity decodes.
        assert_eq!(run("&#x41;&#x42;", &[f("htmldecode", &[])]), "AB");
        // An unknown entity is left verbatim (never dropped).
        assert_eq!(run("&foo;bar", &[f("htmldecode", &[])]), "&foo;bar");
        // A bare ampersand with no terminating `;` stays literal.
        assert_eq!(run("Tom & Jerry", &[f("htmldecode", &[])]), "Tom & Jerry");
    }

    #[test]
    fn url_decode_plus_and_malformed_escapes() {
        // `+` decodes to a space.
        assert_eq!(run("a+b+c", &[f("urldecode", &[])]), "a b c");
        // A malformed `%zz` escape is passed through byte-for-byte.
        assert_eq!(run("a%zzb", &[f("urldecode", &[])]), "a%zzb");
    }

    #[test]
    fn split_edge_cases() {
        // An empty separator returns the value unchanged.
        assert_eq!(run("abc", &[f("split", &["", "0"])]), "abc");
        // An index past the end (positive or negative) returns the whole value.
        assert_eq!(run("a/b", &[f("split", &["/", "9"])]), "a/b");
        assert_eq!(run("a/b", &[f("split", &["/", "-9"])]), "a/b");
        // A non-numeric index defaults to 0 (the first element).
        assert_eq!(run("a/b/c", &[f("split", &["/", "notnum"])]), "a");
    }

    #[test]
    fn regexp_extract_group_whole_match_and_errors() {
        // No capture group -> the whole match.
        assert_eq!(run("abc123def", &[f("regexp", &["\\d+"])]), "123");
        // No match at all -> empty string.
        assert_eq!(run("abc", &[f("regexp", &["\\d+"])]), "");
        // An invalid pattern leaves the value unchanged.
        assert_eq!(run("abc", &[f("regexp", &["("])]), "abc");
    }

    #[test]
    fn re_replace_invalid_pattern_passes_through() {
        assert_eq!(run("keep me", &[f("re_replace", &["(", "x"])]), "keep me");
    }

    #[test]
    fn querystring_no_match_and_no_question_mark() {
        // A missing key yields empty.
        assert_eq!(run("https://x/dl?id=99", &[f("querystring", &["missing"])]), "");
        // A bare `k=v&...` (no `?`) is treated as the query itself.
        assert_eq!(run("id=5&k=v", &[f("querystring", &["k"])]), "v");
    }

    #[test]
    fn unknown_and_debug_filters_pass_value_through() {
        assert_eq!(run("keep", &[f("totally_unknown_filter", &[])]), "keep");
        assert_eq!(run("keep", &[f("hexdump", &[])]), "keep");
        assert_eq!(run("keep", &[f("strdump", &[])]), "keep");
        assert_eq!(run("keep", &[f("widthfix", &[])]), "keep");
    }

    #[test]
    fn dateparse_datetime_layout_and_unparseable_fallback() {
        // A full datetime Go layout parses date + time.
        let out = run("2023-05-01 14:30:00", &[f("dateparse", &["2006-01-02 15:04:05"])]);
        assert!(out.starts_with("2023-05-01T14:30:00"), "got {out}");
        // Nothing matches -> the original text is returned verbatim.
        assert_eq!(run("total garbage", &[f("dateparse", &["2006"])]), "total garbage");
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
        assert_eq!(run("hello world foobar", &[f("reltime", &[])]), "hello world foobar");
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
        let dt = NaiveDate::from_ymd_opt(2023, 3, 31).unwrap().and_hms_opt(12, 0, 0).unwrap();
        assert_eq!(sub_months(dt, 1).date(), NaiveDate::from_ymd_opt(2023, 2, 28).unwrap());
        // Subtracting across the year boundary rolls the year back.
        let dt2 = NaiveDate::from_ymd_opt(2023, 1, 15).unwrap().and_hms_opt(0, 0, 0).unwrap();
        assert_eq!(sub_months(dt2, 2).date(), NaiveDate::from_ymd_opt(2022, 11, 15).unwrap());
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
        assert_eq!(go_layout_to_chrono("02.01.2006 à 15:04"), "%d.%m.%Y à %H:%M");
    }

    #[test]
    fn dateparse_with_a_non_ascii_layout_falls_back_instead_of_panicking() {
        assert_eq!(run("pas une date", &[f("dateparse", &["02 января 2006"])]), "pas une date");
    }
}

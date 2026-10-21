// Split on a separator and take the element at `index` (negative counts from
// the end, Cardigann-style). Out-of-range yields the original value.
pub(super) fn split(value: &str, sep: &str, index: &str) -> String {
    if sep.is_empty() {
        return value.to_string();
    }
    let parts: Vec<&str> = value.split(sep).collect();
    let idx: i64 = index.parse().unwrap_or(0);
    let i = if idx < 0 {
        parts.len() as i64 + idx
    } else {
        idx
    };
    if i >= 0 && (i as usize) < parts.len() {
        parts[i as usize].to_string()
    } else {
        value.to_string()
    }
}

// Returns the first capture group of `pattern` (or the whole match if the
// pattern has no groups), else empty.
pub(super) fn regexp_extract(value: &str, pattern: &str) -> String {
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
pub(super) fn validate(value: &str, allowed: &str) -> String {
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

pub(super) fn valid_filename(value: &str) -> String {
    value.replace(['<', '>', ':', '"', '/', '\\', '|', '?', '*'], "")
}

// Strips common Latin diacritics (à->a, é->e, ü->u, ñ->n…). A pragmatic table,
// not full Unicode normalization.
pub(super) fn remove_diacritics(value: &str) -> String {
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

#[cfg(test)]
mod tests {
    use crate::filters::tests::{f, run};

    #[test]
    fn validate_and_filename() {
        assert_eq!(
            run("Action", &[f("validate", &["Action, Drama"])]),
            "Action"
        );
        assert_eq!(run("Nope", &[f("validate", &["Action, Drama"])]), "");
        assert_eq!(run("a/b:c", &[f("validfilename", &[])]), "abc");
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
}

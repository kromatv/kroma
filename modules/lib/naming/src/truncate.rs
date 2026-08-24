//! Truncating a rendered token to a byte budget, head or tail, without
//! splitting a UTF-8 character.

// Truncate `s` to `max_bytes` bytes including a trailing `...` (Radarr's
// `{Token:30}`). A negative width keeps the END of the string, with a
// leading ellipsis instead. Respects UTF-8 char boundaries.
pub(super) fn truncate(s: &str, max_bytes: i32) -> String {
    let budget = max_bytes.unsigned_abs() as usize;
    if s.len() <= budget {
        return s.to_string();
    }
    const ELLIPSIS: &str = "...";
    if budget <= ELLIPSIS.len() {
        return ELLIPSIS[..budget].to_string();
    }
    let keep = budget - ELLIPSIS.len();
    if max_bytes >= 0 {
        let end = floor_char_boundary(s, keep);
        format!("{}{ELLIPSIS}", &s[..end])
    } else {
        let start = ceil_char_boundary(s, s.len() - keep);
        format!("{ELLIPSIS}{}", &s[start..])
    }
}

fn floor_char_boundary(s: &str, mut idx: usize) -> usize {
    if idx >= s.len() {
        return s.len();
    }
    while idx > 0 && !s.is_char_boundary(idx) {
        idx -= 1;
    }
    idx
}

fn ceil_char_boundary(s: &str, mut idx: usize) -> usize {
    if idx >= s.len() {
        return s.len();
    }
    while idx < s.len() && !s.is_char_boundary(idx) {
        idx += 1;
    }
    idx
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncation_keeps_boundaries() {
        assert_eq!(
            truncate("A Very Long Movie Title Here", 13),
            "A Very Lon..."
        );
        assert_eq!(
            truncate("A Very Long Movie Title Here", -13),
            "...Title Here"
        );
        assert_eq!(truncate("Short", 30), "Short");
        // Accented chars must not be split mid-byte.
        let out = truncate("Amélie Poulain Deluxe", 8);
        assert!(out.is_char_boundary(out.len()) && out.ends_with("..."));
    }

    #[test]
    fn truncation_tiny_budget_is_partial_ellipsis() {
        // Budget at or below the ellipsis length yields a (possibly partial) ellipsis.
        assert_eq!(truncate("abcdef", 3), "...");
        assert_eq!(truncate("abcdef", 2), "..");
        assert_eq!(truncate("abcdef", 1), ".");
        // A negative tail keep respects UTF-8 boundaries too.
        let tail = truncate("héllo wörld tail", -7);
        assert!(tail.starts_with("...") && tail.is_char_boundary(tail.len()));
    }

    #[test]
    fn truncation_never_splits_a_multi_byte_character() {
        let title = "日本語の映画";
        let head = truncate(title, 8);
        assert_eq!(head, "日...");
        let tail = truncate(title, -8);
        assert_eq!(tail, "...画");
    }
}

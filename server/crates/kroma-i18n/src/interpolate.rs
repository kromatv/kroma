//! `{name}` interpolation over a message template.

/// Replace `{name}` tokens in `template` from `vars` (`name` is `[A-Za-z0-9_]+`,
/// matching the TS `\{(\w+)\}`). Unknown tokens are kept verbatim; single pass,
/// so a substituted value is never re-scanned.
pub fn interpolate(template: &str, vars: &[(&str, &str)]) -> String {
    if vars.is_empty() || !template.contains('{') {
        return template.to_string();
    }
    let mut out = String::with_capacity(template.len());
    let mut rest = template;
    while let Some(open) = rest.find('{') {
        out.push_str(&rest[..open]);
        let after = &rest[open + 1..];
        match after.find('}') {
            Some(close) => {
                let name = &after[..close];
                let is_token = !name.is_empty()
                    && name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_');
                match vars.iter().find(|(k, _)| *k == name) {
                    Some((_, value)) if is_token => out.push_str(value),
                    _ => {
                        out.push('{');
                        out.push_str(name);
                        out.push('}');
                    }
                }
                rest = &after[close + 1..];
            }
            None => {
                out.push('{');
                out.push_str(after);
                return out;
            }
        }
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interpolation_keeps_unknown_tokens() {
        assert_eq!(interpolate("hi {name}", &[("name", "Max")]), "hi Max");
        assert_eq!(
            interpolate("keep {unknown}", &[("name", "x")]),
            "keep {unknown}"
        );
        assert_eq!(interpolate("{a}", &[("a", "{b}"), ("b", "!")]), "{b}");
    }

    #[test]
    fn an_unclosed_placeholder_is_left_alone_rather_than_eating_the_rest() {
        // A translator typo must not truncate the sentence: whatever follows the
        // stray `{` is still shown.
        assert_eq!(
            interpolate("Salut {name", &[("name", "Ana")]),
            "Salut {name"
        );
        assert_eq!(interpolate("a {b c", &[]), "a {b c");
    }

    #[test]
    fn an_unknown_placeholder_is_left_visible_so_it_gets_noticed() {
        // Substituting an empty string would silently drop a word; leaving the
        // token shows a translator exactly what is missing.
        assert_eq!(interpolate("Salut {name}", &[]), "Salut {name}");
        assert_eq!(interpolate("{a} et {b}", &[("a", "x")]), "x et {b}");
    }
}

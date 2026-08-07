//! Registry autodiscovery, RSS-style: a registry may hand out its WEBSITE URL
//! instead of the raw `modules.json`. The page names its catalog with
//!
//! ```html
//! <link rel="kroma-modules" href="/modules.json">
//! ```
//!
//! and the catalog fetch follows that link when the body isn't JSON. Tolerant
//! of attribute order, quote style and a multi-valued `rel`; bounded to
//! `<link` tags only.

/// The first `<link>` whose `rel` list contains `kroma-modules`, as its raw
/// (possibly relative) `href`.
pub fn catalog_href(html: &str) -> Option<String> {
    // ASCII-only lowercasing keeps byte offsets aligned with the original, so
    // the case-preserving href can be sliced out of `html` at the same range.
    let lower: String = html.chars().map(|c| c.to_ascii_lowercase()).collect();
    let mut at = 0;
    while let Some(found) = lower[at..].find("<link") {
        let start = at + found;
        let end = lower[start..].find('>').map(|e| start + e)?;
        let tag = &html[start..end];
        let tag_lower = &lower[start..end];
        at = end + 1;
        let is_catalog = attr_value(tag, tag_lower, "rel")
            .is_some_and(|rel| rel.split_whitespace().any(|r| r.eq_ignore_ascii_case("kroma-modules")));
        if !is_catalog {
            continue;
        }
        if let Some(href) = attr_value(tag, tag_lower, "href") {
            if !href.is_empty() {
                return Some(href.to_string());
            }
        }
    }
    None
}

// The value of `name="..."` / `name='...'` / `name=bare` inside one tag,
// case-preserving. The `=` must follow the attribute NAME at a word boundary,
// so `data-href=` never satisfies `href`.
fn attr_value<'a>(tag: &'a str, tag_lower: &str, name: &str) -> Option<&'a str> {
    let needle = format!("{name}=");
    let mut from = 0;
    while let Some(found) = tag_lower[from..].find(&needle) {
        let pos = from + found;
        let boundary = pos == 0 || tag_lower.as_bytes()[pos - 1].is_ascii_whitespace();
        from = pos + needle.len();
        if !boundary {
            continue;
        }
        let rest = &tag[from..];
        return match rest.chars().next() {
            Some(q @ ('"' | '\'')) => rest[1..].split(q).next(),
            _ => rest.split(|c: char| c.is_ascii_whitespace() || c == '>').next(),
        };
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_catalog_link_among_others() {
        let html = r#"<html><head>
            <link rel="icon" href="/favicon.svg">
            <LINK HREF="/modules.json" REL="kroma-modules">
        </head></html>"#;
        assert_eq!(catalog_href(html).as_deref(), Some("/modules.json"));
    }

    #[test]
    fn accepts_single_quotes_and_a_multi_valued_rel() {
        let html = "<link rel='alternate kroma-modules' href='https://x/cat.json'>";
        assert_eq!(catalog_href(html).as_deref(), Some("https://x/cat.json"));
    }

    #[test]
    fn preserves_href_case() {
        let html = r#"<link rel="kroma-modules" href="/Modules.JSON">"#;
        assert_eq!(catalog_href(html).as_deref(), Some("/Modules.JSON"));
    }

    #[test]
    fn ignores_pages_without_the_tag_and_lookalike_attributes() {
        assert_eq!(catalog_href("<html><body>hi</body></html>"), None);
        assert_eq!(catalog_href(r#"<link rel="kroma-modules" data-href="/x">"#), None);
        assert_eq!(catalog_href(r#"<a rel="kroma-modules" href="/x">catalog</a>"#), None);
    }

    #[test]
    fn survives_an_unterminated_tag() {
        assert_eq!(catalog_href("<link rel=\"kroma-modules\" href=\"/x\""), None);
    }
}

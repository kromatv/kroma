//! Element selection + text/attribute extraction over parsed HTML.
//!
//! Definitions target the DOM the way jQuery/AngleSharp do, which is a superset
//! of what the pure-CSS [`scraper`] engine parses. The two extensions that
//! actually appear in real definitions are handled here:
//!
//! - `:contains("text")` - not standard CSS; emulated by stripping it from the
//!   selector and post-filtering matched elements by their text content.
//! - `:has(sub)` - supported natively by recent `selectors`; left in the
//!   selector and only stripped if parsing fails.
//!
//! XPath selectors (a minority of definitions) are handled by the optional
//! [`crate::xpath`] module; without the `xpath` feature they select nothing and
//! the engine reports the definition as unsupported.

use scraper::{ElementRef, Html, Selector};

/// Is this selector string XPath (rather than CSS)? Cardigann uses a leading
/// slash / `./` / `//` to signal XPath.
pub fn is_xpath(sel: &str) -> bool {
    let s = sel.trim_start();
    s.starts_with('/') || s.starts_with("./") || s.starts_with("(/")
}

/// Select all elements matching `sel` within `scope` (descendants only), with
/// `:contains()` emulation.
pub fn select_all<'a>(scope: ElementRef<'a>, sel: &str) -> Vec<ElementRef<'a>> {
    let (mut clean, contains) = strip_contains(sel);
    // A selector that is ONLY `:contains("x")` strips to empty, which fails to
    // parse and would silently match nothing - breaking Cardigann's login-error
    // / freeleech checks. In jQuery a bare `:contains` matches ANY element
    // holding the text, so fall back to the universal selector instead.
    if clean.trim().is_empty() && !contains.is_empty() {
        clean = "*".to_string();
    }
    let parsed = match Selector::parse(clean.trim()) {
        Ok(p) => p,
        // Retry once with `:has(...)` removed for the (rare) engine that can't
        // parse it.
        Err(_) => match Selector::parse(strip_has(&clean).trim()) {
            Ok(p) => p,
            Err(_) => return Vec::new(),
        },
    };
    scope
        .select(&parsed)
        .filter(|el| {
            contains
                .iter()
                .all(|term| element_text(*el).contains(term.as_str()))
        })
        .collect()
}

/// First element matching `sel` within `scope`.
pub fn select_first<'a>(scope: ElementRef<'a>, sel: &str) -> Option<ElementRef<'a>> {
    select_all(scope, sel).into_iter().next()
}

/// The normalized visible text of an element: all descendant text, trimmed with
/// internal whitespace runs collapsed to single spaces (matching how trackers
/// render titles).
pub fn element_text(el: ElementRef) -> String {
    normalize_ws(&el.text().collect::<String>())
}

/// Element text with a set of descendant sub-trees removed first (Cardigann's
/// `remove:`), e.g. dropping a nested "FREELEECH" badge from a title cell.
pub fn element_text_removing(el: ElementRef, remove: &str) -> String {
    // The node-id type comes from `ego_tree` (a transitive dep via scraper); let
    // inference name it so we needn't take the dependency directly.
    let mut excluded = std::collections::HashSet::new();
    for m in select_all(el, remove) {
        for d in m.descendants() {
            excluded.insert(d.id());
        }
    }
    let mut out = String::new();
    for node in el.descendants() {
        if excluded.contains(&node.id()) {
            continue;
        }
        if let Some(t) = node.value().as_text() {
            out.push_str(t);
        }
    }
    normalize_ws(&out)
}

/// Read an attribute off an element (normalized whitespace).
pub fn element_attr(el: ElementRef, attr: &str) -> Option<String> {
    el.value().attr(attr).map(|v| v.trim().to_string())
}

fn normalize_ws(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

// Splits `:contains("term")` (or `:contains(term)`) pseudo-classes out of a
// selector, returning the cleaned selector and the required substrings.
fn strip_contains(sel: &str) -> (String, Vec<String>) {
    let mut clean = String::new();
    let mut terms = Vec::new();
    // Byte-offset based (via `find` + `char_indices`) so non-ASCII text inside a
    // selector - e.g. `tr:contains("Téléchargé")` on FR/DE trackers - never
    // desyncs a char index against a `&str` byte slice (which would panic on a
    // non-char-boundary or corrupt the cleaned selector).
    let mut rest = sel;
    while let Some(pos) = rest.find(":contains(") {
        clean.push_str(&rest[..pos]);
        rest = &rest[pos + ":contains(".len()..];
        // Read the balanced parenthesized argument.
        let mut depth = 1i32;
        let mut arg = String::new();
        let mut end = rest.len();
        for (k, c) in rest.char_indices() {
            match c {
                '(' => {
                    depth += 1;
                    arg.push('(');
                }
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        end = k + c.len_utf8();
                        break;
                    }
                    arg.push(')');
                }
                other => arg.push(other),
            }
        }
        let term = arg
            .trim()
            .trim_matches(|c| c == '"' || c == '\'')
            .to_string();
        if !term.is_empty() {
            terms.push(term);
        }
        rest = &rest[end..];
    }
    clean.push_str(rest);
    (clean, terms)
}

// Last-resort fallback for engines that can't parse `:has(...)`. Best-effort:
// drops the whole `:has(...)` group.
fn strip_has(sel: &str) -> String {
    let mut out = String::new();
    let mut rest = sel;
    while let Some(pos) = rest.find(":has(") {
        out.push_str(&rest[..pos]);
        rest = &rest[pos + ":has(".len()..];
        let mut depth = 1;
        let mut j = 0;
        for (k, c) in rest.char_indices() {
            match c {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        j = k + 1;
                        break;
                    }
                }
                _ => {}
            }
        }
        rest = &rest[j..];
    }
    out.push_str(rest);
    out
}

pub fn parse_document(body: &str) -> Html {
    Html::parse_document(body)
}

#[cfg(test)]
mod tests {
    use super::*;

    const DOC: &str = r#"
      <table class="results">
        <tr class="torrent">
          <td class="name"><a href="/t/1">Cool Movie 2020 <span class="tag">FREELEECH</span></a></td>
          <td class="size">1.5 GB</td>
        </tr>
        <tr class="torrent">
          <td class="name"><a href="/t/2">Other Show</a></td>
          <td class="size">700 MB</td>
        </tr>
      </table>
    "#;

    #[test]
    fn selects_rows_and_text() {
        let doc = parse_document(DOC);
        let root = doc.root_element();
        let rows = select_all(root, "table.results tr.torrent");
        assert_eq!(rows.len(), 2);
        let name = select_first(rows[0], "td.name a").unwrap();
        assert_eq!(element_text(name), "Cool Movie 2020 FREELEECH");
        assert_eq!(element_attr(name, "href").as_deref(), Some("/t/1"));
    }

    #[test]
    fn remove_subtree_from_text() {
        let doc = parse_document(DOC);
        let root = doc.root_element();
        let rows = select_all(root, "tr.torrent");
        let name = select_first(rows[0], "td.name a").unwrap();
        assert_eq!(element_text_removing(name, "span.tag"), "Cool Movie 2020");
    }

    #[test]
    fn contains_emulation() {
        let doc = parse_document(DOC);
        let root = doc.root_element();
        // Only the row whose text contains "Cool" should match.
        let rows = select_all(root, "tr.torrent:contains(\"Cool\")");
        assert_eq!(rows.len(), 1);
        assert!(element_text(rows[0]).contains("Cool Movie"));
    }

    #[test]
    fn bare_contains_matches_any_element() {
        // A selector that is ONLY `:contains(...)` (Cardigann login-error /
        // freeleech checks) must still match - the empty cleaned selector used
        // to fail to parse and silently match nothing.
        let doc = parse_document("<html><body>invalid api key</body></html>");
        let root = doc.root_element();
        assert!(select_first(root, ":contains(\"invalid api key\")").is_some());
        assert!(select_first(root, ":contains(\"not present here\")").is_none());
    }

    #[test]
    fn strip_contains_is_utf8_safe() {
        // Non-ASCII text inside :contains, and NOT the final token, must not
        // panic or corrupt the cleaned selector (byte vs char index).
        let (clean, terms) = strip_contains("tr:contains(\"Téléchargé\") td.name");
        assert_eq!(clean, "tr td.name");
        assert_eq!(terms, vec!["Téléchargé".to_string()]);
    }

    #[test]
    fn contains_terms_are_split_out_of_the_selector() {
        // `:contains()` is a jQuery extension no CSS engine implements, so it is
        // lifted out and applied as a text filter afterwards. Leaving it in the
        // selector makes the whole thing fail to parse and the row match nothing.
        let (clean, terms) = strip_contains(r#"tr:contains("Download")"#);
        assert_eq!(clean, "tr");
        assert_eq!(terms, ["Download"]);

        // Unquoted is the same thing.
        let (clean, terms) = strip_contains("tr:contains(Download)");
        assert_eq!(clean, "tr");
        assert_eq!(terms, ["Download"]);
    }

    #[test]
    fn several_contains_terms_all_survive_and_the_rest_of_the_selector_is_kept() {
        let (clean, terms) = strip_contains(r#"table tr:contains("HD"):contains("x265") td.name"#);
        assert_eq!(clean, "table tr td.name");
        assert_eq!(terms, ["HD", "x265"]);
    }

    #[test]
    fn a_contains_term_with_parentheses_inside_it_is_read_whole() {
        // The argument is read by balancing parens, not by finding the first
        // `)`, or a release named "Movie (2020)" would truncate to "Movie (2020"
        // and match nothing.
        let (clean, terms) = strip_contains(r#"tr:contains("Movie (2020) 1080p")"#);
        assert_eq!(clean, "tr");
        assert_eq!(terms, ["Movie (2020) 1080p"]);
    }

    #[test]
    fn a_non_ascii_contains_term_does_not_corrupt_the_selector() {
        // FR/DE trackers really do this. The scanner is byte-offset based, so a
        // multi-byte char must not desync the slice - it would panic on a
        // non-char-boundary or silently mangle the cleaned selector.
        let (clean, terms) = strip_contains(r#"tr:contains("Téléchargé")"#);
        assert_eq!(clean, "tr");
        assert_eq!(terms, ["Téléchargé"]);

        let (clean, terms) = strip_contains(r#"td.名前:contains("ダウンロード") a"#);
        assert_eq!(clean, "td.名前 a");
        assert_eq!(terms, ["ダウンロード"]);
    }

    #[test]
    fn a_selector_with_no_contains_is_returned_untouched() {
        let (clean, terms) = strip_contains("table tr td.name a");
        assert_eq!(clean, "table tr td.name a");
        assert!(terms.is_empty());
    }

    #[test]
    fn has_groups_are_dropped_whole_for_engines_that_cannot_parse_them() {
        // The last-resort fallback: better to match a superset of rows and
        // filter later than to fail the selector outright and return nothing.
        assert_eq!(strip_has("tr:has(a.download)"), "tr");
        assert_eq!(
            strip_has("table tr:has(td.seeds) td.name"),
            "table tr td.name"
        );
    }

    #[test]
    fn a_nested_has_group_is_dropped_whole() {
        // Balanced-paren scanning again: stopping at the first `)` would leave
        // a dangling `)` behind and produce an unparseable selector.
        assert_eq!(strip_has("tr:has(td:nth-child(2)) a"), "tr a");
    }

    #[test]
    fn several_has_groups_are_all_dropped() {
        assert_eq!(strip_has("tr:has(a):has(td.x) span"), "tr span");
    }

    #[test]
    fn a_selector_with_no_has_is_returned_untouched() {
        assert_eq!(strip_has("table tr td a"), "table tr td a");
        assert_eq!(strip_has(""), "");
    }

    #[test]
    fn an_unterminated_has_group_does_not_hang_or_panic() {
        // A malformed definition should degrade, not spin.
        let out = strip_has("tr:has(a.download");
        assert!(out.len() <= "tr:has(a.download".len(), "{out}");
    }

    #[test]
    fn a_selector_the_engine_rejects_is_retried_without_its_has_group() {
        let doc = parse_document(DOC);
        let root = doc.root_element();
        assert!(
            Selector::parse("tr.torrent:has(td:bogus)").is_err(),
            "fixture is no longer rejected"
        );
        assert_eq!(select_all(root, "tr.torrent:has(td:bogus)").len(), 2);
    }

    #[test]
    fn a_selector_neither_attempt_can_parse_matches_nothing() {
        let doc = parse_document(DOC);
        let root = doc.root_element();
        assert!(select_all(root, "tr:bogus-pseudo").is_empty());
        assert!(select_first(root, "tr[[").is_none());
    }
}

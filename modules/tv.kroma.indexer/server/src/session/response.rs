// Enough of a body to recognise an error document or an empty result set,
// short enough that a log line stays a log line.
const MAX_SNIPPET: usize = 400;

/// The first [`MAX_SNIPPET`] characters of a response, whitespace-collapsed onto
/// one line, so a log can say what came back rather than only that it was
/// unusable.
pub(super) fn snippet(body: &str) -> String {
    let flat = body.split_whitespace().collect::<Vec<_>>().join(" ");
    match flat.char_indices().nth(MAX_SNIPPET) {
        Some((cut, _)) => format!("{}...", &flat[..cut]),
        None => flat,
    }
}

/// Whether a torznab/newznab feed states in its own response header that it has
/// no results, which separates an honest empty answer from a broken selector.
pub(super) fn declared_empty(body: &str) -> bool {
    let Some(start) = body.find(":response") else { return false };
    let rest = &body[start..];
    let end = rest.find('>').unwrap_or(rest.len());
    attr(&rest[..end], "total").is_some_and(|t| t.trim() == "0")
}

/// The message a tracker refused the query with, when it answered 200 and a body
/// that is not results: either a Torznab/Newznab `<error>` document, or - for a
/// path that declared `xml`/`json` - a body of the wrong shape entirely (some
/// trackers answer an unknown `t=` with a bare line of text).
pub(super) fn refusal(kind: &str, body: &str) -> Option<String> {
    let head = body.trim_start().trim_start_matches('\u{feff}').trim_start();
    let opener = match kind {
        "xml" => '<',
        "json" => {
            if head.starts_with('{') || head.starts_with('[') {
                return api_error(body);
            }
            return Some(format!("the indexer did not answer json: {}", snippet(body)));
        }
        // `html` is the default kind and covers whatever a scraped page returns,
        // so its shape says nothing; only a real `<error>` document counts.
        _ => return api_error(body),
    };
    if !head.starts_with(opener) {
        return Some(format!("the indexer did not answer xml: {}", snippet(body)));
    }
    api_error(body)
}

/// The message from a Torznab/Newznab `<error>` document, which a tracker
/// answers 200 with when it refuses the query (bad key, unknown category, rate
/// limit). Parsing it as results would silently yield nothing.
fn api_error(body: &str) -> Option<String> {
    let head = body.trim_start();
    if !head.starts_with('<') {
        return None;
    }
    let start = body.find("<error")?;
    let rest = &body[start..];
    let end = rest.find("/>").or_else(|| rest.find('>'))?;
    let tag = &rest[..end];
    let code = attr(tag, "code");
    let description = attr(tag, "description").or_else(|| attr(tag, "message"));
    match (code, description) {
        (Some(code), Some(description)) => Some(format!("tracker error {code}: {description}")),
        (None, Some(description)) => Some(format!("tracker error: {description}")),
        (Some(code), None) => Some(format!("tracker error {code}")),
        (None, None) => Some("tracker returned an error document".to_string()),
    }
}

fn attr(tag: &str, name: &str) -> Option<String> {
    let at = tag.find(&format!("{name}=\""))?;
    let rest = &tag[at + name.len() + 2..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

#[cfg(test)]
mod response_tests {
    use super::*;

    #[test]
    fn a_torznab_error_document_is_an_error_not_an_empty_result() {
        let body = r#"<?xml version="1.0"?><error code="100" description="Incorrect user credentials"/>"#;
        assert_eq!(
            api_error(body).as_deref(),
            Some("tracker error 100: Incorrect user credentials"),
        );
    }

    #[test]
    fn a_real_result_set_is_not_an_error() {
        assert!(api_error(r#"<rss><channel><item><title>x</title></item></channel></rss>"#).is_none());
    }

    #[test]
    fn an_empty_result_set_is_not_an_error_either() {
        assert!(api_error(r#"<rss><channel></channel></rss>"#).is_none());
    }

    #[test]
    fn an_html_page_mentioning_error_elsewhere_is_left_alone() {
        assert!(api_error("<html><body>no errors here</body></html>").is_none());
    }

    // What YggReborn answers a `t=` it does not know with: not XML, so
    // `api_error` alone never recognises it.
    const BARE_REFUSAL: &str = "unsupported function";

    #[test]
    fn a_bare_text_body_on_an_xml_path_is_a_refusal() {
        let msg = refusal("xml", BARE_REFUSAL).expect("a refusal");
        assert!(msg.contains("did not answer xml"), "{msg}");
        assert!(msg.contains(BARE_REFUSAL), "{msg}");
        // Same body on a scraped page says nothing: html is the catch-all kind.
        assert!(refusal("html", BARE_REFUSAL).is_none());
    }

    #[test]
    fn a_login_page_served_to_a_json_path_is_a_refusal_too() {
        // The session died and the tracker answered the sign-in form. It parses
        // to zero rows, but the fix is to log in again, not to touch selectors.
        let msg = refusal("json", "<html><body>Please sign in</body></html>").expect("a refusal");
        assert!(msg.contains("did not answer json"), "{msg}");
    }

    #[test]
    fn a_byte_order_mark_does_not_make_valid_markup_a_refusal() {
        let msg = refusal("xml", "\u{feff}<?xml version=\"1.0\"?><rss><channel/></rss>");
        assert!(msg.is_none(), "{msg:?}");
    }

    #[test]
    fn a_well_formed_feed_is_not_a_refusal() {
        let feed = r#"<?xml version="1.0"?><rss><channel><item/></channel></rss>"#;
        assert!(refusal("xml", feed).is_none());
        assert!(refusal("json", r#"{"results":[]}"#).is_none());
        assert!(refusal("json", "[]").is_none());
    }

    #[test]
    fn a_feed_declaring_no_results_is_an_honest_empty() {
        // The body YggReborn returns for a title it does not carry: warning about
        // selectors here buries the searches that really are broken.
        let empty = r#"<?xml version="1.0" encoding="UTF-8"?>
          <rss version="2.0" xmlns:newznab="http://www.newznab.com/DTD/2010/feeds/attributes/">
            <channel><title>YggReborn</title>
              <newznab:response offset="0" total="0"/>
            </channel>
          </rss>"#;
        assert!(declared_empty(empty));
        assert!(!declared_empty(r#"<newznab:response offset="0" total="14"/>"#));
        // No header at all: the two cases stay indistinguishable, so it warns.
        assert!(!declared_empty(r#"<rss><channel></channel></rss>"#));
    }

    #[test]
    fn a_snippet_is_one_line_and_bounded() {
        let long = "a\n  b\n".repeat(500);
        let out = snippet(&long);
        assert!(!out.contains('\n'));
        assert!(out.chars().count() <= MAX_SNIPPET + 3);
    }
}

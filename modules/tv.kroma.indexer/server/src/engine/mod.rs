//! The search engine core: turn a [`Query`] into concrete HTTP requests, and
//! turn a fetched response body into [`Release`]s. Pure and I/O-free - the
//! transport (fetch, login, download resolution) lives in [`crate::session`],
//! so everything here is unit-testable against a fixed body.

use crate::definition::Definition;
use crate::context::Context;
use crate::selector;
use crate::{filters, IndexerConfig, Release};

mod json_value;
mod parse_html;
mod parse_json;
mod parse_xml;
mod query_attributes;
mod release;
mod request;
#[cfg(test)]
mod test_support;

pub use parse_html::parse_html;
pub use parse_json::parse_json;
pub use parse_xml::parse_xml;
pub use release::{parse_size, to_release};
pub use request::{build_requests, join_url, SearchRequest};

/// Apply the definition's `search.preprocessingfilters` to a raw response body
/// before it is parsed (e.g. strip a JSONP wrapper / leading junk). No-op when
/// none are declared.
pub fn preprocess(def: &Definition, cfg: &IndexerConfig, body: &str) -> String {
    if def.search.preprocessingfilters.is_empty() {
        return body.to_string();
    }
    let ctx = base_context(def, cfg);
    filters::apply(body, &def.search.preprocessingfilters, &ctx)
}

/// Does this definition select with XPath (rather than CSS)? Checked on the
/// rows selector and every field selector; definitions are internally
/// consistent, so any hit routes the whole parse to the XPath path.
pub fn uses_xpath(def: &Definition) -> bool {
    let row = def.search.rows.selector.as_deref().is_some_and(selector::is_xpath);
    row || def.search.fields.values().any(|f| f.selector.as_deref().is_some_and(selector::is_xpath))
}

/// Parse an HTML search response into releases, routing XPath definitions to
/// the (optional) libxml path.
pub fn parse_html_auto(def: &Definition, cfg: &IndexerConfig, body: &str) -> anyhow::Result<Vec<Release>> {
    if uses_xpath(def) {
        #[cfg(feature = "xpath")]
        {
            return crate::xpath::parse_html(def, cfg, body);
        }
        #[cfg(not(feature = "xpath"))]
        {
            anyhow::bail!(
                "definition '{}' uses XPath selectors; rebuild kroma-indexer with the `xpath` feature",
                def.id
            );
        }
    }
    parse_html(def, cfg, body)
}

fn base_context(def: &Definition, cfg: &IndexerConfig) -> Context {
    Context::with_config(def, cfg)
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::test_support::{build_def, cfg};

    #[test]
    fn preprocess_noop_and_filtered() {
        let plain = build_def(
            r#"
id: t
name: T
caps: {}
search:
  rows:
    selector: "tr"
"#,
        );
        assert_eq!(preprocess(&plain, &cfg("https://x/"), "body"), "body");

        let filtered = build_def(
            r#"
id: t
name: T
caps: {}
search:
  preprocessingfilters:
    - name: re_replace
      args: ["^junk", ""]
  rows:
    selector: "tr"
"#,
        );
        assert_eq!(preprocess(&filtered, &cfg("https://x/"), "junkREST"), "REST");
    }

    #[test]
    fn parse_html_auto_runs_a_css_definition_through_the_css_engine() {
        let def = build_def(
            r#"
id: t
name: T
caps: {}
search:
  rows:
    selector: "tr.r"
  fields:
    title:
      selector: "td.title"
"#,
        );
        let body = r#"<table><tr class="r"><td class="title">A</td></tr></table>"#;
        let rels = parse_html_auto(&def, &cfg("https://x/"), body).unwrap();
        assert_eq!(rels.len(), 1);
        assert_eq!(rels[0].title, "A");
    }

    #[cfg(not(feature = "xpath"))]
    #[test]
    fn an_xpath_definition_says_which_feature_is_missing_rather_than_returning_nothing() {
        let def = build_def(
            r#"
id: brokentracker
name: T
caps: {}
search:
  rows:
    selector: "//tr[@class='r']"
  fields:
    title:
      selector: "td"
"#,
        );
        let err = parse_html_auto(&def, &cfg("https://x/"), "<html></html>").unwrap_err().to_string();
        assert!(err.contains("brokentracker"), "{err}");
        assert!(err.contains("xpath"), "{err}");
    }


    #[test]
    fn uses_xpath_detection() {
        let css = build_def(
            r#"
id: t
name: T
caps: {}
search:
  rows:
    selector: "tr.torrent"
  fields:
    title:
      selector: "a"
"#,
        );
        assert!(!uses_xpath(&css));

        let xpath = build_def(
            r#"
id: t
name: T
caps: {}
search:
  rows:
    selector: "//tr[@class='torrent']"
  fields:
    title:
      selector: "a"
"#,
        );
        assert!(uses_xpath(&xpath));
    }
}

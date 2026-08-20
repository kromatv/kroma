use std::collections::HashMap;

use crate::context::Context;
use crate::definition::{Definition, Field};
use crate::template;
use crate::{filters, IndexerConfig, Release};

use super::base_context;
use super::release::to_release;

/// Parse an XML search response (Torznab/Newznab feeds) into releases. Uses the
/// crate's namespaced-XML DOM rather than the HTML engine.
pub fn parse_xml(def: &Definition, cfg: &IndexerConfig, body: &str) -> anyhow::Result<Vec<Release>> {
    let doc = crate::xmltree::parse(body);
    let base_ctx = base_context(def, cfg);

    let row_sel = def
        .search
        .rows
        .selector
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("definition has no rows selector"))?;
    let row_sel = template::render(row_sel, &base_ctx);

    let mut releases = Vec::new();
    for row in crate::xmltree::select_all(&doc, &row_sel) {
        if let Some(result) = extract_row_xml(def, &base_ctx, row) {
            releases.push(to_release(def, cfg, &result));
        }
    }
    Ok(releases)
}

fn extract_row_xml(
    def: &Definition,
    base_ctx: &Context,
    row: &crate::xmltree::XmlEl,
) -> Option<HashMap<String, String>> {
    let mut result: HashMap<String, String> = HashMap::new();
    for (name, field) in &def.search.fields {
        let mut ctx = base_ctx.clone();
        ctx.result = result.clone();
        let value = resolve_field_xml(field, row, &ctx)?;
        result.insert(name.clone(), value);
    }
    Some(result)
}

// `None` signals a required miss.
fn resolve_field_xml(field: &Field, row: &crate::xmltree::XmlEl, ctx: &Context) -> Option<String> {
    let raw: Option<String> = if let Some(text) = &field.text {
        Some(template::render(text, ctx))
    } else if !field.case.is_empty() {
        eval_case_xml(field, row, ctx)
    } else if let Some(sel) = &field.selector {
        let sel = template::render(sel, ctx);
        crate::xmltree::select_first(row, &sel).map(|el| read_element_xml(field, el))
    } else {
        Some(read_element_xml(field, row))
    };

    let value = match raw {
        Some(v) => v,
        None => match &field.default {
            Some(d) => template::render(d, ctx),
            None if field.optional => String::new(),
            None => return None,
        },
    };

    Some(filters::apply(&value, &field.filters, ctx))
}

fn read_element_xml(field: &Field, el: &crate::xmltree::XmlEl) -> String {
    match &field.attribute {
        Some(attr) => el.attr(attr).unwrap_or_default().to_string(),
        None => el.text(),
    }
}

// `case:` switch - first sub-selector that matches wins; `*` is the default.
fn eval_case_xml(field: &Field, row: &crate::xmltree::XmlEl, ctx: &Context) -> Option<String> {
    let mut default: Option<&String> = None;
    for (sel, val) in &field.case {
        if sel == "*" {
            default = Some(val);
            continue;
        }
        let rendered = template::render(sel, ctx);
        if crate::xmltree::select_first(row, &rendered).is_some() {
            return Some(template::render(val, ctx));
        }
    }
    default.map(|d| template::render(d, ctx))
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::test_support::{build_def, cfg};

    const XML_FEED: &str = r#"<?xml version="1.0"?>
      <rss xmlns:torznab="http://torznab.com/">
      <channel>
        <item>
          <title>Obsession 2026 1080p</title>
          <guid>abc123</guid>
          <category>2000</category>
          <torznab:attr name="seeders" value="305"/>
          <torznab:attr name="size" value="2314321864"/>
        </item>
        <item>
          <title>Other 720p</title>
          <guid>def456</guid>
          <category>2000</category>
          <torznab:attr name="seeders" value="7"/>
          <torznab:attr name="size" value="1000"/>
        </item>
      </channel>
      </rss>"#;

    #[test]
    fn parse_xml_extracts_items_and_attrs() {
        let def = build_def(
            r#"
id: t
name: T
caps:
  categorymappings:
    - {id: "2000", cat: "Movies"}
search:
  rows:
    selector: "item"
  fields:
    title:
      selector: "title"
    guid:
      selector: "guid"
    category:
      selector: "category"
    seeders:
      selector: "[name=seeders]"
      attribute: value
    size:
      selector: "[name=size]"
      attribute: value
"#,
        );
        let rels = parse_xml(&def, &cfg("https://x/"), XML_FEED).unwrap();
        assert_eq!(rels.len(), 2);
        assert_eq!(rels[0].title, "Obsession 2026 1080p");
        assert_eq!(rels[0].guid, "abc123");
        assert_eq!(rels[0].seeders, Some(305));
        assert_eq!(rels[0].size_bytes, Some(2_314_321_864));
        assert_eq!(rels[0].categories, vec![2000]);
        assert_eq!(rels[1].seeders, Some(7));
    }

    #[test]
    fn parse_xml_case_switch() {
        let def = build_def(
            r#"
id: t
name: T
caps: {}
search:
  rows:
    selector: "item"
  fields:
    title:
      selector: "title"
    seeders:
      case:
        "[name=seeders]": "100"
        "*": "0"
"#,
        );
        let rels = parse_xml(&def, &cfg("https://x/"), XML_FEED).unwrap();
        // Both items carry a seeders attr -> the case hit fires (constant 100).
        assert_eq!(rels[0].seeders, Some(100));
        assert_eq!(rels[1].seeders, Some(100));
    }


    #[test]
    fn an_xml_row_missing_a_required_field_is_dropped_and_defaults_fill_the_rest() {
        let def = build_def(
            r#"
id: t
name: T
caps:
  categorymappings:
    - {id: "2000", cat: "Movies"}
search:
  rows:
    selector: "item"
  fields:
    title:
      selector: "title"
    category:
      text: "2000"
    size:
      selector: "[name=size]"
      attribute: value
      default: "3 GB"
    leechers:
      selector: "[name=leechers]"
      attribute: value
      optional: true
    guid:
      selector: "guid"
"#,
        );
        let feed = r#"<?xml version="1.0"?>
          <rss xmlns:torznab="http://torznab.com/"><channel>
            <item><title>Has A Guid</title><guid>g1</guid></item>
            <item><title>No Guid</title></item>
          </channel></rss>"#;
        let rels = parse_xml(&def, &cfg("https://x/"), feed).unwrap();
        assert_eq!(rels.len(), 1);
        assert_eq!(rels[0].title, "Has A Guid");
        assert_eq!(rels[0].guid, "g1");
        assert_eq!(rels[0].categories, vec![2000]);
        assert_eq!(rels[0].size_bytes, Some(3 * 1024 * 1024 * 1024));
        assert_eq!(rels[0].leechers, None);
    }

    #[test]
    fn an_xml_field_with_no_selector_reads_the_row_and_a_missing_attribute_is_empty() {
        let def = build_def(
            r#"
id: t
name: T
caps: {}
search:
  rows:
    selector: "guid"
  fields:
    title: {}
    seeders:
      attribute: nosuchattr
      optional: true
"#,
        );
        let feed = r#"<?xml version="1.0"?><rss><channel><item><guid>abc123</guid></item></channel></rss>"#;
        let rels = parse_xml(&def, &cfg("https://x/"), feed).unwrap();
        assert_eq!(rels.len(), 1);
        assert_eq!(rels[0].title, "abc123");
        assert_eq!(rels[0].seeders, None);
    }

    #[test]
    fn an_xml_case_switch_falls_through_to_its_star_default() {
        let def = build_def(
            r#"
id: t
name: T
caps: {}
search:
  rows:
    selector: "item"
  fields:
    title:
      selector: "title"
    seeders:
      case:
        "[name=freeleech]": "100"
        "*": "7"
"#,
        );
        let rels = parse_xml(&def, &cfg("https://x/"), XML_FEED).unwrap();
        assert_eq!(rels.len(), 2);
        assert_eq!(rels[0].seeders, Some(7));
        assert_eq!(rels[1].seeders, Some(7));
    }

    #[test]
    fn an_xml_case_switch_with_no_match_and_no_default_drops_the_row() {
        let def = build_def(
            r#"
id: t
name: T
caps: {}
search:
  rows:
    selector: "item"
  fields:
    title:
      selector: "title"
    seeders:
      case:
        "[name=freeleech]": "100"
"#,
        );
        assert!(parse_xml(&def, &cfg("https://x/"), XML_FEED).unwrap().is_empty());
    }

}

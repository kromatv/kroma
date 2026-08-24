use std::collections::HashMap;

use scraper::ElementRef;

use crate::context::Context;
use crate::definition::{Definition, Field};
use crate::selector;
use crate::template;
use crate::{filters, IndexerConfig, Release};

use super::base_context;
use super::release::to_release;

/// Parse an HTML search response into releases (CSS path).
pub fn parse_html(
    def: &Definition,
    cfg: &IndexerConfig,
    body: &str,
) -> anyhow::Result<Vec<Release>> {
    let doc = selector::parse_document(body);
    let root = doc.root_element();
    let base_ctx = base_context(def, cfg);

    let row_sel = def
        .search
        .rows
        .selector
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("definition has no rows selector"))?;
    // The rows selector can itself be templated (`{{ .Config.uploader }}`).
    let row_sel = template::render(row_sel, &base_ctx);

    let mut releases = Vec::new();
    for row in selector::select_all(root, &row_sel) {
        if let Some(result) = extract_row_html(def, &base_ctx, row) {
            releases.push(to_release(def, cfg, &result));
        }
    }
    Ok(releases)
}

// Returns `None` when a required (non-optional, no-default) field is missing -
// that release is skipped.
fn extract_row_html(
    def: &Definition,
    base_ctx: &Context,
    row: ElementRef,
) -> Option<HashMap<String, String>> {
    let mut result: HashMap<String, String> = HashMap::new();
    for (name, field) in &def.search.fields {
        let mut ctx = base_ctx.clone();
        ctx.result = result.clone();
        let value = resolve_field_html(field, row, &ctx)?;
        result.insert(name.clone(), value);
    }
    Some(result)
}

// `None` signals a required miss.
fn resolve_field_html(field: &Field, row: ElementRef, ctx: &Context) -> Option<String> {
    let raw: Option<String> = if let Some(text) = &field.text {
        Some(template::render(text, ctx))
    } else if !field.case.is_empty() {
        eval_case_html(field, row, ctx)
    } else if let Some(sel) = &field.selector {
        let sel = template::render(sel, ctx);
        selector::select_first(row, &sel).map(|el| read_element(field, el, ctx))
    } else {
        Some(read_element(field, row, ctx))
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

fn read_element(field: &Field, el: ElementRef, _ctx: &Context) -> String {
    if let Some(attr) = &field.attribute {
        selector::element_attr(el, attr).unwrap_or_default()
    } else if let Some(remove) = &field.remove {
        selector::element_text_removing(el, remove)
    } else {
        selector::element_text(el)
    }
}

// `case:` switch - first sub-selector that matches wins; `*` is the default.
fn eval_case_html(field: &Field, row: ElementRef, ctx: &Context) -> Option<String> {
    let mut default: Option<&String> = None;
    for (sel, val) in &field.case {
        if sel == "*" {
            default = Some(val);
            continue;
        }
        let rendered = template::render(sel, ctx);
        if selector::select_first(row, &rendered).is_some() {
            return Some(template::render(val, ctx));
        }
    }
    default.map(|d| template::render(d, ctx))
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{build_def, cfg};
    use super::*;

    #[test]
    fn parse_html_extracts_rows() {
        let def = build_def(
            r#"
id: t
name: T
caps:
  categorymappings:
    - {id: "1", cat: "Movies/HD"}
search:
  rows:
    selector: "table.results tr.torrent"
  fields:
    title:
      selector: "td.name a"
    details:
      selector: "td.name a"
      attribute: href
    download:
      selector: "td.name a"
      attribute: href
    size:
      selector: "td.size"
    seeders:
      selector: "td.seeders"
    category:
      text: "1"
"#,
        );
        let cfg = cfg("https://site.to/");
        let body = r#"
          <table class="results">
            <tr class="torrent">
              <td class="name"><a href="/t/1">Cool Movie 2020</a></td>
              <td class="size">1.5 GB</td>
              <td class="seeders">10</td>
            </tr>
            <tr class="torrent">
              <td class="name"><a href="/t/2">Other Show</a></td>
              <td class="size">700 MB</td>
              <td class="seeders">3</td>
            </tr>
          </table>
        "#;
        let rels = parse_html(&def, &cfg, body).unwrap();
        assert_eq!(rels.len(), 2);
        assert_eq!(rels[0].title, "Cool Movie 2020");
        assert_eq!(rels[0].details_url.as_deref(), Some("https://site.to/t/1"));
        assert_eq!(rels[0].link.as_deref(), Some("https://site.to/t/1"));
        assert_eq!(rels[0].size_bytes, Some(1_610_612_736));
        assert_eq!(rels[0].seeders, Some(10));
        assert_eq!(rels[0].categories, vec![2040]);
        assert_eq!(rels[1].seeders, Some(3));
    }

    #[test]
    fn parse_html_skips_required_miss_and_honors_optional_default() {
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
    size:
      selector: "td.size"
      default: "2 GB"
    seeders:
      selector: "td.seeders"
      optional: true
    grabs:
      selector: "td.grabs"
"#,
        );
        let cfg = cfg("https://x/");
        let body = r#"
          <table>
            <tr class="r"><td class="title">Good</td><td class="grabs">7</td></tr>
            <tr class="r"><td class="title">NoGrabs</td></tr>
          </table>
        "#;
        let rels = parse_html(&def, &cfg, body).unwrap();
        // Second row misses the required (non-optional, no-default) `grabs`: dropped.
        assert_eq!(rels.len(), 1);
        assert_eq!(rels[0].title, "Good");
        // `size` fell back to its default; `seeders` was optional -> empty -> None.
        assert_eq!(rels[0].size_bytes, Some(2 * 1024 * 1024 * 1024));
        assert_eq!(rels[0].seeders, None);
        assert_eq!(rels[0].grabs, Some(7));
    }

    #[test]
    fn parse_html_case_switch_selects_category() {
        let def = build_def(
            r#"
id: t
name: T
caps:
  categorymappings:
    - {id: "1", cat: "Movies/HD"}
search:
  rows:
    selector: "tr.r"
  fields:
    title:
      selector: "td.title"
    category:
      case:
        "td.hd": "1"
        "*": "9999"
"#,
        );
        let cfg = cfg("https://x/");
        let body = r#"
          <table>
            <tr class="r"><td class="title">A</td><td class="hd">HD</td></tr>
            <tr class="r"><td class="title">B</td></tr>
          </table>
        "#;
        let rels = parse_html(&def, &cfg, body).unwrap();
        // Row A hits the `td.hd` case -> id 1 -> Movies/HD (2040).
        assert_eq!(rels[0].categories, vec![2040]);
        // Row B hits `*` -> id 9999, unmapped -> no categories.
        assert!(rels[1].categories.is_empty());
    }

    #[test]
    fn parse_html_without_rows_selector_errors() {
        let def = build_def(
            r#"
id: t
name: T
caps: {}
search:
  rows: {}
"#,
        );
        let err = parse_html(&def, &cfg("https://x/"), "<html></html>").unwrap_err();
        assert!(err.to_string().contains("no rows selector"), "{err}");
    }

    #[test]
    fn a_field_with_no_selector_reads_the_row_and_remove_strips_descendants() {
        let def = build_def(
            r#"
id: t
name: T
caps: {}
search:
  rows:
    selector: "td.name"
  fields:
    title:
      remove: "span.tag"
    guid: {}
"#,
        );
        let body = r#"<table><tr><td class="name">Cool Movie <span class="tag">FREELEECH</span></td></tr></table>"#;
        let rels = parse_html(&def, &cfg("https://x/"), body).unwrap();
        assert_eq!(rels.len(), 1);
        assert_eq!(rels[0].title, "Cool Movie");
        assert_eq!(rels[0].guid, "Cool Movie FREELEECH");
    }
}

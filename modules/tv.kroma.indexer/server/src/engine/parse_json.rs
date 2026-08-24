use std::collections::HashMap;

use crate::context::Context;
use crate::definition::{Definition, Field};
use crate::template;
use crate::{filters, IndexerConfig, Release};

use super::base_context;
use super::json_value::{json_get, json_scalar_string, json_truthy};
use super::release::to_release;

/// Parse a JSON search response into releases (Cardigann `response: type: json`).
/// Row/field selectors are dotted JSON paths (`$.data.torrents`, `results`,
/// `foo[0].bar`); `text` templates and filters work exactly as for HTML.
pub fn parse_json(
    def: &Definition,
    cfg: &IndexerConfig,
    body: &str,
) -> anyhow::Result<Vec<Release>> {
    let root: serde_json::Value = serde_json::from_str(body)?;
    let base_ctx = base_context(def, cfg);

    let row_sel = def
        .search
        .rows
        .selector
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("definition has no rows selector"))?;
    let rows = match json_get(&root, row_sel) {
        Some(serde_json::Value::Array(arr)) => arr.clone(),
        // A single object row, or nothing.
        Some(v @ serde_json::Value::Object(_)) => vec![v.clone()],
        _ => Vec::new(),
    };

    let mut releases = Vec::new();
    for row in &rows {
        if let Some(result) = extract_row_json(def, &base_ctx, row) {
            releases.push(to_release(def, cfg, &result));
        }
    }
    Ok(releases)
}

fn extract_row_json(
    def: &Definition,
    base_ctx: &Context,
    row: &serde_json::Value,
) -> Option<HashMap<String, String>> {
    let mut result: HashMap<String, String> = HashMap::new();
    for (name, field) in &def.search.fields {
        let mut ctx = base_ctx.clone();
        ctx.result = result.clone();
        let value = resolve_field_json(field, row, &ctx)?;
        result.insert(name.clone(), value);
    }
    Some(result)
}

fn resolve_field_json(field: &Field, row: &serde_json::Value, ctx: &Context) -> Option<String> {
    let raw: Option<String> = if let Some(text) = &field.text {
        Some(template::render(text, ctx))
    } else if !field.case.is_empty() {
        // JSON case: a sub-path that exists (and is truthy) selects its value.
        let mut default = None;
        let mut hit = None;
        for (path, val) in &field.case {
            if path == "*" {
                default = Some(val);
            } else if json_get(row, path).is_some_and(json_truthy) {
                hit = Some(val);
                break;
            }
        }
        hit.or(default).map(|v| template::render(v, ctx))
    } else if let Some(sel) = &field.selector {
        json_get(row, sel).map(json_scalar_string)
    } else {
        Some(json_scalar_string(row))
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

#[cfg(test)]
mod tests {
    use super::super::test_support::{build_def, cfg};
    use super::*;

    #[test]
    fn parse_json_dotted_paths_and_scalars() {
        let def = build_def(
            r#"
id: t
name: T
caps: {}
search:
  rows:
    selector: "$.data.torrents"
  fields:
    title:
      selector: "name"
    size:
      selector: "size"
    seeders:
      selector: "seeders"
"#,
        );
        let cfg = cfg("https://x/");
        let body = r#"{"data":{"torrents":[
          {"name":"Rel One 1080p","size":123456,"seeders":42},
          {"name":"Rel Two 720p","size":999,"seeders":1}
        ]}}"#;
        let rels = parse_json(&def, &cfg, body).unwrap();
        assert_eq!(rels.len(), 2);
        assert_eq!(rels[0].title, "Rel One 1080p");
        assert_eq!(rels[0].size_bytes, Some(123456));
        assert_eq!(rels[0].seeders, Some(42));
        assert_eq!(rels[1].seeders, Some(1));
    }

    #[test]
    fn parse_json_single_object_row_and_case() {
        // A rows selector resolving to a single object yields one row.
        let obj_def = build_def(
            r#"
id: t
name: T
caps: {}
search:
  rows:
    selector: "result"
  fields:
    title:
      selector: "name"
"#,
        );
        let rels = parse_json(
            &obj_def,
            &cfg("https://x/"),
            r#"{"result":{"name":"Solo 1080p"}}"#,
        )
        .unwrap();
        assert_eq!(rels.len(), 1);
        assert_eq!(rels[0].title, "Solo 1080p");

        // JSON `case`: a truthy sub-path hits, else the `*` default.
        let case_def = build_def(
            r#"
id: t
name: T
caps: {}
search:
  rows:
    selector: "items"
  fields:
    title:
      selector: "name"
    seeders:
      case:
        has: "9"
        "*": "0"
"#,
        );
        let body = r#"{"items":[{"name":"A 1080p","has":true},{"name":"B 720p"}]}"#;
        let rels = parse_json(&case_def, &cfg("https://x/"), body).unwrap();
        assert_eq!(rels[0].seeders, Some(9));
        assert_eq!(rels[1].seeders, Some(0));
    }

    #[test]
    fn parse_json_missing_rows_returns_empty() {
        let def = build_def(
            r#"
id: t
name: T
caps: {}
search:
  rows:
    selector: "$.nope"
  fields:
    title:
      selector: "name"
"#,
        );
        let rels = parse_json(&def, &cfg("https://x/"), r#"{"data":1}"#).unwrap();
        assert!(rels.is_empty());
    }

    #[test]
    fn a_json_field_with_no_selector_reads_the_whole_row() {
        let def = build_def(
            r#"
id: t
name: T
caps: {}
search:
  rows:
    selector: "items"
  fields:
    title: {}
"#,
        );
        let body = r#"{"items":["Rel One 1080p","Rel Two 720p"]}"#;
        let rels = parse_json(&def, &cfg("https://x/"), body).unwrap();
        assert_eq!(rels.len(), 2);
        assert_eq!(rels[0].title, "Rel One 1080p");
        assert_eq!(rels[1].title, "Rel Two 720p");
    }

    #[test]
    fn a_json_row_missing_a_required_field_is_dropped_and_defaults_fill_the_rest() {
        let def = build_def(
            r#"
id: t
name: T
caps: {}
search:
  rows:
    selector: "items"
  fields:
    title:
      selector: name
    size:
      selector: size
      default: "3 GB"
    seeders:
      selector: seeders
      optional: true
    grabs:
      selector: grabs
"#,
        );
        let body = r#"{"items":[{"name":"Good","grabs":7},{"name":"NoGrabs"}]}"#;
        let rels = parse_json(&def, &cfg("https://x/"), body).unwrap();
        assert_eq!(rels.len(), 1);
        assert_eq!(rels[0].title, "Good");
        assert_eq!(rels[0].size_bytes, Some(3 * 1024 * 1024 * 1024));
        assert_eq!(rels[0].seeders, None);
        assert_eq!(rels[0].grabs, Some(7));
    }
}

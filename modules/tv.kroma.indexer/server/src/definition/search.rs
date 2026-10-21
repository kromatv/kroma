use indexmap::IndexMap;
use serde::Deserialize;

use super::scalar::{de_string_or_seq, ScalarString};
use super::{Field, Filter, Selector};

#[derive(Debug, Clone, Deserialize)]
pub struct Search {
    #[serde(default, deserialize_with = "de_search_paths")]
    pub paths: Vec<SearchPath>,
    #[serde(default)]
    pub inputs: IndexMap<String, ScalarString>,
    #[serde(default)]
    pub headers: IndexMap<String, ScalarString>,
    #[serde(default)]
    pub keywordsfilters: Vec<Filter>,
    #[serde(default)]
    pub preprocessingfilters: Vec<Filter>,
    pub rows: Rows,
    // Ordered: a field's `text` may reference an earlier `.Result.<name>`.
    #[serde(default)]
    pub fields: IndexMap<String, Field>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SearchPath {
    pub path: String,
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub response: Option<ResponseSpec>,
    #[serde(default)]
    pub inputs: IndexMap<String, ScalarString>,
    #[serde(default)]
    pub followredirect: bool,
    #[serde(default, deserialize_with = "de_string_or_seq")]
    pub categories: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ResponseSpec {
    // `html` (default) | `json` | `xml`.
    #[serde(rename = "type", default)]
    pub kind: String,
    #[serde(default)]
    pub attribute: Option<String>,
    #[serde(default)]
    pub nocookies: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Rows {
    #[serde(default)]
    pub selector: Option<String>,
    // For JSON: a sub-key on each row element whose array value is expanded
    // into individual rows (YTS: `data.movies` → each movie's `torrents`).
    #[serde(default)]
    pub attribute: Option<String>,
    // Rows to merge upward into the previous one (multi-line row layouts).
    #[serde(default)]
    pub after: i64,
    #[serde(default)]
    pub count: Option<CountBlock>,
    #[serde(default)]
    pub dateheaders: Option<Selector>,
    #[serde(default)]
    pub filters: Vec<Filter>,
    #[serde(default, rename = "missingAttributeEqualsNoResults")]
    pub missing_attribute_equals_no_results: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CountBlock {
    #[serde(default)]
    pub selector: Option<String>,
}
// A few legacy definitions list bare path strings instead of maps.
pub(super) fn de_search_paths<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> Result<Vec<SearchPath>, D::Error> {
    use serde::de::Error;
    let seq = Vec::<serde_yaml::Value>::deserialize(d)?;
    seq.into_iter()
        .map(|v| match v {
            serde_yaml::Value::String(path) => Ok(SearchPath {
                path,
                method: None,
                response: None,
                inputs: IndexMap::new(),
                followredirect: false,
                categories: Vec::new(),
            }),
            other => serde_yaml::from_value(other).map_err(D::Error::custom),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use crate::definition::test_support::parse_ok;
    use crate::definition::*;

    #[test]
    fn a_bare_path_string_is_shorthand_for_a_search_path() {
        let d = parse_ok(
            "\
id: demo
name: Demo
caps: {}
search:
  paths:
    - /legacy.php
    - path: /browse.php
      method: post
      followredirect: true
      categories: tv
      inputs: {sort: seeders}
      response: {type: json, attribute: results, nocookies: true}
  rows: {}
",
        );
        assert_eq!(d.search.paths.len(), 2);

        let legacy = &d.search.paths[0];
        assert_eq!(legacy.path, "/legacy.php");
        assert_eq!(legacy.method, None);
        assert!(legacy.response.is_none());
        assert!(legacy.inputs.is_empty());
        assert!(!legacy.followredirect);
        assert!(legacy.categories.is_empty());

        let modern = &d.search.paths[1];
        assert_eq!(modern.path, "/browse.php");
        assert_eq!(modern.method.as_deref(), Some("post"));
        assert!(modern.followredirect);
        assert_eq!(modern.categories, ["tv"]);
        assert_eq!(&*modern.inputs["sort"], "seeders");
        let response = modern.response.as_ref().unwrap();
        assert_eq!(response.kind, "json");
        assert_eq!(response.attribute.as_deref(), Some("results"));
        assert!(response.nocookies);
    }

    #[test]
    fn a_search_path_entry_that_is_neither_a_string_nor_a_path_map_is_rejected() {
        // Silently dropping a path would produce an indexer that returns nothing.
        let err = parse(
            b"\
id: demo
name: Demo
caps: {}
search:
  paths:
    - {method: post}
  rows: {}
",
        )
        .unwrap_err()
        .to_string();
        assert!(err.contains("path"), "{err}");
    }

    #[test]
    fn rows_read_their_paging_and_multi_line_hints() {
        let d = parse_ok(
            "\
id: demo
name: Demo
caps: {}
search:
  rows:
    selector: tr.torrent
    after: 1
    count: {selector: span.total}
    dateheaders: {selector: td.date, attribute: title}
    missingAttributeEqualsNoResults: true
    filters:
      - {name: andmatch}
",
        );
        let rows = &d.search.rows;
        assert_eq!(rows.selector.as_deref(), Some("tr.torrent"));
        assert_eq!(rows.after, 1, "each result spans two <tr>s");
        assert_eq!(
            rows.count.as_ref().unwrap().selector.as_deref(),
            Some("span.total")
        );
        assert_eq!(
            rows.dateheaders.as_ref().unwrap().attribute.as_deref(),
            Some("title")
        );
        // The YAML key is camelCase while the field is snake_case; a broken
        // rename turns "no results" into a hard error on every empty search.
        assert!(rows.missing_attribute_equals_no_results);
        assert_eq!(rows.filters[0].name, "andmatch");
    }
}

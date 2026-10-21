use indexmap::IndexMap;
use serde::Deserialize;

use super::scalar::{de_filter_args, de_opt_scalar_string, ScalarString};

/// Resolved in order: a `text` template or a `selector`, then `filters`, then
/// `default`.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct Field {
    #[serde(default)]
    pub selector: Option<String>,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub attribute: Option<String>,
    // CSS selector of descendant nodes to strip before reading text.
    #[serde(default)]
    pub remove: Option<String>,
    // First match wins; `*` is the default.
    #[serde(default)]
    pub case: IndexMap<String, String>,
    #[serde(default)]
    pub filters: Vec<Filter>,
    #[serde(default)]
    pub optional: bool,
    #[serde(default, deserialize_with = "de_opt_scalar_string")]
    pub default: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct Selector {
    #[serde(default)]
    pub selector: Option<String>,
    #[serde(default)]
    pub attribute: Option<String>,
    #[serde(default)]
    pub remove: Option<String>,
    #[serde(default)]
    pub case: IndexMap<String, String>,
    #[serde(default)]
    pub filters: Vec<Filter>,
    #[serde(default)]
    pub optional: bool,
}

/// How to turn a details URL into a `.torrent` link, magnet, or infohash.
#[derive(Debug, Clone, Deserialize)]
pub struct Download {
    #[serde(default, deserialize_with = "de_download_selectors")]
    pub selectors: Vec<Selector>,
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub infohash: Option<InfoHash>,
    #[serde(default)]
    pub inputs: IndexMap<String, ScalarString>,
    #[serde(default)]
    pub before: Option<BeforeRequest>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InfoHash {
    #[serde(default)]
    pub hash: Option<Selector>,
    #[serde(default)]
    pub title: Option<Selector>,
    // Some definitions inline the selector on the infohash block itself.
    #[serde(default)]
    pub selector: Option<String>,
    #[serde(default)]
    pub attribute: Option<String>,
}

/// A priming request before the download, e.g. a `/download.php` that sets a
/// token cookie.
#[derive(Debug, Clone, Deserialize)]
pub struct BeforeRequest {
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub inputs: IndexMap<String, ScalarString>,
}

/// `args` in YAML is a scalar, a list, or absent.
#[derive(Debug, Clone, Deserialize)]
pub struct Filter {
    pub name: String,
    #[serde(default, deserialize_with = "de_filter_args")]
    pub args: Vec<String>,
}

// A shorthand allows a bare selector string instead of a selector map.
pub(super) fn de_download_selectors<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> Result<Vec<Selector>, D::Error> {
    use serde::de::Error;
    let seq = Vec::<serde_yaml::Value>::deserialize(d)?;
    seq.into_iter()
        .map(|v| match v {
            serde_yaml::Value::String(s) => Ok(Selector {
                selector: Some(s),
                ..Selector::default()
            }),
            other => serde_yaml::from_value(other).map_err(D::Error::custom),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use crate::definition::test_support::{parse_ok, MINIMAL};
    use crate::definition::*;

    #[test]
    fn a_bare_selector_string_is_shorthand_for_a_download_selector() {
        let d = parse_ok(&format!(
            "{MINIMAL}\
download:
  method: post
  selectors:
    - a[href^=\"/download\"]
    - selector: a.dl
      attribute: href
      optional: true
  inputs: {{token: '{{{{ .Config.token }}}}'}}
  before: {{path: /prime.php, method: get, inputs: {{id: '1'}}}}
  infohash:
    selector: td.hash
    attribute: title
    hash: {{selector: span.h}}
    title: {{selector: span.t}}
"
        ));
        let download = d.download.unwrap();
        assert_eq!(download.method.as_deref(), Some("post"));
        assert_eq!(download.selectors.len(), 2);

        let shorthand = &download.selectors[0];
        assert_eq!(
            shorthand.selector.as_deref(),
            Some("a[href^=\"/download\"]")
        );
        assert_eq!(shorthand.attribute, None);
        assert!(!shorthand.optional);

        let full = &download.selectors[1];
        assert_eq!(full.selector.as_deref(), Some("a.dl"));
        assert_eq!(full.attribute.as_deref(), Some("href"));
        assert!(full.optional);

        assert_eq!(&*download.inputs["token"], "{{ .Config.token }}");
        let before = download.before.unwrap();
        assert_eq!(before.path.as_deref(), Some("/prime.php"));
        assert_eq!(before.method.as_deref(), Some("get"));
        assert_eq!(&*before.inputs["id"], "1");

        let infohash = download.infohash.unwrap();
        assert_eq!(infohash.selector.as_deref(), Some("td.hash"));
        assert_eq!(infohash.attribute.as_deref(), Some("title"));
        assert_eq!(infohash.hash.unwrap().selector.as_deref(), Some("span.h"));
        assert_eq!(infohash.title.unwrap().selector.as_deref(), Some("span.t"));
    }

    #[test]
    fn a_download_selector_that_is_neither_a_string_nor_a_map_is_rejected() {
        let err = parse(format!("{MINIMAL}download:\n  selectors: [42]\n").as_bytes())
            .unwrap_err()
            .to_string();
        assert!(!err.is_empty());
    }

    #[test]
    fn field_order_is_preserved_because_later_fields_reference_earlier_ones() {
        let d = parse_ok(
            "\
id: demo
name: Demo
caps: {}
search:
  rows: {selector: tr.result}
  fields:
    title:
      selector: td.name a
    details:
      selector: td.name a
      attribute: href
    download:
      text: \"{{ .Result.details }}&action=download\"
    seeders:
      selector: td.seeds
      remove: span.icon
      optional: true
      default: 0
      filters:
        - {name: replace, args: [\",\", \"\"]}
    category:
      case:
        i.movie: 2000
        i.tv: 5000
        \"*\": 8000
",
        );
        let fields = &d.search.fields;
        assert_eq!(
            fields.keys().collect::<Vec<_>>(),
            ["title", "details", "download", "seeders", "category"]
        );
        assert_eq!(fields["details"].attribute.as_deref(), Some("href"));
        assert_eq!(
            fields["download"].text.as_deref(),
            Some("{{ .Result.details }}&action=download")
        );

        let seeders = &fields["seeders"];
        assert_eq!(seeders.remove.as_deref(), Some("span.icon"));
        assert!(seeders.optional);
        assert_eq!(
            seeders.default.as_deref(),
            Some("0"),
            "a numeric default is a string"
        );
        assert_eq!(seeders.filters[0].name, "replace");

        let category = &fields["category"];
        assert_eq!(
            category.case.keys().collect::<Vec<_>>(),
            ["i.movie", "i.tv", "*"]
        );
        assert_eq!(category.case["*"], "8000");
    }
}

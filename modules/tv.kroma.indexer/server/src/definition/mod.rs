//! The Cardigann YAML definition schema, as spoken by Jackett and Prowlarr
//! (`definitions/vXX/*.yml`). Deserialization is deliberately lenient: real
//! definitions mix scalars and sequences freely, so custom deserializers
//! normalize those into stable Rust shapes.

mod field;
mod login;
mod scalar;
mod search;
#[cfg(test)]
mod test_support;

pub use field::{BeforeRequest, Download, Field, Filter, InfoHash, Selector};
pub use login::{Captcha, Login, LoginError, LoginTest, Message};
pub use scalar::ScalarString;
pub use search::{CountBlock, ResponseSpec, Rows, Search, SearchPath};

use indexmap::IndexMap;
use scalar::{de_opt_scalar_string, de_scalar_string};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Definition {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub language: String,
    #[serde(rename = "type", default)]
    pub kind: String,
    #[serde(default = "default_encoding")]
    pub encoding: String,
    #[serde(default)]
    pub links: Vec<String>,
    #[serde(default)]
    pub legacylinks: Vec<String>,
    // Minimum delay between requests to this indexer, in seconds.
    #[serde(default)]
    pub request_delay: Option<f64>,
    pub caps: Caps,
    #[serde(default)]
    pub settings: Vec<Setting>,
    #[serde(default)]
    pub login: Option<Login>,
    pub search: Search,
    #[serde(default)]
    pub download: Option<Download>,
}

fn default_encoding() -> String {
    "UTF-8".to_string()
}

#[derive(Debug, Clone, Deserialize)]
pub struct Caps {
    #[serde(default)]
    pub categorymappings: Vec<CategoryMapping>,
    #[serde(default)]
    pub categories: IndexMap<String, String>,
    #[serde(default)]
    pub modes: IndexMap<String, Vec<String>>,
    #[serde(default)]
    pub allowrawsearch: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CategoryMapping {
    #[serde(deserialize_with = "de_scalar_string")]
    pub id: String,
    // The Newznab category name, e.g. `Movies/HD`, `TV/Anime`.
    pub cat: String,
    #[serde(default)]
    pub desc: Option<String>,
    #[serde(default)]
    pub default: bool,
}

/// One admin-facing input; `.Config.<name>` resolves to its configured value.
#[derive(Debug, Clone, Deserialize)]
pub struct Setting {
    pub name: String,
    // `text` | `password` | `checkbox` | `select` | `info` | `info_*`.
    #[serde(rename = "type", default)]
    pub kind: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default, deserialize_with = "de_opt_scalar_string")]
    pub default: Option<String>,
    #[serde(default)]
    pub options: IndexMap<String, String>,
}

pub fn parse(bytes: &[u8]) -> anyhow::Result<Definition> {
    Ok(serde_yaml::from_slice(bytes)?)
}

#[cfg(test)]
mod tests {
    use crate::definition::test_support::{parse_ok, MINIMAL};
    use crate::definition::*;

    #[test]
    fn a_minimal_definition_leans_entirely_on_defaults() {
        let d = parse_ok(MINIMAL);
        assert_eq!(d.id, "demo");
        assert_eq!(d.name, "Demo Tracker");
        // Cardigann's own default, not serde's: an absent `encoding` is UTF-8.
        assert_eq!(d.encoding, "UTF-8");
        assert_eq!(d.description, "");
        assert_eq!(d.kind, "");
        assert!(d.links.is_empty());
        assert!(d.legacylinks.is_empty());
        assert_eq!(d.request_delay, None);
        assert!(d.caps.categorymappings.is_empty());
        assert!(d.caps.modes.is_empty());
        assert!(!d.caps.allowrawsearch);
        assert!(d.settings.is_empty());
        assert!(d.login.is_none());
        assert!(d.download.is_none());
        assert_eq!(d.search.rows.after, 0);
        assert!(d.search.rows.selector.is_none());
    }

    #[test]
    fn cosmetic_keys_the_engine_does_not_model_are_ignored() {
        let d = parse_ok(&format!(
            "{MINIMAL}\
changelog:
  - version: 1
    what: rewrote the row selector
followredirect: true
some-future-key:
  nested: [1, 2]
"
        ));
        assert_eq!(d.id, "demo");
    }

    #[test]
    fn a_category_id_may_be_written_as_an_int_or_a_string() {
        let d = parse_ok(
            "\
id: demo
name: Demo
caps:
  categorymappings:
    - {id: 2010, cat: Movies/HD}
    - {id: \"2010\", cat: Movies/HD, desc: HD movies, default: true}
    - {id: tv-hd, cat: TV/HD}
search:
  rows: {}
",
        );
        let ids: Vec<&str> = d
            .caps
            .categorymappings
            .iter()
            .map(|c| c.id.as_str())
            .collect();
        assert_eq!(ids, ["2010", "2010", "tv-hd"]);
        assert_eq!(d.caps.categorymappings[0].desc, None);
        assert!(!d.caps.categorymappings[0].default);
        assert_eq!(
            d.caps.categorymappings[1].desc.as_deref(),
            Some("HD movies")
        );
        assert!(d.caps.categorymappings[1].default);
    }

    #[test]
    fn caps_carry_the_modes_and_the_newznab_category_tree() {
        let d = parse_ok(
            "\
id: demo
name: Demo
caps:
  categories: {2000: Movies, 5000: TV}
  modes:
    search: [q]
    tv-search: [q, season, ep, imdbid, tvdbid]
    movie-search: [q, imdbid]
  allowrawsearch: true
search:
  rows: {}
",
        );
        assert!(d.caps.allowrawsearch);
        assert_eq!(d.caps.categories["5000"], "TV");
        assert_eq!(
            d.caps.modes["tv-search"],
            ["q", "season", "ep", "imdbid", "tvdbid"]
        );
        assert_eq!(
            d.caps.modes.keys().collect::<Vec<_>>(),
            ["search", "tv-search", "movie-search"]
        );
    }

    #[test]
    fn a_fractional_request_delay_is_kept() {
        // Truncating a `4.1` delay to an int would breach a tracker's rate limit.
        let d = parse_ok(&format!("{MINIMAL}requestDelay: 4.1\n"));
        assert_eq!(d.request_delay, Some(4.1));
    }

    #[test]
    fn links_accept_a_list_and_legacy_links_are_kept_apart() {
        let d = parse_ok(&format!(
            "{MINIMAL}\
links: [https://a.example/, https://b.example/]
legacylinks: [https://old.example/]
"
        ));
        assert_eq!(d.links, ["https://a.example/", "https://b.example/"]);
        assert_eq!(d.legacylinks, ["https://old.example/"]);
    }

    #[test]
    fn a_definition_missing_a_required_block_is_an_error() {
        for (missing, yaml) in [
            ("caps", "id: demo\nname: Demo\nsearch:\n  rows: {}\n"),
            ("search", "id: demo\nname: Demo\ncaps: {}\n"),
            // Without `rows` the engine parses "no results" forever.
            ("rows", "id: demo\nname: Demo\ncaps: {}\nsearch: {}\n"),
        ] {
            let err = parse(yaml.as_bytes()).unwrap_err().to_string();
            assert!(
                err.contains(missing),
                "expected {missing} to be required: {err}"
            );
        }
    }

    #[test]
    fn bytes_that_are_not_yaml_at_all_are_an_error() {
        assert!(parse(b"\t- : :\n").is_err());
        assert!(parse(b"").is_err(), "an empty file is not a definition");
    }
}

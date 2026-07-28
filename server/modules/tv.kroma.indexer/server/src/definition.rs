//! The Cardigann YAML definition schema, as spoken by Jackett and Prowlarr
//! (`definitions/vXX/*.yml`). This is a faithful-enough model of the format to
//! drive the engine: every field the search/login/download pipelines read is
//! typed here; the long tail of purely-cosmetic keys (descriptions, changelog
//! comments) is dropped by serde's default of ignoring unknown fields.
//!
//! Deserialization is deliberately lenient - real definitions mix scalars and
//! sequences freely (a `links:` is a list, an `args:` is a scalar *or* a list,
//! a category `id:` is an int *or* a string) - so a handful of custom
//! deserializers normalize those into stable Rust shapes.

use indexmap::IndexMap;
use serde::Deserialize;

/// One parsed Cardigann definition. Loaded from YAML; cheap to clone-by-ref via
/// the engine holding it behind an `Arc`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Definition {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub language: String,
    /// `public` | `private` | `semi-private`.
    #[serde(rename = "type", default)]
    pub kind: String,
    #[serde(default = "default_encoding")]
    pub encoding: String,
    /// Candidate base URLs, best first. The engine picks the first reachable.
    #[serde(default)]
    pub links: Vec<String>,
    #[serde(default)]
    pub legacylinks: Vec<String>,
    /// Minimum delay between requests to this indexer, in seconds (politeness /
    /// rate-limit avoidance). Fractional in the wild (`4.1`).
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

// ----- caps -----------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub struct Caps {
    #[serde(default)]
    pub categorymappings: Vec<CategoryMapping>,
    /// Newznab-style category tree (`categories:` map of id -> name), used by a
    /// few definitions instead of `categorymappings`.
    #[serde(default)]
    pub categories: IndexMap<String, String>,
    /// mode name (`search`, `tv-search`, `movie-search`, ...) -> the query
    /// parameters that mode accepts (`q`, `season`, `ep`, `imdbid`, `tmdbid`...).
    #[serde(default)]
    pub modes: IndexMap<String, Vec<String>>,
    #[serde(default)]
    pub allowrawsearch: bool,
}

/// One tracker category mapped onto a Torznab/Newznab bucket.
#[derive(Debug, Clone, Deserialize)]
pub struct CategoryMapping {
    /// The tracker's own category id (int or string in YAML; kept as a string).
    #[serde(deserialize_with = "de_scalar_string")]
    pub id: String,
    /// The Newznab category name, e.g. `Movies/HD`, `TV/Anime`.
    pub cat: String,
    #[serde(default)]
    pub desc: Option<String>,
    #[serde(default)]
    pub default: bool,
}

// ----- settings -------------------------------------------------------------------

/// One admin-facing configuration input (username, password, a freeleech
/// toggle, a sort dropdown...). We keep the whole thing so the admin UI can
/// render it and so `.Config.<name>` resolves to the configured-or-default
/// value.
#[derive(Debug, Clone, Deserialize)]
pub struct Setting {
    pub name: String,
    /// `text` | `password` | `checkbox` | `select` | `info` | `info_*`.
    #[serde(rename = "type", default)]
    pub kind: String,
    #[serde(default)]
    pub label: Option<String>,
    /// Default value; scalar (string / bool / number) normalized to a string.
    #[serde(default, deserialize_with = "de_opt_scalar_string")]
    pub default: Option<String>,
    /// For `select`: option value -> display label. The *key* is what
    /// `.Config.<name>` yields.
    #[serde(default)]
    pub options: IndexMap<String, String>,
}

// ----- login ----------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub struct Login {
    /// `form` | `post` | `get` | `cookie` | `oneurl` | `getpost`.
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub submitpath: Option<String>,
    /// CSS selector of the `<form>` to submit (method `form`): its action +
    /// hidden inputs are read from the page.
    #[serde(default)]
    pub form: Option<String>,
    /// Field name -> templated value.
    #[serde(default)]
    pub inputs: IndexMap<String, ScalarString>,
    /// Field name -> a value scraped from the login page before submitting
    /// (CSRF tokens etc).
    #[serde(default)]
    pub selectorinputs: IndexMap<String, Selector>,
    /// Cookie strings to set directly (method `cookie`).
    #[serde(default, deserialize_with = "de_string_or_seq")]
    pub cookies: Vec<String>,
    /// Error conditions to detect a failed login.
    #[serde(default)]
    pub error: Vec<LoginError>,
    #[serde(default)]
    pub test: Option<LoginTest>,
    #[serde(default)]
    pub captcha: Option<Captcha>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LoginError {
    #[serde(default)]
    pub selector: Option<String>,
    #[serde(default)]
    pub message: Option<Message>,
}

/// A message block: either a scraped selector or a templated literal.
#[derive(Debug, Clone, Deserialize)]
pub struct Message {
    #[serde(default)]
    pub selector: Option<String>,
    #[serde(default)]
    pub text: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LoginTest {
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub selector: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Captcha {
    #[serde(rename = "type", default)]
    pub kind: String,
    #[serde(default)]
    pub selector: Option<String>,
    #[serde(default)]
    pub input: Option<String>,
}

// ----- search ---------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub struct Search {
    /// One or more request paths (relative to the base link); templated. Each
    /// may declare its own response type / inputs.
    #[serde(default, deserialize_with = "de_search_paths")]
    pub paths: Vec<SearchPath>,
    /// Shared query parameters / form fields, templated, sent on every path.
    #[serde(default)]
    pub inputs: IndexMap<String, ScalarString>,
    #[serde(default)]
    pub headers: IndexMap<String, ScalarString>,
    /// Filters applied to the raw keyword string before it is templated in.
    #[serde(default)]
    pub keywordsfilters: Vec<Filter>,
    /// Filters applied to the whole response body before parsing.
    #[serde(default)]
    pub preprocessingfilters: Vec<Filter>,
    pub rows: Rows,
    /// Field name -> extraction rule. Order matters: a field's `text` template
    /// can reference an earlier field via `.Result.<name>`.
    #[serde(default)]
    pub fields: IndexMap<String, Field>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SearchPath {
    pub path: String,
    /// HTTP method (`get` default, `post`).
    #[serde(default)]
    pub method: Option<String>,
    /// Per-path response override.
    #[serde(default)]
    pub response: Option<ResponseSpec>,
    #[serde(default)]
    pub inputs: IndexMap<String, ScalarString>,
    #[serde(default)]
    pub followredirect: bool,
    /// Restrict this path to certain requested categories (by mapped name).
    #[serde(default, deserialize_with = "de_string_or_seq")]
    pub categories: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ResponseSpec {
    /// `html` (default) | `json` | `xml`.
    #[serde(rename = "type", default)]
    pub kind: String,
    /// For JSON: a jsonpath-ish base under which rows live (rarely used; rows
    /// usually carry their own selector).
    #[serde(default)]
    pub attribute: Option<String>,
    #[serde(default)]
    pub nocookies: bool,
}

/// How to locate the per-release rows in a response, and the paging hints.
#[derive(Debug, Clone, Deserialize)]
pub struct Rows {
    /// CSS/XPath selector (HTML) or a key/jsonpath (JSON) selecting each row.
    #[serde(default)]
    pub selector: Option<String>,
    /// Rows to merge upward into the previous one (multi-line row layouts).
    #[serde(default)]
    pub after: i64,
    /// A count/paging hint block.
    #[serde(default)]
    pub count: Option<CountBlock>,
    /// Date-carrying header rows interleaved between result rows.
    #[serde(default)]
    pub dateheaders: Option<Selector>,
    #[serde(default)]
    pub filters: Vec<Filter>,
    /// When true, an absent row attribute yields "no results" rather than error.
    #[serde(default, rename = "missingAttributeEqualsNoResults")]
    pub missing_attribute_equals_no_results: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CountBlock {
    #[serde(default)]
    pub selector: Option<String>,
}

/// One extracted field. The engine resolves, in order: a `text` template, or a
/// `selector` (+ `attribute`/`remove`/`case`), then runs `filters`, then falls
/// back to `default`. `optional` downgrades an extraction miss to empty.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct Field {
    #[serde(default)]
    pub selector: Option<String>,
    /// A templated literal (may reference `.Result.*`, `.Config.*`).
    #[serde(default)]
    pub text: Option<String>,
    /// Read this attribute instead of the element text.
    #[serde(default)]
    pub attribute: Option<String>,
    /// CSS selector of descendant nodes to strip before reading text.
    #[serde(default)]
    pub remove: Option<String>,
    /// switch: sub-selector -> literal value (first match wins; `*` = default).
    #[serde(default)]
    pub case: IndexMap<String, String>,
    #[serde(default)]
    pub filters: Vec<Filter>,
    #[serde(default)]
    pub optional: bool,
    #[serde(default, deserialize_with = "de_opt_scalar_string")]
    pub default: Option<String>,
}

/// A bare selector block (used by `selectorinputs`, `dateheaders`).
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

// ----- download -------------------------------------------------------------------

/// How to turn a details/download URL into an actual `.torrent` link, magnet,
/// or infohash. Definitions either give a direct link in the `download` field
/// or need a follow-up fetch of the details page with selectors.
#[derive(Debug, Clone, Deserialize)]
pub struct Download {
    /// Ordered candidate selectors (first non-empty wins).
    #[serde(default, deserialize_with = "de_download_selectors")]
    pub selectors: Vec<Selector>,
    /// Direct method: `get` (default) | `post`.
    #[serde(default)]
    pub method: Option<String>,
    /// Extract the infohash directly (magnet-only trackers).
    #[serde(default)]
    pub infohash: Option<InfoHash>,
    /// Templated inputs for a POST download.
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
    /// Some definitions inline the selector on the infohash block itself.
    #[serde(default)]
    pub selector: Option<String>,
    #[serde(default)]
    pub attribute: Option<String>,
}

/// A priming request performed before the download (e.g. hit a `/download.php`
/// that sets a token cookie).
#[derive(Debug, Clone, Deserialize)]
pub struct BeforeRequest {
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub inputs: IndexMap<String, ScalarString>,
}

// ----- filters --------------------------------------------------------------------

/// One field/keyword filter: a name plus 0..n string arguments. Args in YAML
/// are a scalar (`args: foo`), a list (`args: ["a", "b"]`), or absent.
#[derive(Debug, Clone, Deserialize)]
pub struct Filter {
    pub name: String,
    #[serde(default, deserialize_with = "de_filter_args")]
    pub args: Vec<String>,
}

// ----- flexible scalar ------------------------------------------------------------

/// A YAML scalar (string / bool / int / float) that we always want as a string
/// (definition values are consumed as text after templating).
#[derive(Debug, Clone, Default)]
pub struct ScalarString(pub String);

impl<'de> Deserialize<'de> for ScalarString {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        Ok(ScalarString(scalar_to_string(serde_yaml::Value::deserialize(d)?)))
    }
}

impl std::ops::Deref for ScalarString {
    type Target = str;
    fn deref(&self) -> &str {
        &self.0
    }
}

// ----- custom deserializers -------------------------------------------------------

fn scalar_to_string(v: serde_yaml::Value) -> String {
    match v {
        serde_yaml::Value::String(s) => s,
        serde_yaml::Value::Bool(b) => b.to_string(),
        serde_yaml::Value::Number(n) => n.to_string(),
        serde_yaml::Value::Null => String::new(),
        // Sequences / mappings never appear where a scalar is expected; stringify
        // defensively rather than fail the whole definition.
        other => serde_yaml::to_string(&other).unwrap_or_default().trim().to_string(),
    }
}

fn de_scalar_string<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    Ok(scalar_to_string(serde_yaml::Value::deserialize(d)?))
}

fn de_opt_scalar_string<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> Result<Option<String>, D::Error> {
    let v = serde_yaml::Value::deserialize(d)?;
    Ok(match v {
        serde_yaml::Value::Null => None,
        other => Some(scalar_to_string(other)),
    })
}

/// A field that may be a single string or a list of strings (`links`,
/// `cookies`, `categories`).
fn de_string_or_seq<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Vec<String>, D::Error> {
    let v = serde_yaml::Value::deserialize(d)?;
    Ok(match v {
        serde_yaml::Value::Null => Vec::new(),
        serde_yaml::Value::Sequence(seq) => seq.into_iter().map(scalar_to_string).collect(),
        other => vec![scalar_to_string(other)],
    })
}

/// Filter `args`: scalar, list, or absent -> `Vec<String>`.
fn de_filter_args<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Vec<String>, D::Error> {
    de_string_or_seq(d)
}

/// `search.paths` entries are usually maps (`{path, response, ...}`) but a few
/// legacy definitions list bare path strings.
fn de_search_paths<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Vec<SearchPath>, D::Error> {
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

/// `download.selectors` entries are selector maps, but a shorthand allows a bare
/// selector string.
fn de_download_selectors<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> Result<Vec<Selector>, D::Error> {
    use serde::de::Error;
    let seq = Vec::<serde_yaml::Value>::deserialize(d)?;
    seq.into_iter()
        .map(|v| match v {
            serde_yaml::Value::String(s) => {
                Ok(Selector { selector: Some(s), ..Selector::default() })
            }
            other => serde_yaml::from_value(other).map_err(D::Error::custom),
        })
        .collect()
}

/// Parse a definition from YAML bytes.
pub fn parse(bytes: &[u8]) -> anyhow::Result<Definition> {
    Ok(serde_yaml::from_slice(bytes)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The smallest definition serde will accept: everything else has a default.
    const MINIMAL: &str = "\
id: demo
name: Demo Tracker
caps: {}
search:
  rows: {}
";

    fn parse_ok(yaml: &str) -> Definition {
        parse(yaml.as_bytes()).expect("definition should parse")
    }

    #[test]
    fn a_minimal_definition_leans_entirely_on_defaults() {
        let d = parse_ok(MINIMAL);
        assert_eq!(d.id, "demo");
        assert_eq!(d.name, "Demo Tracker");
        // Cardigann's own default, not serde's: an absent `encoding` is UTF-8,
        // and getting that wrong garbles every title from a legacy tracker.
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
        // Real definitions carry changelog comments, descriptions and whole
        // blocks we never read. Failing on those would reject most of the corpus.
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
        // Definitions in the wild mix `id: 2010` and `id: "2010"` freely, and a
        // few use a non-numeric id. All three have to land as the same string.
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
        let ids: Vec<&str> = d.caps.categorymappings.iter().map(|c| c.id.as_str()).collect();
        assert_eq!(ids, ["2010", "2010", "tv-hd"]);
        assert_eq!(d.caps.categorymappings[0].desc, None);
        assert!(!d.caps.categorymappings[0].default);
        assert_eq!(d.caps.categorymappings[1].desc.as_deref(), Some("HD movies"));
        assert!(d.caps.categorymappings[1].default);
    }

    #[test]
    fn a_setting_default_normalizes_every_scalar_shape_to_a_string() {
        // `.Config.<name>` is templated into a URL as text, so a checkbox's
        // `false` and a select's `0` both have to arrive as strings.
        let d = parse_ok(
            "\
id: demo
name: Demo
caps: {}
settings:
  - {name: username, type: text, label: Username}
  - {name: freeleech, type: checkbox, default: false}
  - {name: pagesize, type: select, default: 50, options: {50: fifty, 100: hundred}}
  - {name: ratio, type: text, default: 1.5}
  - {name: note, type: info, default: null}
search:
  rows: {}
",
        );
        let by_name = |n: &str| d.settings.iter().find(|s| s.name == n).unwrap().clone();
        assert_eq!(by_name("username").default, None, "an absent default stays absent");
        assert_eq!(by_name("username").label.as_deref(), Some("Username"));
        assert_eq!(by_name("freeleech").default.as_deref(), Some("false"));
        assert_eq!(by_name("pagesize").default.as_deref(), Some("50"));
        assert_eq!(by_name("ratio").default.as_deref(), Some("1.5"));
        // An explicit null is the same as no default, not the string "null".
        assert_eq!(by_name("note").default, None);
        // The option *key* is what `.Config.pagesize` yields, so it must survive
        // as written even though YAML would happily read it as an int.
        let options = by_name("pagesize").options;
        assert_eq!(options.keys().collect::<Vec<_>>(), ["50", "100"]);
        assert_eq!(options["50"], "fifty");
    }

    #[test]
    fn cookies_accept_a_single_string_or_a_list() {
        let one = parse_ok(&format!("{MINIMAL}login:\n  method: cookie\n  cookies: uid=1; pass=2\n"));
        assert_eq!(one.login.unwrap().cookies, ["uid=1; pass=2"]);

        let many = parse_ok(&format!(
            "{MINIMAL}login:\n  method: cookie\n  cookies: [uid=1, pass=2]\n"
        ));
        assert_eq!(many.login.unwrap().cookies, ["uid=1", "pass=2"]);

        let none = parse_ok(&format!("{MINIMAL}login:\n  method: form\n"));
        assert!(none.login.unwrap().cookies.is_empty());
    }

    #[test]
    fn a_bare_path_string_is_shorthand_for_a_search_path() {
        // Legacy definitions list plain strings; modern ones list maps. A file
        // may mix both.
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
        // A single category is not a list in YAML, but is one here.
        assert_eq!(modern.categories, ["tv"]);
        assert_eq!(&*modern.inputs["sort"], "seeders");
        let response = modern.response.as_ref().unwrap();
        assert_eq!(response.kind, "json");
        assert_eq!(response.attribute.as_deref(), Some("results"));
        assert!(response.nocookies);
    }

    #[test]
    fn a_search_path_entry_that_is_neither_a_string_nor_a_path_map_is_rejected() {
        // The lenient branch must not swallow a genuinely broken definition:
        // silently dropping a path would produce an indexer that returns nothing.
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
        assert_eq!(shorthand.selector.as_deref(), Some("a[href^=\"/download\"]"));
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

        // Some definitions inline the selector on the infohash block; others
        // nest hash/title blocks. Both are readable.
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
    fn filter_args_accept_a_scalar_a_list_or_nothing() {
        let d = parse_ok(
            "\
id: demo
name: Demo
caps: {}
search:
  keywordsfilters:
    - {name: re_replace, args: [\"[^a-z]\", \" \"]}
    - {name: trim, args: \"-\"}
    - {name: diacritics}
    - {name: replace, args: 2020}
  rows: {}
",
        );
        let filters = &d.search.keywordsfilters;
        assert_eq!(filters[0].name, "re_replace");
        assert_eq!(filters[0].args, ["[^a-z]", " "]);
        assert_eq!(filters[1].args, ["-"], "a scalar arg becomes a one-element list");
        assert!(filters[2].args.is_empty(), "an absent args is not an error");
        assert_eq!(filters[3].args, ["2020"], "and a numeric arg is stringified");
    }

    #[test]
    fn field_order_is_preserved_because_later_fields_reference_earlier_ones() {
        // A field's `text` may template `.Result.<name>` of a field declared
        // above it, so an unordered map here would break extraction.
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
        assert_eq!(fields["download"].text.as_deref(), Some("{{ .Result.details }}&action=download"));

        let seeders = &fields["seeders"];
        assert_eq!(seeders.remove.as_deref(), Some("span.icon"));
        assert!(seeders.optional);
        assert_eq!(seeders.default.as_deref(), Some("0"), "a numeric default is a string");
        assert_eq!(seeders.filters[0].name, "replace");

        // The `*` case is the fallback and has to survive as a literal key.
        let category = &fields["category"];
        assert_eq!(category.case.keys().collect::<Vec<_>>(), ["i.movie", "i.tv", "*"]);
        assert_eq!(category.case["*"], "8000");
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
        assert_eq!(d.caps.modes["tv-search"], ["q", "season", "ep", "imdbid", "tvdbid"]);
        assert_eq!(d.caps.modes.keys().collect::<Vec<_>>(), ["search", "tv-search", "movie-search"]);
    }

    #[test]
    fn a_login_block_reads_every_shape_the_engine_supports() {
        let d = parse_ok(&format!(
            "{MINIMAL}\
login:
  method: form
  path: /login.php
  submitpath: /takelogin.php
  form: form#loginform
  inputs:
    username: '{{{{ .Config.username }}}}'
    keeplogged: 1
  selectorinputs:
    csrf:
      selector: input[name=csrf]
      attribute: value
  error:
    - selector: div.error
      message: {{selector: div.error}}
    - message: {{text: Login failed}}
  test:
    path: /index.php
    selector: a[href*=logout]
  captcha:
    type: image
    selector: img#captcha
    input: captchainput
"
        ));
        let login = d.login.unwrap();
        assert_eq!(login.method.as_deref(), Some("form"));
        assert_eq!(login.submitpath.as_deref(), Some("/takelogin.php"));
        assert_eq!(login.form.as_deref(), Some("form#loginform"));
        assert_eq!(&*login.inputs["username"], "{{ .Config.username }}");
        // A YAML `1` in an input is still text once templated into a form.
        assert_eq!(&*login.inputs["keeplogged"], "1");
        assert_eq!(login.selectorinputs["csrf"].attribute.as_deref(), Some("value"));
        assert_eq!(login.error.len(), 2);
        assert_eq!(login.error[0].selector.as_deref(), Some("div.error"));
        assert_eq!(login.error[1].selector, None);
        assert_eq!(login.error[1].message.as_ref().unwrap().text.as_deref(), Some("Login failed"));
        assert_eq!(login.test.unwrap().selector.as_deref(), Some("a[href*=logout]"));
        assert_eq!(login.captcha.unwrap().kind, "image");
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
        assert_eq!(rows.count.as_ref().unwrap().selector.as_deref(), Some("span.total"));
        assert_eq!(rows.dateheaders.as_ref().unwrap().attribute.as_deref(), Some("title"));
        // The YAML key is camelCase while the field is snake_case; a broken
        // rename would turn "no results" into a hard error on every empty search.
        assert!(rows.missing_attribute_equals_no_results);
        assert_eq!(rows.filters[0].name, "andmatch");
    }

    #[test]
    fn a_fractional_request_delay_is_kept() {
        // Politeness delays are written as `4.1` in the wild; truncating to an
        // int would breach a tracker's rate limit.
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
    fn a_non_scalar_where_a_scalar_belongs_is_stringified_rather_than_fatal() {
        // Deliberate leniency: one malformed input should not cost the whole
        // definition, since the value is only ever templated in as text.
        let d = parse_ok(&format!(
            "{MINIMAL}\
search2: ignored
"
        ));
        assert_eq!(d.id, "demo");

        let odd = parse_ok(
            "\
id: demo
name: Demo
caps: {}
search:
  inputs:
    q: [alpha, beta]
  rows: {}
",
        );
        let q = &*odd.search.inputs["q"];
        assert!(q.contains("alpha") && q.contains("beta"), "{q}");
    }

    #[test]
    fn scalar_string_reads_as_a_str_and_defaults_to_empty() {
        let s = ScalarString("value".into());
        assert_eq!(&*s, "value");
        assert!(s.starts_with("val"), "Deref gives the whole &str API");
        assert_eq!(&*ScalarString::default(), "");
    }

    #[test]
    fn a_definition_missing_a_required_block_is_an_error() {
        // `caps` and `search` are what the engine drives; a file without them
        // is not a definition, and loading it half-formed would fail later and
        // further from the cause.
        for (missing, yaml) in [
            ("caps", "id: demo\nname: Demo\nsearch:\n  rows: {}\n"),
            ("search", "id: demo\nname: Demo\ncaps: {}\n"),
            // `rows` is what the engine iterates; a search block without it
            // parses as "no results" forever rather than as a broken file.
            ("rows", "id: demo\nname: Demo\ncaps: {}\nsearch: {}\n"),
        ] {
            let err = parse(yaml.as_bytes()).unwrap_err().to_string();
            assert!(err.contains(missing), "expected {missing} to be required: {err}");
        }
    }

    #[test]
    fn bytes_that_are_not_yaml_at_all_are_an_error() {
        assert!(parse(b"\t- : :\n").is_err());
        assert!(parse(b"").is_err(), "an empty file is not a definition");
    }
}

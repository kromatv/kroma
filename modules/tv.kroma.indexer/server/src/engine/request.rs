use crate::category;
use crate::context::Context;
use crate::definition::Definition;
use crate::template;
use crate::{filters, IndexerConfig, Query};

use super::query_attributes::query_attributes;
use super::query_attributes::sends_episode_inputs;

/// One prepared search request against the tracker.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchRequest {
    pub url: String,
    // `GET` (default) or `POST`.
    pub method: String,
    // Query params (GET) or form fields (POST), already rendered.
    pub inputs: Vec<(String, String)>,
    // `html` (default) | `json` | `xml`.
    pub response_kind: String,
}

/// Build the ordered list of requests to run for `query`, restricted to the
/// wanted Newznab categories.
pub fn build_requests(
    def: &Definition,
    cfg: &IndexerConfig,
    query: &Query,
    wanted_cats: &[u32],
) -> Vec<SearchRequest> {
    let mut ctx = Context::with_config(def, cfg);
    ctx.query = query_attributes(query);
    let base_keywords = if sends_episode_inputs(def) {
        query.title()
    } else {
        query.keywords()
    };
    ctx.keywords = base_keywords.clone();
    ctx.keywords = filters::apply(&base_keywords, &def.search.keywordsfilters, &ctx);
    ctx.query
        .insert("Keywords".to_string(), ctx.keywords.clone());
    ctx.categories = category::tracker_ids_for(def, wanted_cats);

    // The base link can itself be a template (`{{ .Config.apiurl }}` on
    // API/private trackers whose site URL is a user setting); render it and
    // expose the resolved value as `.Config.sitelink`.
    let base = template::render(&cfg.base_url, &ctx);
    ctx.config.insert(
        "sitelink".to_string(),
        crate::context::Value::Str(base.clone()),
    );

    let mut requests = Vec::new();
    for path in &def.search.paths {
        let rendered = template::render(&path.path, &ctx);
        let url = join_url(&base, &rendered);
        let mut inputs: Vec<(String, String)> = Vec::new();
        for (k, v) in def.search.inputs.iter().chain(path.inputs.iter()) {
            inputs.push((k.clone(), template::render(v, &ctx)));
        }
        let response_kind = path
            .response
            .as_ref()
            .map(|r| r.kind.clone())
            .filter(|k| !k.is_empty())
            .unwrap_or_else(|| "html".to_string());
        requests.push(SearchRequest {
            url,
            method: path
                .method
                .clone()
                .unwrap_or_else(|| "get".to_string())
                .to_lowercase(),
            inputs,
            response_kind,
        });
    }
    requests
}

/// Join a base URL with a rendered path, percent-encoding URL-illegal
/// characters a definition template can emit (space, `"`, `<`, `>`, backtick,
/// `{}`, `|`, `\`, `^`, controls) while leaving structural characters and
/// existing `%`-escapes untouched, so self-escaping definitions are not
/// double-encoded. Absolute URLs are sanitized too; `magnet:` URIs pass through.
pub fn join_url(base: &str, path: &str) -> String {
    let p = path.trim();
    if p.starts_with("magnet:") {
        return p.to_string();
    }
    if p.starts_with("http://") || p.starts_with("https://") {
        return sanitize_url_path(p);
    }
    let base = base.trim_end_matches('/');
    let p = sanitize_url_path(p.trim_start_matches('/'));
    format!("{base}/{p}")
}

fn sanitize_url_path(p: &str) -> String {
    let mut out = String::with_capacity(p.len());
    for c in p.chars() {
        match c {
            ' ' | '"' | '<' | '>' | '`' | '{' | '}' | '|' | '\\' | '^' => {
                out.push_str(&format!("%{:02X}", c as u32));
            }
            c if (c as u32) < 0x20 || (c as u32) == 0x7F => {
                out.push_str(&format!("%{:02X}", c as u32));
            }
            _ => out.push(c),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{build_def, cfg};
    use super::*;

    #[test]
    fn url_joining() {
        assert_eq!(
            join_url("https://x.to/", "/browse?q=a"),
            "https://x.to/browse?q=a"
        );
        assert_eq!(join_url("https://x.to", "dl/1"), "https://x.to/dl/1");
        assert_eq!(join_url("https://x.to/", "https://cdn/z"), "https://cdn/z");
        assert_eq!(join_url("https://x.to/", "magnet:?xt=1"), "magnet:?xt=1");
    }

    #[test]
    fn url_joining_encodes_spaces_in_path_segments_and_query() {
        assert_eq!(
            join_url("https://x.to", "/sort-search/The Matrix 1999/time"),
            "https://x.to/sort-search/The%20Matrix%201999/time"
        );
        assert_eq!(
            join_url("https://x.to", "/search?q=The Matrix 1999"),
            "https://x.to/search?q=The%20Matrix%201999"
        );
    }

    #[test]
    fn url_joining_encodes_spaces_in_absolute_urls() {
        // Pirate Bay: template produces `q.php?q=toy story 5&cat=200,201`
        assert_eq!(
            join_url(
                "https://x.to",
                "https://api.example/q.php?q=toy story 5&cat=200,201"
            ),
            "https://api.example/q.php?q=toy%20story%205&cat=200,201"
        );
    }

    #[test]
    fn url_joining_leaves_existing_percent_escapes_and_structure_untouched() {
        assert_eq!(
            join_url("https://x.to", "/search?q=The%20Matrix"),
            "https://x.to/search?q=The%20Matrix"
        );
        assert_eq!(
            join_url("https://x.to", "/s?a=1&b=2#frag"),
            "https://x.to/s?a=1&b=2#frag"
        );
        assert_eq!(
            join_url("https://x.to", "/p/100%25-off"),
            "https://x.to/p/100%25-off"
        );
    }

    #[test]
    fn url_joining_encodes_other_illegal_characters() {
        assert_eq!(
            join_url("https://x.to", "/q?a\"b<c>d`e{f}|g\\h^i"),
            "https://x.to/q?a%22b%3Cc%3Ed%60e%7Bf%7D%7Cg%5Ch%5Ei"
        );
    }

    #[test]
    fn build_requests_get_movie_with_imdb_and_categories() {
        let def = build_def(
            r#"
id: t
name: T
caps:
  categorymappings:
    - {id: "42", cat: "Movies/HD"}
  modes:
    search: [q]
    movie-search: [q, imdbid, tmdbid]
search:
  paths:
    - path: "/search?q={{ .Keywords }}"
      inputs:
        cat: "{{ join .Categories \",\" }}"
  inputs:
    imdb: "{{ .Query.IMDBID }}"
  rows:
    selector: "tr"
"#,
        );
        let cfg = cfg("https://site.to/");
        let q = Query::Movie {
            tmdb_id: None,
            imdb_id: Some("tt0133093".into()),
            title: "The Matrix".into(),
            year: Some(1999),
        };
        let reqs = build_requests(&def, &cfg, &q, &[2000]);
        assert_eq!(reqs.len(), 1);
        assert_eq!(reqs[0].url, "https://site.to/search?q=The%20Matrix%201999");
        assert_eq!(reqs[0].method, "get");
        assert_eq!(reqs[0].response_kind, "html");
        // query_attributes rendered `.Query.IMDBID`; categories mapped to id 42.
        assert!(reqs[0]
            .inputs
            .contains(&("imdb".to_string(), "tt0133093".to_string())));
        assert!(reqs[0]
            .inputs
            .contains(&("cat".to_string(), "42".to_string())));
    }

    // A definition that echoes the whole `.Query.*` namespace back as inputs, so
    // a test can read exactly which variables were set.
    #[test]
    fn build_requests_post_json_path() {
        let def = build_def(
            r#"
id: t
name: T
caps: {}
search:
  paths:
    - path: /api
      method: POST
      response:
        type: json
  rows:
    selector: "$.rows"
"#,
        );
        let reqs = build_requests(
            &def,
            &cfg("https://api.x/"),
            &Query::Text { query: "hi".into() },
            &[],
        );
        assert_eq!(reqs.len(), 1);
        assert_eq!(reqs[0].url, "https://api.x/api");
        assert_eq!(reqs[0].method, "post");
        assert_eq!(reqs[0].response_kind, "json");
    }

    #[test]
    fn build_requests_encodes_keywords_in_a_path_segment() {
        let def = build_def(
            r#"
id: t
name: T
caps: {}
search:
  paths:
    - path: "/sort-search/{{ .Keywords }}/time/desc/1/"
  rows:
    selector: "tr"
"#,
        );
        let q = Query::Movie {
            tmdb_id: None,
            imdb_id: None,
            title: "The Matrix".into(),
            year: Some(1999),
        };
        let reqs = build_requests(&def, &cfg("https://1337x.to"), &q, &[]);
        assert_eq!(reqs.len(), 1);
        assert_eq!(
            reqs[0].url,
            "https://1337x.to/sort-search/The%20Matrix%201999/time/desc/1/"
        );
    }

    #[test]
    fn build_requests_post_inputs_keep_raw_values() {
        let def = build_def(
            r#"
id: t
name: T
caps: {}
search:
  paths:
    - path: /api
      method: POST
      inputs:
        q: "{{ .Keywords }}"
  rows:
    selector: "$.rows"
"#,
        );
        let q = Query::Text {
            query: "The Matrix".into(),
        };
        let reqs = build_requests(&def, &cfg("https://api.x/"), &q, &[]);
        assert_eq!(reqs[0].url, "https://api.x/api");
        assert!(reqs[0]
            .inputs
            .contains(&("q".to_string(), "The Matrix".to_string())));
    }
}

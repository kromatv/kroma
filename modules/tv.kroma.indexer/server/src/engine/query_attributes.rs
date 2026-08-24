use std::collections::HashMap;

use crate::definition::Definition;
use crate::Query;

// Whether the definition passes the season/episode as their OWN inputs. When it
// does, the keywords must be the bare title: `q=Black Mirror S02E01&season=2&ep=1`
// asks the tracker for a title literally containing "S02E01" and matches nothing.
// A definition without those inputs has only `q` to say it with, so the tag stays.
pub(super) fn sends_episode_inputs(def: &Definition) -> bool {
    def.search
        .inputs
        .iter()
        .chain(def.search.paths.iter().flat_map(|p| p.inputs.iter()))
        .any(|(key, _)| key == "season" || key == "ep" || key == "episode")
}

// `Type` is the torznab FUNCTION NAME, not a human word for the query: every
// definition that reads it feeds it straight to a `t=` parameter
// (`t: "{{ .Query.Type }}"`), so the vocabulary is torznab's own - `search`,
// `tvsearch`, `movie`, `music`, `book`.
pub(super) fn query_attributes(query: &Query) -> HashMap<String, String> {
    let mut m = HashMap::new();
    let mut set = |k: &str, v: String| {
        if !v.is_empty() {
            m.insert(k.to_string(), v);
        }
    };
    match query {
        Query::Movie {
            tmdb_id,
            imdb_id,
            title: _,
            year,
        } => {
            set("Type", "movie".into());
            if let Some(id) = tmdb_id {
                set("TMDBID", id.to_string());
            }
            if let Some(imdb) = imdb_id {
                let bare = imdb.trim_start_matches("tt");
                set("IMDBID", format!("tt{bare}"));
                set("IMDBIDShort", bare.to_string());
            }
            if let Some(y) = year {
                set("Year", y.to_string());
            }
        }
        Query::Episode {
            tmdb_id,
            season,
            episode,
            ..
        } => {
            set("Type", "tvsearch".into());
            if let Some(id) = tmdb_id {
                set("TMDBID", id.to_string());
            }
            set("Season", season.to_string());
            set("Ep", episode.to_string());
            set("Episode", episode.to_string());
        }
        Query::Season {
            tmdb_id, season, ..
        } => {
            set("Type", "tvsearch".into());
            if let Some(id) = tmdb_id {
                set("TMDBID", id.to_string());
            }
            set("Season", season.to_string());
        }
        Query::Text { .. } => {
            set("Type", "search".into());
        }
    }
    m
}

#[cfg(test)]
mod tests {
    use super::super::build_requests;
    use super::super::test_support::{build_def, cfg};
    use super::*;

    fn echoing_def() -> Definition {
        build_def(
            r#"
id: t
name: T
caps:
  modes:
    search: [q]
    tv-search: [q, season, ep, tmdbid]
search:
  paths:
    - path: "/s"
  inputs:
    type: "{{ .Query.Type }}"
    tmdb: "{{ .Query.TMDBID }}"
    season: "{{ .Query.Season }}"
    ep: "{{ .Query.Ep }}"
    episode: "{{ .Query.Episode }}"
    imdb: "{{ .Query.IMDBID }}"
    imdbshort: "{{ .Query.IMDBIDShort }}"
    year: "{{ .Query.Year }}"
  rows:
    selector: "tr"
"#,
        )
    }

    fn echoed(query: &Query) -> std::collections::HashMap<String, String> {
        let reqs = build_requests(&echoing_def(), &cfg("https://site.to/"), query, &[]);
        reqs[0].inputs.iter().cloned().collect()
    }

    #[test]
    fn an_episode_query_sets_both_spellings_of_the_episode_variable() {
        // Cardigann definitions in the wild use `.Query.Ep` and `.Query.Episode`
        // interchangeably; a definition that reads the one we did not set builds
        // a URL with an empty episode and searches the whole season.
        let vars = echoed(&Query::Episode {
            tmdb_id: Some(1396),
            title: "Breaking Bad".into(),
            season: 2,
            episode: 7,
        });
        assert_eq!(vars.get("type").map(String::as_str), Some("tvsearch"));
        assert_eq!(vars.get("tmdb").map(String::as_str), Some("1396"));
        assert_eq!(vars.get("season").map(String::as_str), Some("2"));
        assert_eq!(vars.get("ep").map(String::as_str), Some("7"));
        assert_eq!(vars.get("episode").map(String::as_str), Some("7"));
    }

    #[test]
    fn a_season_query_sets_no_episode_at_all() {
        // A season pack is not episode 0. Setting an episode here would turn a
        // whole-season search into a search for one file that may not exist.
        let vars = echoed(&Query::Season {
            tmdb_id: Some(1396),
            title: "Breaking Bad".into(),
            season: 2,
        });
        assert_eq!(vars.get("type").map(String::as_str), Some("tvsearch"));
        assert_eq!(vars.get("season").map(String::as_str), Some("2"));
        // `set` skips empties, so the variables are absent rather than "".
        assert_eq!(vars.get("ep").map(String::as_str), Some(""));
        assert_eq!(vars.get("episode").map(String::as_str), Some(""));
    }

    #[test]
    fn a_movie_query_carries_both_imdb_spellings_and_the_year() {
        // Trackers differ on whether they want the `tt` prefix, so both are
        // offered and the definition picks.
        let vars = echoed(&Query::Movie {
            tmdb_id: Some(603),
            imdb_id: Some("0133093".into()),
            title: "The Matrix".into(),
            year: Some(1999),
        });
        assert_eq!(vars.get("type").map(String::as_str), Some("movie"));
        assert_eq!(
            vars.get("imdb").map(String::as_str),
            Some("tt0133093"),
            "prefixed"
        );
        assert_eq!(
            vars.get("imdbshort").map(String::as_str),
            Some("0133093"),
            "bare"
        );
        assert_eq!(vars.get("year").map(String::as_str), Some("1999"));
        // A tv-only variable is not invented for a movie.
        assert_eq!(vars.get("season").map(String::as_str), Some(""));
    }

    #[test]
    fn an_imdb_id_that_already_has_its_prefix_is_not_doubled() {
        // Callers pass both spellings; `tttt0133093` matches nothing.
        let vars = echoed(&Query::Movie {
            tmdb_id: None,
            imdb_id: Some("tt0133093".into()),
            title: "The Matrix".into(),
            year: None,
        });
        assert_eq!(vars.get("imdb").map(String::as_str), Some("tt0133093"));
        assert_eq!(vars.get("imdbshort").map(String::as_str), Some("0133093"));
    }

    #[test]
    fn a_free_text_query_is_typed_as_a_plain_search() {
        // `Type` picks the tracker's search MODE, so a text query must not
        // present itself as a movie or tv lookup with no ids attached.
        let vars = echoed(&Query::Text {
            query: "some release".into(),
        });
        assert_eq!(vars.get("type").map(String::as_str), Some("search"));
        assert_eq!(vars.get("tmdb").map(String::as_str), Some(""));
    }

    #[test]
    fn every_query_type_is_a_torznab_function_name() {
        // Ten shipped definitions splice `.Query.Type` straight into `t=`, so the
        // only legal values are the ones the torznab API defines. A word that
        // reads right to a human ("tv") is answered with "unsupported function"
        // and the search returns nothing, silently.
        const TORZNAB_FUNCTIONS: [&str; 5] = ["search", "tvsearch", "movie", "music", "book"];
        let queries = [
            Query::Text { query: "q".into() },
            Query::Movie {
                tmdb_id: None,
                imdb_id: None,
                title: "M".into(),
                year: None,
            },
            Query::Season {
                tmdb_id: None,
                title: "S".into(),
                season: 1,
            },
            Query::Episode {
                tmdb_id: None,
                title: "E".into(),
                season: 1,
                episode: 2,
            },
        ];
        for query in &queries {
            let t = echoed(query).get("type").cloned().unwrap_or_default();
            assert!(
                TORZNAB_FUNCTIONS.contains(&t.as_str()),
                "t={t:?} is not a torznab function"
            );
        }
    }
}

#[cfg(test)]
mod keyword_tests {
    use super::super::build_requests;
    use super::*;
    use crate::IndexerConfig;

    fn def_with_inputs(inputs: &str) -> Definition {
        crate::definition::parse(
            format!(
                r#"
id: t
name: T
caps:
  categorymappings:
    - {{id: 5000, cat: TV}}
  modes:
    tv-search: [q, season, ep]
search:
  paths:
    - path: /api
  inputs:
{inputs}
  rows:
    selector: item
  fields:
    title:
      selector: title
"#
            )
            .as_bytes(),
        )
        .expect("definition fixture must parse")
    }

    fn episode() -> Query {
        Query::Episode {
            tmdb_id: None,
            title: "Black Mirror".into(),
            season: 2,
            episode: 1,
        }
    }

    #[test]
    fn a_definition_with_season_and_ep_inputs_searches_the_bare_title() {
        let def = def_with_inputs(
            "    q: \"{{ .Keywords }}\"\n    season: \"{{ .Query.Season }}\"\n    ep: \"{{ .Query.Ep }}\"",
        );
        assert!(sends_episode_inputs(&def));
        let reqs = build_requests(&def, &IndexerConfig::default(), &episode(), &[5000]);
        let q = reqs
            .first()
            .and_then(|r| r.inputs.iter().find(|(k, _)| k == "q"))
            .map(|(_, v)| v.clone());
        assert_eq!(q.as_deref(), Some("Black Mirror"));
    }

    #[test]
    fn a_definition_with_only_q_keeps_the_episode_tag_in_it() {
        let def = def_with_inputs("    q: \"{{ .Keywords }}\"");
        assert!(!sends_episode_inputs(&def));
        let reqs = build_requests(&def, &IndexerConfig::default(), &episode(), &[5000]);
        let q = reqs
            .first()
            .and_then(|r| r.inputs.iter().find(|(k, _)| k == "q"))
            .map(|(_, v)| v.clone());
        assert_eq!(q.as_deref(), Some("Black Mirror S02E01"));
    }
}

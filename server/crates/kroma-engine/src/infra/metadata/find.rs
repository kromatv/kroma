//! The TMDB id of a title another catalogue knows by its own id, through
//! TMDB's `find`.

use serde::Deserialize;

use super::client::{Target, api, tmdb_json};

/// A catalogue TMDB can be asked by.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Catalogue {
    Imdb,
    Tvdb,
}

impl Catalogue {
    fn external_source(self) -> &'static str {
        match self {
            Self::Imdb => "imdb_id",
            Self::Tvdb => "tvdb_id",
        }
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Found {
    movie_results: Vec<Hit>,
    tv_results: Vec<Hit>,
}

#[derive(Debug, Deserialize)]
struct Hit {
    id: u64,
}

/// The id TMDB gives the film or the show `catalogue` knows as `id`.
/// `Ok(None)` when TMDB knows none by that id, and for an id no catalogue
/// writes, which is never sent. `Err(())` is a request that failed, which says
/// nothing about the title.
pub(crate) fn find_id(
    api_key: &str,
    target: Target,
    catalogue: Catalogue,
    id: &str,
) -> Result<Option<u64>, ()> {
    if id.is_empty() || !id.bytes().all(|byte| byte.is_ascii_alphanumeric()) {
        return Ok(None);
    }
    let found: Found = tmdb_json(
        "metadata.find",
        &format!("{}/find/{id}", api()),
        api_key,
        &[("external_source", catalogue.external_source().to_string())],
    )?;
    let hits = match target {
        Target::Movie => found.movie_results,
        Target::Tv => found.tv_results,
    };
    Ok(hits.first().map(|hit| hit.id))
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::*;
    use crate::test_support::FakeTmdb;

    const KEY: &str = "key";

    fn a_film_and_a_show_by_one_id(path: &str) -> (u16, Value) {
        match path {
            "/find/tt0113277" => (
                200,
                json!({ "movie_results": [{ "id": 949 }], "tv_results": [{ "id": 1438 }] }),
            ),
            "/find/79126" => (200, json!({ "movie_results": [], "tv_results": [] })),
            _ => (503, json!({})),
        }
    }

    #[test]
    fn a_film_and_a_show_are_each_found_among_their_own_kind() {
        let _tmdb = FakeTmdb::start(a_film_and_a_show_by_one_id);

        let film = find_id(KEY, Target::Movie, Catalogue::Imdb, "tt0113277");
        let show = find_id(KEY, Target::Tv, Catalogue::Imdb, "tt0113277");

        assert_eq!((film, show), (Ok(Some(949)), Ok(Some(1438))));
    }

    #[test]
    fn tmdb_is_told_which_catalogue_the_id_is_of() {
        let tmdb = FakeTmdb::start(a_film_and_a_show_by_one_id);

        let found = find_id(KEY, Target::Tv, Catalogue::Tvdb, "79126");

        let asked = tmdb.requests();
        assert_eq!(found, Ok(None));
        assert!(asked[0].starts_with("/find/79126?"), "{asked:?}");
        assert!(asked[0].contains("external_source=tvdb_id"), "{asked:?}");
    }

    #[test]
    fn a_request_that_fails_is_not_an_answer() {
        let _tmdb = FakeTmdb::start(a_film_and_a_show_by_one_id);

        let found = find_id(KEY, Target::Movie, Catalogue::Imdb, "tt0000002");

        assert_eq!(found, Err(()));
    }

    #[test]
    fn an_id_no_catalogue_writes_is_never_sent() {
        let tmdb = FakeTmdb::start(a_film_and_a_show_by_one_id);

        let climbing = find_id(KEY, Target::Movie, Catalogue::Imdb, "../movie/949");
        let empty = find_id(KEY, Target::Movie, Catalogue::Imdb, "");

        assert_eq!((climbing, empty), (Ok(None), Ok(None)));
        assert_eq!(tmdb.requests(), Vec::<String>::new());
    }
}

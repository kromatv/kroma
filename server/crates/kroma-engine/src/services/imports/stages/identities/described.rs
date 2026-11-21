//! What an identity takes from the other server's description of a title:
//! whose ids they are and each id as its catalogue writes it. The description
//! is the importer's word, so each is bounded here.

use crate::db::imports::{Elsewhere, HeldIds, Subject};
use crate::model::import::{ExternalIds, Title, TitleKind};

const MAX_ID_DIGITS: usize = 12;
const MAX_PATH_BYTES: usize = 4096;
const IMDB_PREFIX: &str = "tt";

fn digits(written: &str) -> Option<&str> {
    let plausible = (1..=MAX_ID_DIGITS).contains(&written.len())
        && written.bytes().all(|byte| byte.is_ascii_digit());
    plausible.then_some(written)
}

fn number(written: Option<&str>) -> Option<u64> {
    let id: u64 = digits(written?.trim())?.parse().ok()?;
    (id > 0).then_some(id)
}

fn imdb(written: Option<&str>) -> Option<String> {
    let written = written?.trim();
    let prefix = written.get(..IMDB_PREFIX.len())?;
    let numbered = digits(&written[IMDB_PREFIX.len()..])?;
    prefix
        .eq_ignore_ascii_case(IMDB_PREFIX)
        .then(|| format!("{IMDB_PREFIX}{numbered}"))
}

fn held(ids: &ExternalIds) -> Option<HeldIds> {
    let held = HeldIds {
        tmdb: number(ids.tmdb.as_deref()),
        elsewhere: Elsewhere {
            imdb: imdb(ids.imdb.as_deref()),
            tvdb: number(ids.tvdb.as_deref()),
        },
    };
    (held != HeldIds::default()).then_some(held)
}

pub(super) fn known_as(title: &Title) -> Option<(Subject, HeldIds)> {
    match title.kind {
        TitleKind::Movie => Some((Subject::Movie, held(&title.ids)?)),
        TitleKind::Episode => Some((Subject::Show, held(&title.series.as_ref()?.ids)?)),
        TitleKind::Series | TitleKind::Other => None,
    }
}

pub(super) fn storable(path: String) -> Option<String> {
    (path.len() <= MAX_PATH_BYTES).then_some(path)
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::*;

    fn title(described: Value) -> Title {
        serde_json::from_value(described).unwrap()
    }

    fn film(ids: Value) -> Title {
        title(json!({ "id": "t1", "kind": "movie", "ids": ids }))
    }

    fn ids_of(title: &Title) -> Option<HeldIds> {
        known_as(title).map(|(_, ids)| ids)
    }

    #[test]
    fn a_film_is_known_by_its_own_ids_each_as_its_catalogue_writes_it() {
        let heat = film(json!({ "tmdb": " 949 ", "imdb": "TT0113277", "tvdb": "0457" }));

        let known = known_as(&heat);

        let ids = HeldIds {
            tmdb: Some(949),
            elsewhere: Elsewhere {
                imdb: Some("tt0113277".into()),
                tvdb: Some(457),
            },
        };
        assert_eq!(known, Some((Subject::Movie, ids)));
    }

    #[test]
    fn an_episode_is_known_by_the_ids_of_its_show_and_not_by_its_own() {
        let the_buys = title(json!({
            "id": "t2",
            "kind": "episode",
            "ids": { "tvdb": "127396" },
            "series": { "ids": { "tmdb": "1438" } },
        }));

        let known = known_as(&the_buys);

        let ids = HeldIds {
            tmdb: Some(1438),
            ..Default::default()
        };
        assert_eq!(known, Some((Subject::Show, ids)));
    }

    #[test]
    fn an_episode_whose_show_has_no_id_is_known_by_nothing() {
        let no_series = title(json!({ "id": "t2", "kind": "episode", "ids": { "tmdb": "5" } }));
        let no_ids = title(json!({ "id": "t3", "kind": "episode", "series": { "title": "X" } }));

        let known = (known_as(&no_series), known_as(&no_ids));

        assert_eq!(known, (None, None));
    }

    #[test]
    fn a_title_that_is_neither_a_film_nor_an_episode_is_known_by_nothing() {
        let track = title(json!({ "id": "x1", "kind": "track", "ids": { "tmdb": "5" } }));

        let known = known_as(&track);

        assert_eq!(known, None);
    }

    #[test]
    fn an_id_no_catalogue_writes_that_way_is_dropped_and_the_others_stay() {
        let long = "9".repeat(MAX_ID_DIGITS + 1);
        let odd = film(json!({ "tmdb": "0", "imdb": "nm0000134", "tvdb": "457" }));
        let too_long = film(json!({ "tmdb": long, "imdb": format!("tt{long}"), "tvdb": "-4" }));
        let not_ascii = film(json!({ "tmdb": "９４９", "imdb": "ｔt0113277" }));

        let known = (ids_of(&odd), ids_of(&too_long), ids_of(&not_ascii));

        let by_tvdb = HeldIds {
            elsewhere: Elsewhere {
                imdb: None,
                tvdb: Some(457),
            },
            ..Default::default()
        };
        assert_eq!(known, (Some(by_tvdb), None, None));
    }

    #[test]
    fn a_path_longer_than_a_path_can_be_is_not_stored() {
        let fits = "/".repeat(MAX_PATH_BYTES);
        let too_long = "/".repeat(MAX_PATH_BYTES + 1);

        let stored = (storable(fits.clone()), storable(too_long));

        assert_eq!(stored, (Some(fits), None));
    }
}

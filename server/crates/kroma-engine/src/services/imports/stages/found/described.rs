//! A title found by what the other server says it is, for one whose file is
//! nothing here: by the ids other catalogues give it, then by its name. The
//! description is the importer's word, so each part is bounded here.
//!
//! A name is compared with all its letters, whatever their script. A title
//! here that carries another id of a catalogue than the other server gives is
//! another title, and its name matches nothing.

use std::collections::hash_map::Entry;
use std::collections::HashMap;

use anyhow::Result;

use crate::db;
use crate::db::imports::{CatalogueIds, EpisodeOf, Named};
use crate::domain::matching::normalize_all_scripts;
use crate::model::import::{ExternalIds, Series, Title, TitleKind};

const MAX_ID_BYTES: usize = 32;
const MAX_NAME_CHARS: usize = 300;

fn number(id: Option<&str>) -> Option<i64> {
    id?.trim().parse::<i64>().ok().filter(|id| *id > 0)
}

fn catalogue_ids(ids: &ExternalIds) -> CatalogueIds<'_> {
    let imdb = ids.imdb.as_deref().map(str::trim);
    CatalogueIds {
        tmdb: number(ids.tmdb.as_deref()),
        imdb: imdb.filter(|id| !id.is_empty() && id.len() <= MAX_ID_BYTES),
        tvdb: number(ids.tvdb.as_deref()),
    }
}

fn name(text: Option<&str>) -> Option<String> {
    let text = text?;
    if text.chars().count() > MAX_NAME_CHARS {
        return None;
    }
    Some(normalize_all_scripts(text)).filter(|name| !name.is_empty())
}

fn same_year(there: Option<u32>, here: Option<u32>) -> bool {
    there.is_none() || here.is_none() || there == here
}

fn differ<T: PartialEq>(there: Option<T>, here: Option<T>) -> bool {
    matches!((there, here), (Some(there), Some(here)) if there != here)
}

fn another_title(there: &CatalogueIds<'_>, here: &Named) -> bool {
    let here = here.ids();
    differ(there.tmdb, here.tmdb) || differ(there.imdb, here.imdb) || differ(there.tvdb, here.tvdb)
}

fn called(here: &Named, name: &str, there: &CatalogueIds<'_>) -> bool {
    normalize_all_scripts(&here.title) == name && !another_title(there, here)
}

/// The names of this server's films and shows, read once for a page of
/// titles.
pub(super) struct Described<'a> {
    pool: &'a db::Pool,
    films: HashMap<u32, Vec<Named>>,
    shows: Option<Vec<Named>>,
}

impl<'a> Described<'a> {
    pub(super) fn on(pool: &'a db::Pool) -> Self {
        Self {
            pool,
            films: HashMap::new(),
            shows: None,
        }
    }

    pub(super) fn find(&mut self, title: &Title) -> Result<Option<String>> {
        match title.kind {
            TitleKind::Movie => self.film(title),
            TitleKind::Episode => self.episode(title),
            TitleKind::Series => self.series(title),
            TitleKind::Other => Ok(None),
        }
    }

    fn film(&mut self, title: &Title) -> Result<Option<String>> {
        let ids = catalogue_ids(&title.ids);
        if let Some(film) = db::imports::film_by_ids(self.pool, &ids)? {
            return Ok(Some(film));
        }
        let (Some(named), Some(year)) = (name(title.title.as_deref()), title.year) else {
            return Ok(None);
        };
        let films = match self.films.entry(year) {
            Entry::Occupied(read) => read.into_mut(),
            Entry::Vacant(unread) => unread.insert(db::imports::films_of_year(self.pool, year)?),
        };
        let film = films.iter().find(|film| called(film, &named, &ids));
        Ok(film.map(|film| film.id.clone()))
    }

    fn episode(&mut self, title: &Title) -> Result<Option<String>> {
        let (Some(series), Some(season), Some(episode)) =
            (&title.series, title.season, title.episode)
        else {
            return Ok(None);
        };
        for show in self.shows_that_are(series)? {
            let numbered = EpisodeOf {
                show: &show,
                season,
                episode,
            };
            if let Some(item) = db::imports::episode_item(self.pool, &numbered)? {
                return Ok(Some(item));
            }
        }
        Ok(None)
    }

    fn series(&mut self, title: &Title) -> Result<Option<String>> {
        let series = Series {
            title: title.title.clone(),
            year: title.year,
            ids: title.ids.clone(),
        };
        Ok(self.shows_that_are(&series)?.into_iter().next())
    }

    fn shows_that_are(&mut self, series: &Series) -> Result<Vec<String>> {
        let ids = catalogue_ids(&series.ids);
        if let Some(show) = db::imports::show_by_ids(self.pool, &ids)? {
            return Ok(vec![show]);
        }
        let Some(named) = name(series.title.as_deref()) else {
            return Ok(Vec::new());
        };
        let shows = match &mut self.shows {
            Some(read) => read,
            unread => unread.insert(db::imports::shows_by_name(self.pool)?),
        };
        Ok(shows
            .iter()
            .filter(|show| same_year(series.year, show.year) && called(show, &named, &ids))
            .map(|show| show.id.clone())
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn ids(said: serde_json::Value) -> ExternalIds {
        serde_json::from_value(said).unwrap()
    }

    fn here(tmdb: Option<i64>, imdb: Option<&str>) -> Named {
        Named {
            id: "heat".into(),
            title: "Heat".into(),
            year: Some(1995),
            tmdb,
            imdb: imdb.map(str::to_string),
            tvdb: None,
        }
    }

    #[test]
    fn an_id_is_read_as_its_catalogue_writes_it_and_anything_else_is_no_id() {
        let read = ids(json!({ "tmdb": " 949 ", "imdb": " tt0113277 ", "tvdb": "334824" }));
        let unreadable = ids(json!({ "tmdb": "nine", "imdb": "  ", "tvdb": "-3" }));
        let too_long = ids(json!({ "imdb": "t".repeat(MAX_ID_BYTES + 1) }));

        assert_eq!(
            catalogue_ids(&read),
            CatalogueIds {
                tmdb: Some(949),
                imdb: Some("tt0113277"),
                tvdb: Some(334_824),
            }
        );
        assert_eq!(catalogue_ids(&unreadable), CatalogueIds::default());
        assert_eq!(catalogue_ids(&too_long), CatalogueIds::default());
    }

    #[test]
    fn a_name_of_no_letter_or_past_its_bound_is_no_name() {
        assert_eq!(name(None), None);
        assert_eq!(name(Some("?! ...")), None);
        assert_eq!(name(Some(&"a".repeat(MAX_NAME_CHARS + 1))), None);
        assert_eq!(name(Some("The Heat")).as_deref(), Some("heat"));
    }

    #[test]
    fn a_title_here_under_another_id_of_one_catalogue_is_another_title() {
        let said = ids(json!({ "tmdb": "949", "imdb": "tt0113277" }));
        let there = catalogue_ids(&said);

        let same = another_title(&there, &here(Some(949), Some("tt0113277")));
        let unknown_here = another_title(&there, &here(None, None));
        let another_tmdb = another_title(&there, &here(Some(111), None));
        let another_imdb = another_title(&there, &here(Some(949), Some("tt0000001")));

        assert!(!same);
        assert!(!unknown_here);
        assert!(another_tmdb);
        assert!(another_imdb);
    }
}

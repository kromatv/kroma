//! A title found by what the other server says it is, for one whose file is
//! nothing here: by the ids other catalogues give it, then by its name. The
//! description is the importer's word, so each part is bounded here.

use std::collections::hash_map::Entry;
use std::collections::HashMap;

use anyhow::Result;

use crate::db;
use crate::db::imports::{CatalogueIds, EpisodeOf, Named};
use crate::domain::matching::normalize;
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
    Some(normalize(text)).filter(|name| !name.is_empty())
}

fn same_year(there: Option<u32>, here: Option<u32>) -> bool {
    there.is_none() || here.is_none() || there == here
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
            TitleKind::Other => Ok(None),
        }
    }

    fn film(&mut self, title: &Title) -> Result<Option<String>> {
        if let Some(film) = db::imports::film_by_ids(self.pool, &catalogue_ids(&title.ids))? {
            return Ok(Some(film));
        }
        let (Some(named), Some(year)) = (name(title.title.as_deref()), title.year) else {
            return Ok(None);
        };
        let films = match self.films.entry(year) {
            Entry::Occupied(read) => read.into_mut(),
            Entry::Vacant(unread) => unread.insert(db::imports::films_of_year(self.pool, year)?),
        };
        let film = films.iter().find(|film| normalize(&film.title) == named);
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

    fn shows_that_are(&mut self, series: &Series) -> Result<Vec<String>> {
        if let Some(show) = db::imports::show_by_ids(self.pool, &catalogue_ids(&series.ids))? {
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
            .filter(|show| same_year(series.year, show.year) && normalize(&show.title) == named)
            .map(|show| show.id.clone())
            .collect())
    }
}

use std::collections::BTreeMap;

use anyhow::{bail, Result};

use crate::client::Session;
use crate::jellyfin::{Item, ItemsPage};
use crate::queries::{by_ids, films_and_episodes, in_library, paged, with_fields, Window};
use crate::wire::{ExternalIds, Series, Title, TitleKind, TitlePage, TitlesAsk};
use crate::Importer;

const TITLE_FIELDS: &str = "Path,ProviderIds,MediaSourceCount";
const SERIES_FIELDS: &str = "ProviderIds";
const VERSION_FIELDS: &str = "MediaSources";

type Found = BTreeMap<String, Item>;

pub(crate) fn number(value: Option<i64>) -> Option<u32> {
    value.and_then(|value| u32::try_from(value).ok())
}

fn kind(item: &Item) -> TitleKind {
    match item.kind.as_str() {
        "Movie" => TitleKind::Movie,
        "Episode" => TitleKind::Episode,
        _ => TitleKind::Other,
    }
}

fn external_ids(item: &Item) -> ExternalIds {
    let id = |provider: &str| {
        item.provider_ids
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(provider))
            .and_then(|(_, value)| value.clone())
            .filter(|value| !value.is_empty())
    };
    ExternalIds {
        tmdb: id("Tmdb"),
        imdb: id("Imdb"),
        tvdb: id("Tvdb"),
    }
}

fn paths(item: &Item, versions: &Found) -> Vec<String> {
    let mut paths: Vec<String> = item.path.iter().cloned().collect();
    let sources = versions
        .get(&item.id)
        .map_or(&[][..], |found| &found.media_sources);
    for path in sources.iter().filter_map(|source| source.path.as_ref()) {
        if !paths.contains(path) {
            paths.push(path.clone());
        }
    }
    paths
}

fn series(item: &Item, shows: &Found) -> Option<Series> {
    if kind(item) != TitleKind::Episode {
        return None;
    }
    let show = item.series_id.as_ref().and_then(|id| shows.get(id));
    Some(Series {
        title: item
            .series_name
            .clone()
            .or_else(|| show.and_then(|show| show.name.clone())),
        year: show.and_then(|show| number(show.production_year)),
        ids: show.map(external_ids).unwrap_or_default(),
    })
}

fn title(item: &Item, shows: &Found, versions: &Found) -> Title {
    let episode = kind(item) == TitleKind::Episode;
    Title {
        id: item.id.clone(),
        kind: kind(item),
        paths: paths(item, versions),
        title: item.name.clone(),
        year: number(item.production_year),
        ids: external_ids(item),
        series: series(item, shows),
        season: number(item.parent_index_number).filter(|_| episode),
        episode: number(item.index_number).filter(|_| episode),
    }
}

fn unique(ids: impl Iterator<Item = String>) -> Vec<String> {
    let mut ids: Vec<String> = ids.collect();
    ids.sort();
    ids.dedup();
    ids
}

fn looked_up(session: &Session<'_>, ids: &[String], fields: &str) -> Result<Found> {
    let mut found = Found::new();
    for query in by_ids(session.user(), ids, fields) {
        let page: ItemsPage = session.get(session.dialect().items, query)?;
        found.extend(page.items.into_iter().map(|item| (item.id.clone(), item)));
    }
    Ok(found)
}

fn kept_twice(items: &[Item]) -> Vec<String> {
    let twice = |item: &&Item| item.media_source_count.is_some_and(|count| count > 1);
    unique(items.iter().filter(twice).map(|item| item.id.clone()))
}

impl Importer {
    pub(crate) fn titles(&self, ask: &TitlesAsk) -> Result<TitlePage> {
        let session = self.session(&ask.sign_in, &ask.server)?;
        let window = Window::of(ask.cursor.as_deref(), ask.limit)?;
        let listed = in_library(films_and_episodes(session.user()), &ask.library);
        let query = paged(with_fields(listed, TITLE_FIELDS), window);
        let Some(page) = session.visible_items(query)? else {
            bail!("the Jellyfin account that signed in may not open this library");
        };
        let next = window.next(page.items.len());
        let items: Vec<Item> = page
            .items
            .into_iter()
            .filter(|item| !item.id.is_empty())
            .collect();
        let shows = unique(items.iter().filter_map(|item| item.series_id.clone()));
        let shows = looked_up(&session, &shows, SERIES_FIELDS)?;
        let versions = looked_up(&session, &kept_twice(&items), VERSION_FIELDS)?;
        Ok(TitlePage {
            next: next.map(|start| start.to_string()),
            titles: items
                .iter()
                .map(|item| title(item, &shows, &versions))
                .collect(),
        })
    }
}

#[cfg(test)]
mod tests;

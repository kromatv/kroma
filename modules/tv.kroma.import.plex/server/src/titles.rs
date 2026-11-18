use std::collections::BTreeMap;

use anyhow::Result;

use crate::failure::Failure;
use crate::ids::external;
use crate::library::{self, playable, Playable, Shelf};
use crate::paging;
use crate::plex::Plex;
use crate::server::{is_key, Ask, Server};
use crate::store::ServerKey;
use crate::wire::{Series, Title, TitleKind, TitlePage, TitlesAsk};
use crate::xml::Element;

const SHOWS_PER_ASK: usize = 100;
const SHOWS_BYTES: u64 = 8 * 1024 * 1024;

type Shows = BTreeMap<String, Series>;

impl Plex {
    pub(crate) fn titles(&self, ask: &TitlesAsk) -> Result<TitlePage> {
        let key = ServerKey {
            sign_in: &ask.sign_in,
            server: &ask.server,
        };
        let shelf = Shelf {
            library: &ask.library,
            window: paging::window(ask.cursor.as_deref(), ask.limit)?,
        };
        self.on_server(key, |server| {
            let Some(page) = library::titles(server, shelf)? else {
                return Ok(TitlePage::default());
            };
            let shows = shows_of(server, &page)?;
            Ok(TitlePage {
                titles: page
                    .children()
                    .iter()
                    .filter_map(|item| title(item, &shows))
                    .collect(),
                next: paging::next(shelf.window, &page),
            })
        })
    }
}

fn shows_of(server: &Server<'_>, page: &Element) -> Result<Shows, Failure> {
    let mut keys: Vec<&str> = page
        .children()
        .iter()
        .filter_map(|item| item.attr("grandparentRatingKey"))
        .filter(|key| is_key(key))
        .collect();
    keys.sort_unstable();
    keys.dedup();
    let mut shows = Shows::new();
    for some in keys.chunks(SHOWS_PER_ASK) {
        let listed = server.read(&Ask {
            path: &format!("/library/metadata/{}", some.join(",")),
            query: vec![("includeGuids", "1".to_string())],
            window: None,
            max_bytes: SHOWS_BYTES,
        })?;
        shows.extend(listed.children().iter().filter_map(show));
    }
    Ok(shows)
}

fn show(item: &Element) -> Option<(String, Series)> {
    let series = Series {
        title: item.text("title"),
        year: item.number("year"),
        ids: external(item),
    };
    Some((item.text("ratingKey")?, series))
}

fn title(item: &Element, shows: &Shows) -> Option<Title> {
    let (id, kind) = playable(item)?;
    let episode = kind == Playable::Episode;
    Some(Title {
        id,
        kind: match kind {
            Playable::Movie => TitleKind::Movie,
            Playable::Episode => TitleKind::Episode,
        },
        paths: item
            .every("Part")
            .into_iter()
            .filter_map(|part| part.text("file"))
            .collect(),
        title: item.text("title"),
        year: item.number("year"),
        ids: external(item),
        series: episode.then(|| series_of(item, shows)),
        season: item.number("parentIndex").filter(|_| episode),
        episode: item.number("index").filter(|_| episode),
    })
}

fn series_of(episode: &Element, shows: &Shows) -> Series {
    let known = episode
        .attr("grandparentRatingKey")
        .and_then(|key| shows.get(key));
    Series {
        title: episode.text("grandparentTitle"),
        ..known.cloned().unwrap_or_default()
    }
}

#[cfg(test)]
mod tests;

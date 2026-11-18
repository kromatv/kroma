use anyhow::{anyhow, Result};

use crate::library::{self, playable, Shelf};
use crate::paging;
use crate::plex::Plex;
use crate::store::{self, ServerKey};
use crate::wire::{StatePage, StatesAsk, WatchState};
use crate::xml::Element;

enum Reader {
    Owner,
    Shared(String),
}

impl Plex {
    pub(crate) fn states(&self, ask: &StatesAsk) -> Result<StatePage> {
        let key = ServerKey {
            sign_in: &ask.sign_in,
            server: &ask.server,
        };
        let shelf = Shelf {
            library: &ask.library,
            window: paging::window(ask.cursor.as_deref(), ask.limit)?,
        };
        let reader = self.reader(key, &ask.user)?;
        self.on_server(key, |server| {
            let read = match reader {
                Reader::Owner => library::states(server, server, shelf)?,
                Reader::Shared(token) => library::states(server, &server.as_user(token), shelf)?,
            };
            let Some(page) = read else {
                return Ok(StatePage::default());
            };
            let since = ask.changed_since;
            Ok(StatePage {
                states: page
                    .children()
                    .iter()
                    .filter_map(|item| state(item, since))
                    .collect(),
                next: paging::next(shelf.window, &page),
            })
        })
    }

    fn reader(&self, key: ServerKey<'_>, user: &str) -> Result<Reader> {
        if self.signed_in(key.sign_in)?.account_id == user {
            return Ok(Reader::Owner);
        }
        if let Some(token) = store::reader_token(&self.store, key, user)? {
            return Ok(Reader::Shared(token));
        }
        self.users(key)?;
        store::reader_token(&self.store, key, user)?
            .map(Reader::Shared)
            .ok_or_else(|| {
                anyhow!("the watch state of user {user} cannot be read with this sign-in")
            })
    }
}

fn state(item: &Element, changed_since: Option<i64>) -> Option<WatchState> {
    let (title, _) = playable(item)?;
    let plays: u32 = item.number("viewCount").unwrap_or(0);
    let position: Option<u64> = item.number("viewOffset").filter(|offset| *offset > 0);
    if plays == 0 && position.is_none() {
        return None;
    }
    let last_played_at: Option<i64> = item.number("lastViewedAt");
    let unchanged = changed_since
        .zip(last_played_at)
        .is_some_and(|(since, at)| at < since);
    (!unchanged).then(|| WatchState {
        title,
        watched: plays > 0,
        play_count: Some(plays).filter(|plays| *plays > 0),
        position_ms: position,
        duration_ms: item.number("duration"),
        last_played_at,
    })
}

#[cfg(test)]
mod tests;

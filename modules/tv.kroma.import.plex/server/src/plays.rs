use anyhow::Result;

use crate::library::playable;
use crate::paging;
use crate::plex::Plex;
use crate::server::{is_key, Ask};
use crate::store::ServerKey;
use crate::wire::{Play, PlayPage, PlaysAsk};
use crate::xml::Element;

const HISTORY: &str = "/status/sessions/history/all";
const PAGE_BYTES: u64 = 16 * 1024 * 1024;
const MAX_ID_BYTES: usize = 512;

const OWNER_ON_THE_SERVER: &str = "1";

impl Plex {
    pub(crate) fn plays(&self, ask: &PlaysAsk) -> Result<PlayPage> {
        let key = ServerKey {
            sign_in: &ask.sign_in,
            server: &ask.server,
        };
        let owner = self.signed_in(&ask.sign_in)?.account_id;
        let window = paging::window(ask.cursor.as_deref(), ask.limit)?;
        let mut query = vec![("sort", "viewedAt:desc".to_string())];
        if let Some(since) = ask.changed_since {
            query.push(("viewedAt>", since.to_string()));
        }
        self.on_server(key, |server| {
            let page = server.read(&Ask {
                path: HISTORY,
                query,
                window: Some(window),
                max_bytes: PAGE_BYTES,
            })?;
            Ok(PlayPage {
                plays: page
                    .children()
                    .iter()
                    .filter_map(|row| play(row, &owner))
                    .collect(),
                next: paging::next(window, &page),
            })
        })
    }
}

fn play(row: &Element, owner: &str) -> Option<Play> {
    let (title, _) = playable(row)?;
    let account = row.attr("accountID").filter(|id| is_key(id))?;
    let user = match account {
        OWNER_ON_THE_SERVER => owner,
        shared => shared,
    };
    Some(Play {
        id: row
            .text("historyKey")
            .filter(|id| id.len() <= MAX_ID_BYTES)?,
        user: user.to_string(),
        title,
        played_at: row.number("viewedAt")?,
    })
}

#[cfg(test)]
mod tests;

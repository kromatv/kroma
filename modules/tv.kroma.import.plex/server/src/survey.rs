mod people;

use anyhow::{bail, Result};

use crate::failure::Failure;
use crate::plex::Plex;
use crate::server::{item_type, listing, Ask, Section, Server};
use crate::store::{self, ServerKey};
use crate::wire::{Counts, Library, Survey, SurveyAsk, User};

use people::{people, Listed};

const WATCHLIST: &str = "watchlist";
const COLLECTIONS: &str = "18";

struct Held {
    libraries: Vec<Library>,
    counts: Counts,
    left_behind: Vec<&'static str>,
}

impl Plex {
    /// Also keeps the token of each user whose watch state it may read, for
    /// the `states` calls that follow.
    pub(crate) fn survey(&self, ask: &SurveyAsk) -> Result<Survey> {
        let key = ServerKey {
            sign_in: &ask.sign_in,
            server: &ask.server,
        };
        let held = self.on_server(key, |server| Ok(held(server)?))?;
        Ok(Survey {
            libraries: held.libraries,
            users: self.users(key)?,
            counts: held.counts,
            left_behind: held.left_behind,
        })
    }

    /// The users of a server as plex.tv lists them now. Each call replaces the
    /// tokens kept for that server.
    pub(crate) fn users(&self, key: ServerKey<'_>) -> Result<Vec<User>> {
        let sign_in = self.signed_in(key.sign_in)?;
        if store::server(&self.store, key)?.is_none() {
            bail!("this sign-in reaches no such server");
        }
        let client = store::client_id(&self.store)?;
        let account = self.account(&client);
        let listed = people(&Listed {
            me: &account.me(&sign_in.token)?,
            friends: &account.friends(&sign_in.token)?,
            shares: &account.shares(&sign_in.token, key.server)?,
            machine: key.server,
        });
        let readers: Vec<(String, String)> = listed
            .iter()
            .filter_map(|person| Some((person.user.id.clone(), person.token.clone()?)))
            .collect();
        store::keep_readers(&self.store, key, &readers)?;
        Ok(listed.into_iter().map(|person| person.user).collect())
    }
}

fn held(server: &Server<'_>) -> Result<Held, Failure> {
    let sections = server.sections()?;
    let counts = Counts {
        titles: titles_held(server, &sections)?,
        plays: server.total(Ask::small("/status/sessions/history/all"))?,
    };
    Ok(Held {
        left_behind: left_behind(server, &sections)?,
        counts,
        libraries: sections.into_iter().map(library).collect(),
    })
}

fn library(section: Section) -> Library {
    Library {
        id: section.key,
        name: section.name,
        kind: section.kind,
        folders: section.folders,
    }
}

fn of_type<'a>(path: &'a str, item: &str) -> Ask<'a> {
    Ask {
        query: vec![("type", item.to_string())],
        ..Ask::small(path)
    }
}

fn titles_held(server: &Server<'_>, sections: &[Section]) -> Result<Option<u64>, Failure> {
    let mut held = 0;
    for section in sections {
        let Some(item) = item_type(section.kind) else {
            continue;
        };
        let Some(total) = server.total(of_type(&listing(&section.key), item))? else {
            return Ok(None);
        };
        held += total;
    }
    Ok(Some(held))
}

fn left_behind(server: &Server<'_>, sections: &[Section]) -> Result<Vec<&'static str>, Failure> {
    let mut left = Vec::new();
    if server.any(Ask::small("/playlists"))? {
        left.push("playlists");
    }
    if has_collections(server, sections)? {
        left.push("collections");
    }
    if server.any(Ask::small("/livetv/dvrs"))? {
        left.push("liveTv");
    }
    // Always named: it is on the Plex account, where the importer does not
    // look, so it stays behind for every household.
    left.push(WATCHLIST);
    Ok(left)
}

fn has_collections(server: &Server<'_>, sections: &[Section]) -> Result<bool, Failure> {
    for section in sections {
        if item_type(section.kind).is_none() {
            continue;
        }
        let collections = server.total(of_type(&listing(&section.key), COLLECTIONS))?;
        if collections.is_some_and(|total| total > 0) {
            return Ok(true);
        }
    }
    Ok(false)
}

#[cfg(test)]
mod tests;

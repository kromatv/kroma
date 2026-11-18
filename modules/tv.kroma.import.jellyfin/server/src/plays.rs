//! The plays the other server remembers: the last play of each title each user
//! watched or started. It keeps no older one.

use anyhow::{anyhow, Result};

use crate::jellyfin::{Item, ItemsPage, User};
use crate::queries::{films_and_episodes, filtered, page_rows, paged, with_user_data, Window};
use crate::states::last_played;
use crate::survey::{PLAYED, STARTED};
use crate::wire::{Play, PlayPage, PlaysAsk};
use crate::Importer;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Pass {
    Played,
    Started,
}

impl Pass {
    fn key(self) -> &'static str {
        match self {
            Self::Played => "played",
            Self::Started => "started",
        }
    }

    fn filters(self) -> &'static str {
        match self {
            Self::Played => PLAYED,
            Self::Started => STARTED,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Place {
    user: String,
    pass: Pass,
    start: usize,
}

impl Place {
    fn first(users: &[String]) -> Option<Self> {
        users.first().map(|user| Self::opening(user))
    }

    fn opening(user: &str) -> Self {
        Self {
            user: user.to_string(),
            pass: Pass::Played,
            start: 0,
        }
    }

    fn read(cursor: &str) -> Option<Self> {
        let mut parts = cursor.splitn(3, '/');
        let (user, pass, start) = (parts.next()?, parts.next()?, parts.next()?);
        let pass = [Pass::Played, Pass::Started]
            .into_iter()
            .find(|known| known.key() == pass)?;
        Some(Self {
            user: user.to_string(),
            pass,
            start: start.parse().ok()?,
        })
    }

    fn cursor(&self) -> String {
        format!("{}/{}/{}", self.user, self.pass.key(), self.start)
    }

    fn after(&self, window: Window, returned: usize, users: &[String]) -> Option<Self> {
        if let Some(start) = window.next(returned) {
            return Some(Self {
                start,
                ..self.clone()
            });
        }
        if self.pass == Pass::Played {
            return Some(Self {
                pass: Pass::Started,
                start: 0,
                ..self.clone()
            });
        }
        users
            .iter()
            .find(|user| **user > self.user)
            .map(|user| Self::opening(user))
    }
}

fn play(user: &str, item: &Item) -> Option<Play> {
    let played_at = item.user_data.as_ref().and_then(last_played)?;
    if item.id.is_empty() {
        return None;
    }
    Some(Play {
        id: format!("{user}:{}:{played_at}", item.id),
        user: user.to_string(),
        title: item.id.clone(),
        played_at,
    })
}

fn place(cursor: Option<&str>, users: &[String]) -> Result<Option<Place>> {
    match cursor {
        None => Ok(Place::first(users)),
        Some(cursor) => Place::read(cursor)
            .map(Some)
            .ok_or_else(|| anyhow!("a cursor this importer did not give")),
    }
}

fn user_ids(found: Vec<User>) -> Vec<String> {
    let mut ids: Vec<String> = found
        .into_iter()
        .map(|user| user.id)
        .filter(|id| !id.is_empty())
        .collect();
    ids.sort();
    ids
}

impl Importer {
    pub(crate) fn plays(&self, ask: &PlaysAsk) -> Result<PlayPage> {
        let session = self.session(&ask.sign_in, &ask.server)?;
        let users = user_ids(session.get(self.dialect.users, Vec::new())?);
        let Some(place) = place(ask.cursor.as_deref(), &users)? else {
            return Ok(PlayPage::default());
        };
        let window = Window {
            start: place.start,
            limit: page_rows(ask.limit),
        };
        let listed = filtered(films_and_episodes(&place.user), place.pass.filters());
        let query = paged(with_user_data(listed), window);
        let page: ItemsPage = session.get(self.dialect.items, query)?;
        let since = ask.changed_since.unwrap_or(i64::MIN);
        let next = place.after(window, page.items.len(), &users);
        Ok(PlayPage {
            next: next.map(|next| next.cursor()),
            plays: page
                .items
                .iter()
                .filter_map(|item| play(&place.user, item))
                .filter(|play| play.played_at >= since)
                .collect(),
        })
    }
}

#[cfg(test)]
mod tests;

//! plex.tv, as the importer calls it: the PIN sign-in, the account, its
//! servers, and the people it shares them with. Each call and its source is in
//! `docs/reference/plex-api.md`.

mod home;
mod people;
mod servers;

use crate::failure::Failure;
use crate::web::{Call, Door, Web};
use crate::xml::Element;

#[cfg(test)]
pub(crate) use people::FriendServer;
pub(crate) use people::{Friend, Share};
pub(crate) use servers::{Connection, Resource};

pub(crate) const PRODUCT: &str = "KROMA";

const PLEX_TV: &str = "plex.tv";
const BASE: &str = "https://plex.tv";
const SMALL: u64 = 64 * 1024;
const LARGE: u64 = 4 * 1024 * 1024;
const MAX_SECONDS: u32 = 15;

pub(crate) struct Pin {
    pub id: i64,
    pub code: String,
}

pub(crate) enum PinState {
    Waiting,
    Approved(String),
    Gone,
}

pub(crate) struct Me {
    pub id: String,
    pub name: String,
    pub email: Option<String>,
}

/// plex.tv for one install of the importer, which plex.tv knows by `client`.
pub(crate) struct Account<'a> {
    pub web: &'a dyn Web,
    pub client: &'a str,
}

struct Ask<'a> {
    path: &'a str,
    token: Option<&'a str>,
    query: Vec<(&'static str, String)>,
    max_bytes: u64,
}

impl Account<'_> {
    fn call(&self, ask: &Ask<'_>) -> Call {
        let mut headers = vec![
            ("Accept", "application/xml".to_string()),
            ("X-Plex-Client-Identifier", self.client.to_string()),
            ("X-Plex-Product", PRODUCT.to_string()),
        ];
        if let Some(token) = ask.token {
            headers.push(("X-Plex-Token", token.to_string()));
        }
        Call {
            door: Door::Account,
            url: format!("{BASE}{}", ask.path),
            query: ask.query.clone(),
            headers,
            max_bytes: ask.max_bytes,
            max_seconds: MAX_SECONDS,
        }
    }

    fn read(&self, ask: &Ask<'_>) -> Result<Element, Failure> {
        let answer = self
            .web
            .get(&self.call(ask))
            .map_err(|_| Failure::Unreached(PLEX_TV))?;
        parsed(answer.status, &answer.body)
    }

    fn signed(&self, token: &str, path: &str) -> Result<Element, Failure> {
        self.read(&Ask {
            path,
            token: Some(token),
            query: Vec::new(),
            max_bytes: LARGE,
        })
    }

    /// Starts a sign-in. This is the one call of the importer that creates
    /// something: a PIN, which plex.tv drops when it runs out.
    pub(crate) fn start_pin(&self) -> Result<Pin, Failure> {
        let ask = Ask {
            path: "/api/v2/pins",
            token: None,
            query: Vec::new(),
            max_bytes: SMALL,
        };
        let answer = self
            .web
            .post(&self.call(&ask), &[("strong", "true")])
            .map_err(|_| Failure::Unreached(PLEX_TV))?;
        let pin = parsed(answer.status, &answer.body)?;
        match (pin.number("id"), pin.text("code")) {
            (Some(id), Some(code)) if is_plain(&code) => Ok(Pin { id, code }),
            _ => Err(Failure::Unreadable(PLEX_TV)),
        }
    }

    pub(crate) fn pin_state(&self, pin: &Pin) -> Result<PinState, Failure> {
        let asked = self.read(&Ask {
            path: &format!("/api/v2/pins/{}", pin.id),
            token: None,
            query: vec![("code", pin.code.clone())],
            max_bytes: SMALL,
        });
        match asked {
            Ok(pin) => Ok(pin
                .text("authToken")
                .map_or(PinState::Waiting, PinState::Approved)),
            Err(Failure::Status(_, 404)) => Ok(PinState::Gone),
            Err(failure) => Err(failure),
        }
    }

    pub(crate) fn me(&self, token: &str) -> Result<Me, Failure> {
        let user = self.signed(token, "/api/v2/user")?;
        let id = user.text("id").ok_or(Failure::Unreadable(PLEX_TV))?;
        let name = ["title", "username", "email"]
            .iter()
            .find_map(|attr| user.text(attr))
            .unwrap_or_else(|| id.clone());
        Ok(Me {
            id,
            name,
            email: user.text("email"),
        })
    }

    /// The servers the account owns. A server shared with the account is left
    /// out: only its owner can read who it is shared with.
    pub(crate) fn servers(&self, token: &str) -> Result<Vec<Resource>, Failure> {
        let listed = self.read(&home::resources(token))?;
        Ok(servers::owned(&listed))
    }

    pub(crate) fn friends(&self, token: &str) -> Result<Vec<Friend>, Failure> {
        let listed = self.signed(token, "/api/users")?;
        Ok(people::friends(&listed))
    }

    pub(crate) fn shares(&self, token: &str, machine: &str) -> Result<Vec<Share>, Failure> {
        if !is_plain(machine) {
            return Err(Failure::Unreadable(PLEX_TV));
        }
        let listed = self.signed(token, &format!("/api/servers/{machine}/shared_servers"))?;
        Ok(people::shares(&listed))
    }
}

fn parsed(status: u16, body: &[u8]) -> Result<Element, Failure> {
    match status {
        200..=299 => Element::parse(body).map_err(|_| Failure::Unreadable(PLEX_TV)),
        401 => Err(Failure::Denied(PLEX_TV)),
        other => Err(Failure::Status(PLEX_TV, other)),
    }
}

/// Whether `value` is safe as one segment of a URL: letters, digits, `-`, `_`
/// and `.`, and not empty.
pub(crate) fn is_plain(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

#[cfg(test)]
mod tests;

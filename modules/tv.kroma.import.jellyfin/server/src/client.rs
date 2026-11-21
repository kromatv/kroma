use anyhow::{anyhow, bail, Result};
use serde::de::{DeserializeOwned, IgnoredAny};

use crate::dialect::{Call, Dialect};
use crate::jellyfin::ItemsPage;
use crate::sign_ins::{self, SignIn};
use crate::web::{Query, Request, Web};
use crate::Importer;

const CLIENT: &str = "KROMA";
const VERSION: &str = env!("CARGO_PKG_VERSION");
const MAX_ANSWER_BYTES: u64 = 16 * 1024 * 1024;
pub(crate) const UNAUTHORIZED: u16 = 401;

#[derive(Debug)]
pub(crate) enum Failure {
    Unreachable(String),
    Redirected(Option<String>),
    Status(u16),
    Unreadable,
}

pub(crate) fn ask<T: DeserializeOwned>(web: &dyn Web, request: &Request) -> Result<T, Failure> {
    let answer = web
        .send(request)
        .map_err(|error| Failure::Unreachable(format!("{error:#}")))?;
    match answer.status {
        200..=299 if answer.body.len() as u64 <= request.max_bytes => {
            serde_json::from_slice(&answer.body).map_err(|_| Failure::Unreadable)
        }
        200..=299 => Err(Failure::Unreadable),
        300..=399 => Err(Failure::Redirected(answer.location)),
        status => Err(Failure::Status(status)),
    }
}

pub(crate) fn authorization(dialect: &Dialect, device: &str, token: Option<&str>) -> String {
    let mut header = format!(
        "{} Client=\"{CLIENT}\", Device=\"{CLIENT}\", DeviceId=\"{}\", Version=\"{VERSION}\"",
        dialect.scheme,
        encoded(device)
    );
    if let Some(token) = token {
        header.push_str(&format!(", Token=\"{}\"", encoded(token)));
    }
    header
}

// Jellyfin URL-decodes each value of the header.
fn encoded(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(char::from(byte))
            }
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}

pub(crate) struct Session<'a> {
    web: &'a dyn Web,
    dialect: &'static Dialect,
    sign_in: SignIn,
}

impl Importer {
    pub(crate) fn session(&self, sign_in: &str, server: &str) -> Result<Session<'_>> {
        let Some(sign_in) = sign_ins::find(&self.store, sign_in)? else {
            bail!(
                "this sign-in to {} is not kept here. Sign in again.",
                self.dialect.name
            );
        };
        if sign_in.server != server {
            bail!("this sign-in does not reach that server");
        }
        Ok(Session {
            web: self.web.as_ref(),
            dialect: self.dialect,
            sign_in,
        })
    }
}

impl Session<'_> {
    pub(crate) fn user(&self) -> &str {
        &self.sign_in.user
    }

    pub(crate) fn dialect(&self) -> &'static Dialect {
        self.dialect
    }

    pub(crate) fn get<T: DeserializeOwned>(&self, call: Call, query: Query) -> Result<T> {
        self.read(call, query)
            .map_err(|failure| self.explained(call, failure))
    }

    // Jellyfin answers 401 to a library its user may not see, not only to a
    // token it no longer accepts. `None` is the first of the two.
    pub(crate) fn visible_items(&self, query: Query) -> Result<Option<ItemsPage>> {
        let call = self.dialect.items;
        match self.read(call, query) {
            Ok(page) => Ok(Some(page)),
            Err(Failure::Status(UNAUTHORIZED)) if self.still_signed_in() => Ok(None),
            Err(failure) => Err(self.explained(call, failure)),
        }
    }

    fn still_signed_in(&self) -> bool {
        self.read::<IgnoredAny>(self.dialect.whoami, Query::new())
            .is_ok()
    }

    fn read<T: DeserializeOwned>(&self, call: Call, query: Query) -> Result<T, Failure> {
        let token = Some(self.sign_in.token.as_str());
        let request = Request {
            method: call.method,
            url: format!("{}{}", self.sign_in.address, call.path),
            query,
            authorization: Some(authorization(self.dialect, &self.sign_in.device, token)),
            body: None,
            max_bytes: MAX_ANSWER_BYTES,
        };
        ask(self.web, &request)
    }

    fn explained(&self, call: Call, failure: Failure) -> anyhow::Error {
        let (name, path) = (self.dialect.name, call.path);
        match failure {
            Failure::Status(UNAUTHORIZED) => {
                anyhow!("{name} refused the sign-in it gave. Sign in again.")
            }
            Failure::Status(status) => anyhow!("{name} answered {path} with HTTP {status}"),
            Failure::Redirected(_) => anyhow!("{name} answered {path} with a redirect"),
            Failure::Unreadable => {
                anyhow!("{name} gave an answer to {path} this importer cannot read")
            }
            Failure::Unreachable(why) => {
                anyhow!("{name} did not answer at {}: {why}", self.sign_in.address)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::*;

    use crate::dialect::{EMBY, JELLYFIN};
    use crate::test_support::{Recorded, World, SAM, SERVER};

    fn failed_reading_counts(world: &World) -> String {
        let sign_in = world.signed_in();
        let session = world.importer.session(&sign_in, SERVER).unwrap();
        let failure = session.get::<IgnoredAny>(world.jellyfin.dialect().counts, Query::new());
        format!("{:#}", failure.err().unwrap())
    }

    #[test]
    fn the_header_names_the_caller_under_the_media_browser_scheme() {
        let header = authorization(&JELLYFIN, "device-1", None);

        assert_eq!(
            header,
            format!("MediaBrowser Client=\"KROMA\", Device=\"KROMA\", DeviceId=\"device-1\", Version=\"{VERSION}\"")
        );
    }

    #[test]
    fn the_token_rides_in_the_same_header_once_there_is_one() {
        let header = authorization(&JELLYFIN, "device-1", Some("abc123"));

        assert!(header.starts_with("MediaBrowser "));
        assert!(header.ends_with(", Token=\"abc123\""));
    }

    #[test]
    fn a_value_is_encoded_so_that_it_cannot_close_its_own_quotes() {
        let header = authorization(&JELLYFIN, "a\"b, c+d", None);

        assert!(header.contains("DeviceId=\"a%22b%2C%20c%2Bd\""));
    }

    #[test]
    fn a_status_the_server_should_not_give_is_named_with_the_call_and_the_code() {
        let failing = Recorded::emby().answering(EMBY.counts.path, &[], (500, Value::Null));
        let world = World::over(failing);

        let said = failed_reading_counts(&world);

        assert_eq!(said, "Emby answered /emby/Items/Counts with HTTP 500");
    }

    #[test]
    fn a_redirect_on_a_read_is_named_with_the_call_and_not_followed() {
        let moved = json!({ "Location": "http://elsewhere.test/Items/Counts" });
        let world =
            World::over(Recorded::jellyfin().answering(JELLYFIN.counts.path, &[], (302, moved)));

        let said = failed_reading_counts(&world);

        assert_eq!(said, "Jellyfin answered /Items/Counts with a redirect");
    }

    #[test]
    fn a_server_that_no_longer_answers_is_named_with_the_address_kept() {
        let world = World::over(Recorded::emby());
        let gone = SignIn {
            id: "kept-elsewhere".to_string(),
            address: "http://gone.test:8096".to_string(),
            server: SERVER.to_string(),
            user: SAM.to_string(),
            token: "t".to_string(),
            device: "d".to_string(),
        };
        sign_ins::keep(&world.importer.store, &gone).unwrap();
        let session = world.importer.session(&gone.id, SERVER).unwrap();

        let failure = session.get::<IgnoredAny>(EMBY.counts, Query::new());

        let said = format!("{:#}", failure.err().unwrap());
        assert!(
            said.starts_with("Emby did not answer at http://gone.test:8096: "),
            "{said}"
        );
    }
}

use anyhow::Result;
use kroma_module_sdk::primitives::{random_token, short_hash};
use serde_json::json;

use crate::client::{ask, authorization, Failure, UNAUTHORIZED};
use crate::dialect::{Call, Dialect};
use crate::jellyfin::{Authenticated, ServerInfo};
use crate::sign_ins::{self, SignIn};
use crate::web::{Query, Request};
use crate::wire::{ConnectAsk, Connected, Refusal, Server};
use crate::Importer;

const MAX_SIGN_IN_BYTES: u64 = 256 * 1024;

enum Stop {
    Refused(Connected),
    Failed(anyhow::Error),
}

impl From<anyhow::Error> for Stop {
    fn from(error: anyhow::Error) -> Self {
        Self::Failed(error)
    }
}

fn refused(reason: Refusal) -> Stop {
    refused_saying(reason, None)
}

fn refused_saying(reason: Refusal, message: Option<String>) -> Stop {
    Stop::Refused(Connected::Refused { reason, message })
}

struct Form<'a> {
    address: String,
    username: &'a str,
    password: &'a str,
}

impl<'a> Form<'a> {
    fn read(ask: &'a ConnectAsk, dialect: &Dialect) -> Result<Self, Stop> {
        let field = |key: &str| ask.fields.get(key).map_or("", |value| value.as_str());
        let username = field("username").trim();
        if username.is_empty() {
            return Err(refused(Refusal::Credentials));
        }
        Ok(Self {
            address: address(field("url"), dialect).ok_or_else(|| refused(Refusal::Unreachable))?,
            username,
            password: field("password"),
        })
    }
}

fn address(typed: &str, dialect: &Dialect) -> Option<String> {
    let typed = typed.trim().trim_end_matches('/');
    if typed.is_empty() {
        return Some(dialect.local_address.to_string());
    }
    if typed.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return None;
    }
    let Some((scheme, host)) = typed.split_once("://") else {
        return Some(format!("http://{typed}"));
    };
    let scheme = scheme.to_ascii_lowercase();
    let web = ["http", "https"].contains(&scheme.as_str());
    (web && !host.is_empty()).then(|| format!("{scheme}://{host}"))
}

fn described(server: &ServerInfo) -> Option<String> {
    let said = format!("{} {}", server.product_name, server.version);
    let said = said.trim();
    (!said.is_empty()).then(|| said.to_string())
}

fn device_for(installation: &str, username: &str) -> String {
    short_hash(&format!("{installation}:{}", username.to_lowercase()))
}

impl Importer {
    pub(crate) fn connect(&self, ask: &ConnectAsk) -> Result<Connected> {
        match self.ready(ask) {
            Ok(ready) | Err(Stop::Refused(ready)) => Ok(ready),
            Err(Stop::Failed(error)) => Err(error),
        }
    }

    fn ready(&self, ask: &ConnectAsk) -> Result<Connected, Stop> {
        if ask.pending.is_some() {
            return Err(refused(Refusal::Expired));
        }
        let form = Form::read(ask, self.dialect)?;
        let server = self.server_at(&form.address)?;
        let device = device_for(&sign_ins::installation(&self.store)?, form.username);
        let granted = self.authenticated(&form, &device)?;
        if !granted.user.policy.is_administrator {
            return Err(refused(Refusal::NotAdministrator));
        }
        let kept = SignIn {
            id: random_token(),
            address: form.address,
            server: server.id,
            user: granted.user.id,
            token: granted.access_token,
            device,
        };
        sign_ins::keep(&self.store, &kept)?;
        Ok(Connected::Ready {
            sign_in: kept.id,
            servers: vec![Server {
                id: kept.server,
                name: server.server_name,
                address: kept.address,
            }],
        })
    }

    fn request(&self, call: Call, address: &str) -> Request {
        Request {
            method: call.method,
            url: format!("{address}{}", call.path),
            query: Query::new(),
            authorization: None,
            body: None,
            max_bytes: MAX_SIGN_IN_BYTES,
        }
    }

    fn server_at(&self, address: &str) -> Result<ServerInfo, Stop> {
        let request = self.request(self.dialect.server, address);
        match ask::<ServerInfo>(self.web.as_ref(), &request) {
            Ok(server) if server.product_name == self.dialect.product && !server.id.is_empty() => {
                Ok(server)
            }
            Ok(other) => Err(refused_saying(Refusal::Unsupported, described(&other))),
            Err(Failure::Redirected(to)) => Err(refused_saying(Refusal::Unreachable, to)),
            Err(Failure::Unreachable(_) | Failure::Status(500..=599)) => {
                Err(refused(Refusal::Unreachable))
            }
            Err(Failure::Status(_) | Failure::Unreadable) => Err(refused(Refusal::Unsupported)),
        }
    }

    fn authenticated(&self, form: &Form<'_>, device: &str) -> Result<Authenticated, Stop> {
        let request = Request {
            authorization: Some(authorization(self.dialect, device, None)),
            body: Some(json!({ "Username": form.username, "Pw": form.password })),
            ..self.request(self.dialect.sign_in, &form.address)
        };
        match ask::<Authenticated>(self.web.as_ref(), &request) {
            Ok(granted) if !granted.access_token.is_empty() && !granted.user.id.is_empty() => {
                Ok(granted)
            }
            Ok(_) | Err(Failure::Unreadable) => Err(refused(Refusal::Unsupported)),
            Err(Failure::Status(UNAUTHORIZED)) => Err(refused(Refusal::Credentials)),
            Err(Failure::Unreachable(_) | Failure::Redirected(_)) => {
                Err(refused(Refusal::Unreachable))
            }
            Err(Failure::Status(_)) => Err(refused(Refusal::Other)),
        }
    }
}

#[cfg(test)]
mod tests;

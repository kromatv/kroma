use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use anyhow::{anyhow, Result};
use kroma_module_sdk::db::apply_migrations;
use kroma_module_sdk::db::testing::{temp_pool, TempPool};
use kroma_module_sdk::primitives::random_token;
use serde_json::{json, Value};

use crate::dialect::{Method, JELLYFIN};
use crate::sign_ins::MIGRATIONS;
use crate::web::{Answer, Request, Web};
use crate::wire::{ConnectAsk, Connected};
use crate::Importer;

pub(crate) const ADDRESS: &str = "http://jellyfin.test:8096";
pub(crate) const SERVER: &str = "5f2c1d3e4b6a4c8e9d0f1a2b3c4d5e6f";
pub(crate) const SAM: &str = "a0000000000000000000000000000001";
pub(crate) const ANA: &str = "a0000000000000000000000000000002";
pub(crate) const LEO: &str = "a0000000000000000000000000000003";
pub(crate) const OLD: &str = "a0000000000000000000000000000004";
pub(crate) const FILMS: &str = "b0000000000000000000000000000001";
pub(crate) const SHOWS: &str = "b0000000000000000000000000000002";

pub(crate) fn fixture(text: &str) -> Value {
    serde_json::from_str(text).expect("a fixture is JSON")
}

pub(crate) fn store() -> TempPool {
    let pool = temp_pool("import-jellyfin");
    apply_migrations(&pool.get().unwrap(), MIGRATIONS).unwrap();
    pool
}

pub(crate) struct Seen {
    pub(crate) method: Method,
    pub(crate) path: String,
    pub(crate) query: Vec<(String, String)>,
    pub(crate) authorization: Option<String>,
    pub(crate) body: Option<Value>,
}

impl Seen {
    pub(crate) fn param(&self, name: &str) -> Option<&str> {
        self.query
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.as_str())
    }
}

struct Rule {
    path: &'static str,
    wanted: Vec<(&'static str, String)>,
    status: u16,
    body: Value,
}

impl Rule {
    fn answers(&self, seen: &Seen) -> bool {
        self.path == seen.path
            && self
                .wanted
                .iter()
                .all(|(name, value)| seen.param(name) == Some(value.as_str()))
    }
}

pub(crate) struct Recorded {
    address: String,
    username: String,
    password: String,
    token: String,
    rules: Vec<Rule>,
    seen: Mutex<Vec<Seen>>,
    revoked: AtomicBool,
}

impl Recorded {
    pub(crate) fn jellyfin() -> Self {
        Self {
            address: ADDRESS.to_string(),
            username: "sam".to_string(),
            password: random_token(),
            token: random_token(),
            rules: Vec::new(),
            seen: Mutex::new(Vec::new()),
            revoked: AtomicBool::new(false),
        }
        .on(
            JELLYFIN.server.path,
            &[],
            fixture(include_str!("fixtures/system-info-public.json")),
        )
        .on(
            JELLYFIN.users.path,
            &[],
            fixture(include_str!("fixtures/users.json")),
        )
        .on(
            JELLYFIN.libraries.path,
            &[],
            fixture(include_str!("fixtures/virtual-folders.json")),
        )
        .on(
            JELLYFIN.counts.path,
            &[],
            fixture(include_str!("fixtures/counts.json")),
        )
        .on(
            JELLYFIN.whoami.path,
            &[],
            json!({ "Name": "sam", "Id": SAM }),
        )
    }

    pub(crate) fn at(mut self, address: &str) -> Self {
        self.address = address.to_string();
        self
    }

    // The last rule given is tried first, so a test can replace a default.
    pub(crate) fn on(
        self,
        path: &'static str,
        wanted: &[(&'static str, &str)],
        body: Value,
    ) -> Self {
        self.answering(path, wanted, (200, body))
    }

    pub(crate) fn answering(
        mut self,
        path: &'static str,
        wanted: &[(&'static str, &str)],
        (status, body): (u16, Value),
    ) -> Self {
        let wanted = wanted
            .iter()
            .map(|(name, value)| (*name, value.to_string()))
            .collect();
        self.rules.insert(
            0,
            Rule {
                path,
                wanted,
                status,
                body,
            },
        );
        self
    }

    pub(crate) fn password(&self) -> &str {
        &self.password
    }

    pub(crate) fn token(&self) -> &str {
        &self.token
    }

    pub(crate) fn revoke(&self) {
        self.revoked.store(true, Ordering::SeqCst);
    }

    pub(crate) fn seen<T>(&self, read: impl FnOnce(&[Seen]) -> T) -> T {
        read(&self.seen.lock().unwrap())
    }

    pub(crate) fn paths(&self) -> Vec<String> {
        self.seen(|seen| seen.iter().map(|call| call.path.clone()).collect())
    }

    fn signs_in(&self, seen: &Seen) -> (u16, Value) {
        let typed = |key: &str| seen.body.as_ref().and_then(|body| body[key].as_str());
        if typed("Username") != Some(&self.username) || typed("Pw") != Some(&self.password) {
            return (401, Value::Null);
        }
        let mut granted = fixture(include_str!("fixtures/authenticated.json"));
        granted["AccessToken"] = json!(self.token);
        (200, granted)
    }

    fn holds_the_token(&self, seen: &Seen) -> bool {
        let token = format!("Token=\"{}\"", self.token);
        let sent = seen.authorization.as_deref().unwrap_or_default();
        sent.contains(&token) && !self.revoked.load(Ordering::SeqCst)
    }

    fn answer(&self, seen: &Seen) -> (u16, Value) {
        let open = [JELLYFIN.server.path, JELLYFIN.sign_in.path].contains(&seen.path.as_str());
        if !open && !self.holds_the_token(seen) {
            return (401, Value::Null);
        }
        match self.rules.iter().find(|rule| rule.answers(seen)) {
            Some(rule) => (rule.status, rule.body.clone()),
            None if seen.path == JELLYFIN.sign_in.path => self.signs_in(seen),
            None if seen.path == JELLYFIN.items.path => {
                (200, json!({ "Items": [], "TotalRecordCount": 0 }))
            }
            None => (404, Value::Null),
        }
    }
}

impl Web for Recorded {
    fn send(&self, request: &Request) -> Result<Answer> {
        let path = request
            .url
            .strip_prefix(&self.address)
            .ok_or_else(|| anyhow!("could not connect to {}", request.url))?;
        let seen = Seen {
            method: request.method,
            path: path.to_string(),
            query: request
                .query
                .iter()
                .map(|(name, value)| (name.to_string(), value.clone()))
                .collect(),
            authorization: request.authorization.clone(),
            body: request.body.clone(),
        };
        let (status, body) = self.answer(&seen);
        self.seen.lock().unwrap().push(seen);
        Ok(Answer {
            status,
            location: body["Location"].as_str().map(str::to_string),
            body: if body.is_null() {
                b"Error processing request.".to_vec()
            } else {
                serde_json::to_vec(&body)?
            },
        })
    }
}

pub(crate) struct World {
    pub(crate) importer: Importer,
    pub(crate) jellyfin: Arc<Recorded>,
    _store: TempPool,
}

impl World {
    pub(crate) fn over(jellyfin: Recorded) -> Self {
        let store = store();
        let jellyfin = Arc::new(jellyfin);
        Self {
            importer: Importer {
                store: (*store).clone(),
                web: jellyfin.clone(),
                dialect: &JELLYFIN,
            },
            jellyfin,
            _store: store,
        }
    }

    pub(crate) fn form(&self, url: &str, username: &str) -> ConnectAsk {
        form(url, username, self.jellyfin.password())
    }

    pub(crate) fn signed_in(&self) -> String {
        match self.importer.connect(&self.form(ADDRESS, "sam")).unwrap() {
            Connected::Ready { sign_in, .. } => sign_in,
            Connected::Refused { reason, .. } => panic!("the sign-in was refused: {reason:?}"),
        }
    }
}

pub(crate) fn form(url: &str, username: &str, password: &str) -> ConnectAsk {
    let fields = [("url", url), ("username", username), ("password", password)];
    ConnectAsk {
        fields: fields
            .into_iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect(),
        pending: None,
    }
}

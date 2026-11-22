use std::sync::Mutex;

use anyhow::{anyhow, Result};

use crate::web::{Answer, Call, Door, Web};

/// One call the importer made, as the fake network saw it.
#[derive(Debug, Clone)]
pub(crate) struct Seen {
    pub method: &'static str,
    pub door: Door,
    pub url: String,
    pub sent: Vec<(String, String)>,
    pub form: Vec<(String, String)>,
}

impl Seen {
    /// A query parameter, a header or a form field of the call.
    pub(crate) fn value(&self, name: &str) -> Option<&str> {
        self.sent
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.as_str())
    }
}

/// Which calls an answer is for: a method, a URL, and any query parameter,
/// header or form field the call must carry.
pub(crate) struct When {
    method: &'static str,
    url: String,
    needs: Vec<(String, String)>,
}

pub(crate) fn get(url: &str) -> When {
    When {
        method: "GET",
        url: url.to_string(),
        needs: Vec::new(),
    }
}

pub(crate) fn post(url: &str) -> When {
    When {
        method: "POST",
        ..get(url)
    }
}

impl When {
    pub(crate) fn with(mut self, name: &str, value: &str) -> Self {
        self.needs.push((name.to_string(), value.to_string()));
        self
    }

    fn matches(&self, seen: &Seen) -> bool {
        self.method == seen.method
            && self.url == seen.url
            && self
                .needs
                .iter()
                .all(|(name, value)| seen.value(name) == Some(value.as_str()))
    }
}

enum Then {
    Answer(u16, Vec<u8>),
    Silence,
}

/// plex.tv and a server, answering from what a test recorded. The answer for a
/// call is the most specific one that matches it, and the latest of two alike.
/// A call nothing was recorded for is not answered.
#[derive(Default)]
pub(crate) struct Recorded {
    rules: Mutex<Vec<(When, Then)>>,
    seen: Mutex<Vec<Seen>>,
}

impl Recorded {
    pub(crate) fn answers(&self, when: When, status: u16, body: &str) {
        let then = Then::Answer(status, body.as_bytes().to_vec());
        self.rules.lock().unwrap().push((when, then));
    }

    pub(crate) fn is_silent(&self, when: When) {
        self.rules.lock().unwrap().push((when, Then::Silence));
    }

    pub(crate) fn seen(&self) -> Vec<Seen> {
        self.seen.lock().unwrap().clone()
    }

    pub(crate) fn asked(&self, url: &str) -> Vec<Seen> {
        let mut seen = self.seen();
        seen.retain(|call| call.url == url);
        seen
    }

    fn answer(&self, seen: Seen) -> Result<Answer> {
        self.seen.lock().unwrap().push(seen.clone());
        let rules = self.rules.lock().unwrap();
        let best = rules
            .iter()
            .filter(|(when, _)| when.matches(&seen))
            .max_by_key(|(when, _)| when.needs.len());
        match best {
            Some((_, Then::Answer(status, body))) => Ok(Answer {
                status: *status,
                body: body.clone(),
            }),
            Some((_, Then::Silence)) => Err(anyhow!("{} did not answer", seen.url)),
            None => Err(anyhow!("nothing recorded for {} {}", seen.method, seen.url)),
        }
    }
}

fn seen(method: &'static str, call: &Call, form: &[(&str, &str)]) -> Seen {
    let pairs = call.query.iter().chain(&call.headers);
    let form: Vec<(String, String)> = form
        .iter()
        .map(|(name, value)| (name.to_string(), value.to_string()))
        .collect();
    let mut sent: Vec<(String, String)> = pairs
        .map(|(name, value)| (name.to_string(), value.clone()))
        .collect();
    sent.extend(form.iter().cloned());
    Seen {
        method,
        door: call.door,
        url: call.url.clone(),
        sent,
        form,
    }
}

impl Web for Recorded {
    fn get(&self, call: &Call) -> Result<Answer> {
        self.answer(seen("GET", call, &[]))
    }

    fn post(&self, call: &Call, form: &[(&str, &str)]) -> Result<Answer> {
        self.answer(seen("POST", call, form))
    }
}

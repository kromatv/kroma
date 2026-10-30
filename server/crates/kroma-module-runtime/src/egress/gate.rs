//! The sidecar's gate: each outbound call is ruled by the core, and a ruling is
//! kept a few seconds per purpose, host and port so a burst asks once.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use kroma_http::egress::{Decision, Outgoing, Ruling};
use kroma_module_wire::{NetworkAction, NetworkAnswer, NetworkAsk};

const RULING_TTL: Duration = Duration::from_secs(5);
const MAX_CACHED: usize = 1024;

pub(crate) enum Asked {
    Answer(NetworkAnswer),
    NoPolicy,
    Unreachable,
}

type Key = (&'static str, String, u16);

pub(crate) struct Gate<A> {
    ask: A,
    cache: Mutex<HashMap<Key, (Instant, Ruling)>>,
}

impl<A: Fn(&NetworkAsk) -> Asked> Gate<A> {
    pub(crate) fn new(ask: A) -> Self {
        Self {
            ask,
            cache: Mutex::new(HashMap::new()),
        }
    }

    pub(crate) fn rule(&self, outgoing: &Outgoing) -> Ruling {
        let key = (
            outgoing.purpose,
            outgoing.target.host.clone(),
            outgoing.target.port,
        );
        if let Some(ruling) = self.cached(&key) {
            return ruling;
        }
        let asked = (self.ask)(&NetworkAsk {
            purpose: outgoing.purpose.to_string(),
            method: outgoing.method.to_string(),
            host: outgoing.target.host.clone(),
            port: outgoing.target.port,
            https: outgoing.target.https,
        });
        let ruling = match asked {
            Asked::Answer(answer) => ruling_of(answer),
            // A core that predates the policy has none to apply, so the call
            // goes where it always went.
            Asked::NoPolicy => Decision::Direct.into(),
            Asked::Unreachable => {
                return Decision::Block("the core's network policy is unreachable".into()).into();
            }
        };
        let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        if cache.len() >= MAX_CACHED {
            cache.clear();
        }
        cache.insert(key, (Instant::now(), ruling.clone()));
        ruling
    }

    fn cached(&self, key: &Key) -> Option<Ruling> {
        let cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        let (at, ruling) = cache.get(key)?;
        (at.elapsed() < RULING_TTL).then(|| ruling.clone())
    }
}

fn ruling_of(answer: NetworkAnswer) -> Ruling {
    let decision = match answer.action {
        NetworkAction::Direct => Decision::Direct,
        NetworkAction::Vpn => answer.proxy.map_or_else(
            || Decision::Block("the core routed this call to a VPN it did not name".into()),
            Decision::Proxy,
        ),
        NetworkAction::Block => Decision::Block(
            answer
                .reason
                .unwrap_or_else(|| "refused by the core".to_string()),
        ),
    };
    Ruling {
        decision,
        rule: answer.rule,
    }
}

#[cfg(test)]
mod tests;

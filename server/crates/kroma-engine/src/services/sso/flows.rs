//! Sign-ins in flight: started by a client, away at the provider, back with an
//! outcome nobody has collected yet. Held in memory, gone in ten minutes.

use std::collections::HashMap;
use std::sync::Mutex;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use sha2::{Digest, Sha256};

use super::admit::Outcome;
use crate::services::auth::{ct_eq, random_token};

pub const FLOW_TTL_SECS: i64 = 600;
const MAX_OPEN: usize = 2048;
// Starting a flow needs no account, so one address cannot fill the store. A
// household behind one proxy shares an address, hence the room.
const MAX_OPEN_PER_ADDRESS: usize = 32;

/// What a sign-in is for.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Intent {
    SignIn { invite: Option<String> },
    /// Adds the identity to the account that started the flow.
    Link { user_id: String },
    /// An admin trying a provider: proves the connection and admits nobody.
    Test { user_id: String },
}

/// What the callback needs to finish the conversation a start began.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Flow {
    pub id: String,
    pub provider_id: String,
    /// The provider's connection when the flow began. A flow does not outlive
    /// a change to it.
    pub fingerprint: String,
    pub intent: Intent,
    /// Where the browser left from, and where it is sent back.
    pub origin: String,
    pub redirect_uri: String,
    pub nonce: String,
    pub verifier: String,
}

/// What a start hands back: the two halves the client keeps, and what goes
/// into the provider's URL.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Started {
    pub id: String,
    pub secret: String,
    pub state: String,
    pub nonce: String,
    pub challenge: String,
}

pub struct NewFlow {
    pub provider_id: String,
    pub fingerprint: String,
    pub intent: Intent,
    pub origin: String,
    pub redirect_uri: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Collected {
    /// No such flow, or one of the two halves is wrong. The two read alike.
    Unknown,
    /// The person is still at the provider.
    Pending,
    Done(Box<(Flow, Outcome)>),
}

enum Stage {
    AtProvider,
    Exchanging,
    Back { code: [u8; 32], outcome: Outcome },
}

struct Entry {
    flow: Flow,
    secret: [u8; 32],
    state: String,
    address: String,
    expires: i64,
    stage: Stage,
}

fn digest(value: &str) -> [u8; 32] {
    Sha256::digest(value.as_bytes()).into()
}

/// The PKCE challenge of `verifier` (RFC 7636, S256).
pub fn challenge_of(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

#[derive(Default)]
pub struct Flows {
    open: Mutex<HashMap<String, Entry>>,
}

impl Flows {
    /// Opens a flow, or `None` while the store or this address is at its limit.
    pub fn start(&self, new: NewFlow, address: &str, now: i64) -> Option<Started> {
        let mut open = self.open.lock().ok()?;
        open.retain(|_, entry| entry.expires > now);
        let from_here = open.values().filter(|e| e.address == address).count();
        if open.len() >= MAX_OPEN || from_here >= MAX_OPEN_PER_ADDRESS {
            return None;
        }
        let verifier = random_token();
        let started = Started {
            id: random_token(),
            secret: random_token(),
            state: random_token(),
            nonce: random_token(),
            challenge: challenge_of(&verifier),
        };
        open.insert(
            started.id.clone(),
            Entry {
                flow: Flow {
                    id: started.id.clone(),
                    provider_id: new.provider_id,
                    fingerprint: new.fingerprint,
                    intent: new.intent,
                    origin: new.origin,
                    redirect_uri: new.redirect_uri,
                    nonce: started.nonce.clone(),
                    verifier,
                },
                secret: digest(&started.secret),
                state: started.state.clone(),
                address: address.to_string(),
                expires: now + FLOW_TTL_SECS,
                stage: Stage::AtProvider,
            },
        );
        Some(started)
    }

    /// The flow a provider's redirect answers. A `state` is good for one
    /// arrival: a second one finds nothing.
    pub fn arrive(&self, state: &str, now: i64) -> Option<Flow> {
        let mut open = self.open.lock().ok()?;
        let entry = open.values_mut().find(|entry| {
            entry.expires > now
                && matches!(entry.stage, Stage::AtProvider)
                && ct_eq(entry.state.as_bytes(), state.as_bytes())
        })?;
        entry.stage = Stage::Exchanging;
        Some(entry.flow.clone())
    }

    /// Parks the outcome and mints the code the browser carries back.
    pub fn settle(&self, id: &str, outcome: Outcome) -> Option<String> {
        let mut open = self.open.lock().ok()?;
        let entry = open.get_mut(id)?;
        if !matches!(entry.stage, Stage::Exchanging) {
            return None;
        }
        let code = random_token();
        entry.stage = Stage::Back {
            code: digest(&code),
            outcome,
        };
        Some(code)
    }

    /// Hands the outcome to whoever holds both halves: the secret the start
    /// returned and the code the redirect carried. An outcome that still has
    /// an identity to claim stays until it lapses; any other is given once.
    pub fn collect(&self, id: &str, secret: &str, code: &str, now: i64) -> Collected {
        let Ok(mut open) = self.open.lock() else {
            return Collected::Unknown;
        };
        let Some(entry) = open.get(id).filter(|entry| entry.expires > now) else {
            return Collected::Unknown;
        };
        if !ct_eq(&entry.secret, &digest(secret)) {
            return Collected::Unknown;
        }
        let Stage::Back { code: minted, outcome } = &entry.stage else {
            return Collected::Pending;
        };
        if !ct_eq(minted, &digest(code)) {
            return Collected::Unknown;
        }
        let done = Collected::Done(Box::new((entry.flow.clone(), outcome.clone())));
        if !outcome.can_be_claimed() {
            open.remove(id);
        }
        done
    }

    /// Ends a flow whose identity an account just claimed.
    pub fn close(&self, id: &str) {
        if let Ok(mut open) = self.open.lock() {
            open.remove(id);
        }
    }
}

#[cfg(test)]
mod tests;

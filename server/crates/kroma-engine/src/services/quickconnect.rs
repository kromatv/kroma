//! Quick Connect device pairing (Plex/Jellyfin-style): a device shows a short
//! code, a signed-in user approves it, and the device polls with its private
//! secret until it gets a session token. State is in-memory behind a `Mutex`.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::services::auth::{random_token, random_u32};
use crate::model::User;

pub const CODE_TTL_SECS: i64 = 300;
const CODE_DIGITS: u32 = 4;
// `initiate` is unauthenticated by design, so this bounds the map against a
// flood. It also keeps the map sparse against the 10^CODE_DIGITS keyspace, so
// the code-generation loop below stays collision-free.
const MAX_PENDING: usize = 256;

struct Pending {
    secret: String,
    created_at: i64,
    user: Option<User>,
    token: Option<String>,
    access_token: Option<String>,
}

pub struct QuickConnectInner {
    // Keyed by the human-facing code.
    map: Mutex<HashMap<String, Pending>>,
}

pub type QuickConnect = Arc<QuickConnectInner>;

pub struct Initiated {
    pub code: String,
    pub secret: String,
    pub expires_in: i64,
}

pub enum PollState {
    Pending,
    Authorized { token: String, access_token: String, user: Box<User> },
    Unknown,
}

/// Tokens attached to a pending code, present only once it was approved.
pub struct RevokedTokens {
    pub token: String,
    pub access_token: String,
}

pub fn new() -> QuickConnect {
    Arc::new(QuickConnectInner { map: Mutex::new(HashMap::new()) })
}

fn now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

impl QuickConnectInner {
    fn reap(map: &mut HashMap<String, Pending>) {
        let cutoff = now() - CODE_TTL_SECS;
        map.retain(|_, p| p.created_at > cutoff);
    }

    /// Create a pending request → a unique code + a private secret.
    pub fn initiate(&self) -> Initiated {
        let mut map = self.map.lock().unwrap();
        Self::reap(&mut map);
        // At capacity, evict the oldest rather than refuse: pairing always issues
        // a code, and the evicted device simply re-initiates.
        while map.len() >= MAX_PENDING {
            let Some(oldest) = map.iter().min_by_key(|(_, p)| p.created_at).map(|(c, _)| c.clone())
            else {
                break;
            };
            map.remove(&oldest);
        }
        let modulo = 10u32.pow(CODE_DIGITS);
        let code = loop {
            let candidate = format!("{:0>width$}", random_u32() % modulo, width = CODE_DIGITS as usize);
            if !map.contains_key(&candidate) {
                break candidate;
            }
        };
        let secret = random_token();
        map.insert(
            code.clone(),
            Pending {
                secret: secret.clone(),
                created_at: now(),
                user: None,
                token: None,
                access_token: None,
            },
        );
        Initiated { code, secret, expires_in: CODE_TTL_SECS }
    }

    /// Approve a code for `user`, attaching a freshly-minted session `token` and
    /// the device's long-lived `access_token`. Returns false if unknown/expired.
    pub fn authorize(&self, code: &str, user: User, token: String, access_token: String) -> bool {
        let mut map = self.map.lock().unwrap();
        Self::reap(&mut map);
        match map.get_mut(code) {
            Some(p) => {
                p.user = Some(user);
                p.token = Some(token);
                p.access_token = Some(access_token);
                true
            }
            None => false,
        }
    }

    /// Forget the pending entry whose secret matches. Returns any tokens it had
    /// already accrued — approved in the gap before the device rotated its code,
    /// so nobody will ever collect them — for the caller to delete.
    pub fn revoke(&self, secret: &str) -> Option<RevokedTokens> {
        let mut map = self.map.lock().unwrap();
        Self::reap(&mut map);
        let code = map
            .iter()
            .find(|(_, p)| super::auth::ct_eq(p.secret.as_bytes(), secret.as_bytes()))
            .map(|(c, _)| c.clone())?;
        let entry = map.remove(&code)?;
        match (entry.token, entry.access_token) {
            (Some(token), Some(access_token)) => Some(RevokedTokens { token, access_token }),
            _ => None,
        }
    }

    /// Poll by secret. Once authorized, the entry is consumed and its token +
    /// user returned.
    pub fn poll(&self, secret: &str) -> PollState {
        let mut map = self.map.lock().unwrap();
        Self::reap(&mut map);
        let Some(code) = map
            .iter()
            .find(|(_, p)| super::auth::ct_eq(p.secret.as_bytes(), secret.as_bytes()))
            .map(|(c, _)| c.clone())
        else {
            return PollState::Unknown;
        };
        let entry = map.get(&code).expect("entry present");
        match (entry.token.clone(), entry.access_token.clone(), entry.user.clone()) {
            (Some(token), Some(access_token), Some(user)) => {
                map.remove(&code);
                PollState::Authorized { token, access_token, user: Box::new(user) }
            }
            _ => PollState::Pending,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn revoke_forgets_a_pending_code() {
        let qc = new();
        let init = qc.initiate();
        assert!(qc.revoke(&init.secret).is_none());
        assert!(matches!(qc.poll(&init.secret), PollState::Unknown));
        assert!(qc.revoke("nope").is_none());
    }

    #[test]
    fn initiate_is_capped_under_flood() {
        let qc = new();
        for _ in 0..(MAX_PENDING + 100) {
            qc.initiate();
        }
        assert!(qc.map.lock().unwrap().len() <= MAX_PENDING);
    }
}

//! The screens signed-in devices offered to describe, and the requests an admin
//! has open against them. In memory only: a screen is listed for as long as the
//! event socket that said hello stays open, and a request for as long as the
//! call waiting on it.

mod screen;

#[cfg(test)]
mod tests;

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use kroma_primitives::clean_label;
use serde::Serialize;
use tokio::sync::oneshot;

pub use screen::{PropValue, Screen, ScreenBox, ScreenRow, MAX_ROWS};

/// How long a request waits for its device to answer.
pub const REPLY_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_SCREENS_PER_USER: usize = 16;
const MAX_SCREENS: usize = 256;
const MAX_PENDING_PER_USER: usize = 4;
const MAX_NAME: usize = 48;
const MAX_PLATFORM: usize = 32;

/// One live screen, as its own account's roster lists it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ScreenDevice {
    pub id: String,
    pub name: String,
    pub platform: String,
}

/// The account and the event socket a message arrived on.
#[derive(Clone, Copy, Debug)]
pub struct Origin<'a> {
    pub user_id: &'a str,
    pub connection: u64,
}

/// A device's answer to one request.
#[derive(Debug)]
pub struct ScreenReply {
    pub request_id: String,
    pub screen: Screen,
}

/// Why a request was not sent. `Unknown` covers a missing screen and another
/// account's alike.
#[derive(Debug, PartialEq, Eq)]
pub enum Refused {
    Unknown,
    Busy,
}

struct Entry {
    owner: String,
    device: ScreenDevice,
    connection: u64,
}

struct Pending {
    owner: String,
    screen_id: String,
    answer: oneshot::Sender<Screen>,
}

#[derive(Default)]
struct Inner {
    roster: Vec<Entry>,
    pending: HashMap<String, Pending>,
}

impl Inner {
    fn speaks_for(&self, from: Origin<'_>, pending: &Pending) -> bool {
        pending.owner == from.user_id
            && self.roster.iter().any(|e| {
                e.connection == from.connection
                    && e.owner == pending.owner
                    && e.device.id == pending.screen_id
            })
    }

    fn has_room(&self, user_id: &str) -> bool {
        let own = self.roster.iter().filter(|e| e.owner == user_id).count();
        own < MAX_SCREENS_PER_USER && self.roster.len() < MAX_SCREENS
    }

    fn refusal(&self, user_id: &str, screen_id: &str) -> Option<Refused> {
        let listed = |e: &Entry| e.owner == user_id && e.device.id == screen_id;
        if !self.roster.iter().any(listed) {
            return Some(Refused::Unknown);
        }
        let open = self.pending.values().filter(|p| p.owner == user_id);
        (open.count() >= MAX_PENDING_PER_USER).then_some(Refused::Busy)
    }
}

/// The roster of live screens and the requests waiting on them.
#[derive(Default)]
pub struct Screens {
    inner: Mutex<Inner>,
    connections: AtomicU64,
}

impl Screens {
    /// A number naming one event socket for the life of the process.
    pub fn connection(&self) -> u64 {
        self.connections.fetch_add(1, Ordering::Relaxed) + 1
    }

    /// Lists `device` as the screen on `from`'s socket, in place of whatever
    /// that socket, or an older socket of the same account, listed before.
    /// False when the id is malformed or the roster is full.
    pub fn hello(&self, from: Origin<'_>, device: ScreenDevice) -> bool {
        if !kroma_primitives::valid_device_id(&device.id) {
            return false;
        }
        let device = ScreenDevice {
            name: clean_label(&device.name, MAX_NAME),
            platform: clean_label(&device.platform, MAX_PLATFORM),
            id: device.id,
        };
        let mut inner = self.lock();
        inner.roster.retain(|e| {
            e.connection != from.connection && (e.owner != from.user_id || e.device.id != device.id)
        });
        if !inner.has_room(from.user_id) {
            return false;
        }
        inner.roster.push(Entry {
            owner: from.user_id.to_string(),
            device,
            connection: from.connection,
        });
        true
    }

    /// Drops the screen a closed socket listed, and fails the requests that
    /// were waiting on it.
    pub fn forget(&self, connection: u64) {
        let mut inner = self.lock();
        let gone: Vec<(String, String)> = inner
            .roster
            .iter()
            .filter(|e| e.connection == connection)
            .map(|e| (e.owner.clone(), e.device.id.clone()))
            .collect();
        inner.roster.retain(|e| e.connection != connection);
        inner.pending.retain(|_, p| {
            !gone
                .iter()
                .any(|(owner, id)| *owner == p.owner && *id == p.screen_id)
        });
    }

    /// The live screens signed in as `user_id`.
    pub fn roster(&self, user_id: &str) -> Vec<ScreenDevice> {
        let inner = self.lock();
        inner
            .roster
            .iter()
            .filter(|e| e.owner == user_id)
            .map(|e| e.device.clone())
            .collect()
    }

    /// Opens a request to `user_id`'s screen `screen_id`. The request stays
    /// open until the returned [`Asked`] is answered or dropped.
    pub fn ask(&self, user_id: &str, screen_id: &str) -> Result<Asked<'_>, Refused> {
        let mut inner = self.lock();
        if let Some(refused) = inner.refusal(user_id, screen_id) {
            return Err(refused);
        }
        let request_id = kroma_primitives::random_token();
        let (answer, reply) = oneshot::channel();
        let pending = Pending {
            owner: user_id.to_string(),
            screen_id: screen_id.to_string(),
            answer,
        };
        inner.pending.insert(request_id.clone(), pending);
        Ok(Asked {
            screens: self,
            request_id,
            reply,
        })
    }

    /// Hands `reply` to the request waiting on it, when it comes from the
    /// socket that said hello as the screen the request names. False otherwise.
    pub fn answer(&self, from: Origin<'_>, reply: ScreenReply) -> bool {
        if !reply.screen.within_bounds() {
            return false;
        }
        let mut inner = self.lock();
        let accepted = inner
            .pending
            .get(&reply.request_id)
            .is_some_and(|p| inner.speaks_for(from, p));
        if !accepted {
            return false;
        }
        inner
            .pending
            .remove(&reply.request_id)
            .is_some_and(|p| p.answer.send(reply.screen).is_ok())
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// One open request. Dropping it closes the request, whichever way the wait
/// ended.
pub struct Asked<'a> {
    screens: &'a Screens,
    request_id: String,
    reply: oneshot::Receiver<Screen>,
}

impl Asked<'_> {
    /// The id the device has to quote in its answer.
    pub fn request_id(&self) -> &str {
        &self.request_id
    }

    /// The device's screen, or `None` when it did not answer `within` or went
    /// away first.
    pub async fn answer(&mut self, within: Duration) -> Option<Screen> {
        tokio::time::timeout(within, &mut self.reply)
            .await
            .ok()?
            .ok()
    }
}

impl Drop for Asked<'_> {
    fn drop(&mut self) {
        self.screens.lock().pending.remove(&self.request_id);
    }
}

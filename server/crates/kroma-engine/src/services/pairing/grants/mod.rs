//! The store both pairing flows share: a pending request filed under a public
//! handle, holding a private poll secret and whatever the flow needs to describe
//! itself, approved once by a signed-in account and collected exactly once.
//!
//! In-memory behind a `Mutex` and swept by TTL on every access: a pairing that
//! did not complete inside its window is worth nothing, so nothing here outlives
//! a restart.

mod decide;
mod insert;

#[cfg(test)]
mod test_support;

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use crate::model::User;
use crate::services::auth::ct_eq;

/// The tokens a device collects on the poll that finds its request approved.
pub struct Granted {
    pub token: String,
    pub access_token: String,
    pub user: User,
}

/// What a poll by secret found. `Unknown` covers both "never existed" and
/// "lapsed": a device that cannot tell them apart simply starts over.
pub enum PollState {
    Pending,
    Authorized {
        token: String,
        access_token: String,
        user: Box<User>,
    },
    Unknown,
}

/// Tokens minted for a request nobody will ever collect: approved in the gap
/// before the device rotated or dropped its handle. The caller deletes them.
pub struct Orphaned {
    pub token: String,
    pub access_token: String,
}

/// A filed request: the public handle it answers to, and the secret only the
/// device that filed it holds.
pub struct Filed {
    pub handle: String,
    pub secret: String,
}

/// What [`Grants::replace_scoped`] did. The caller's own prior entries are gone
/// either way, and their tokens ride back in `orphans` for the caller to delete.
pub struct ScopedInsert {
    pub filed: Option<Filed>,
    pub orphans: Vec<Orphaned>,
}

/// What an approval rule decided about a caller. `Burn` refuses AND takes the
/// entry down for good, which is how a flow ends a request that has been asked
/// wrongly once too often; its tokens go to the orphanage like any other lapse.
pub enum Verdict<R> {
    Approve,
    Refuse(R),
    Burn(R),
}

/// What came of [`Grants::decide`]. `Gone` is an unknown handle, a lapsed entry
/// or one already approved: three things a caller may not tell apart, and which
/// therefore carry no reason of their own.
pub enum Decided<R> {
    Approved,
    Refused(R),
    Gone,
}

struct Entry<M> {
    secret: String,
    fresh_at: i64,
    // Bumped on every insert and heartbeat. `fresh_at` has second granularity,
    // so under the flood that eviction exists for every entry shares a
    // timestamp; this is what still orders them least-recently-active first.
    seen: u64,
    meta: M,
    granted: Option<Granted>,
}

impl<M> Entry<M> {
    fn orphaned(self) -> Option<Orphaned> {
        let g = self.granted?;
        Some(Orphaned {
            token: g.token,
            access_token: g.access_token,
        })
    }
}

pub struct Grants<M> {
    map: Mutex<HashMap<String, Entry<M>>>,
    // Tokens belonging to entries that left without anyone asking: swept by the
    // TTL, or evicted. Every OTHER removal path hands its `Orphaned` back to the
    // caller directly; these two have no caller to hand them to, and the tokens
    // are real rows in SQLite that nothing else will ever delete. Drained by
    // `take_orphans` from the HTTP layer, which knows how to delete them.
    orphanage: Mutex<Vec<Orphaned>>,
    ttl_secs: i64,
    capacity: usize,
}

fn now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

static SEEN: AtomicU64 = AtomicU64::new(0);

fn tick() -> u64 {
    SEEN.fetch_add(1, Ordering::Relaxed)
}

impl<M> Grants<M> {
    /// `capacity` bounds an endpoint that is unauthenticated by design against a
    /// flood, and keeps the map sparse enough that a small handle keyspace still
    /// mints collision-free. It must be at least 1: [`Self::insert`] refuses a
    /// full store outright, and [`Self::replace_scoped`] only ever gets in by
    /// taking a slot off whichever scope holds the most.
    pub fn new(ttl_secs: i64, capacity: usize) -> Self {
        debug_assert!(
            capacity > 0,
            "a grant store with no capacity can hold nothing"
        );
        Self {
            map: Mutex::new(HashMap::new()),
            orphanage: Mutex::new(Vec::new()),
            ttl_secs,
            capacity,
        }
    }

    fn reap(&self, map: &mut HashMap<String, Entry<M>>) {
        let cutoff = now() - self.ttl_secs;
        let lapsed: Vec<String> = map
            .iter()
            .filter(|(_, e)| e.fresh_at <= cutoff)
            .map(|(h, _)| h.clone())
            .collect();
        for handle in lapsed {
            self.abandon(map.remove(&handle));
        }
    }

    // A device that was approved and then never came back still had tokens
    // minted for it. Losing the entry must not lose them.
    fn abandon(&self, entry: Option<Entry<M>>) {
        if let Some(orphan) = entry.and_then(Entry::orphaned) {
            self.orphanage.lock().unwrap().push(orphan);
        }
    }

    /// Take the tokens of everything that lapsed or was evicted since the last
    /// call, for the caller to delete. Empty almost always.
    pub fn take_orphans(&self) -> Vec<Orphaned> {
        std::mem::take(&mut *self.orphanage.lock().unwrap())
    }

    fn handle_for(map: &HashMap<String, Entry<M>>, secret: &str) -> Option<String> {
        map.iter()
            .find(|(_, e)| ct_eq(e.secret.as_bytes(), secret.as_bytes()))
            .map(|(handle, _)| handle.clone())
    }

    #[cfg(test)]
    pub(super) fn len(&self) -> usize {
        self.map.lock().unwrap().len()
    }

    /// Test seam: push every entry `secs` further into the past, so a sweep can
    /// be watched without one.
    #[cfg(test)]
    pub(super) fn age(&self, secs: i64) {
        for entry in self.map.lock().unwrap().values_mut() {
            entry.fresh_at -= secs;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::{file, granted, grants, seq_mint};
    use super::*;

    #[test]
    fn a_lapsed_request_is_swept_on_the_next_touch_of_the_store() {
        let g: Grants<&str> = Grants::new(0, 4);
        let (_, secret) = file(&g, "tv", seq_mint());
        assert!(matches!(g.poll(&secret), PollState::Unknown));
        assert_eq!(g.len(), 0);
    }

    #[test]
    fn a_request_swept_after_it_was_approved_surrenders_its_tokens() {
        // The device was approved and then never came back: unplugged, or its
        // wifi went. The tokens minted for it are real rows in SQLite, and
        // losing the entry must not lose them.
        let g = grants();
        let (handle, _) = file(&g, "tv", seq_mint());
        assert!(g.authorize(&handle, |_| true, granted()));
        assert!(g.take_orphans().is_empty(), "nothing has lapsed yet");

        g.age(400);
        assert!(
            matches!(g.poll("anything"), PollState::Unknown),
            "the sweep ran"
        );

        let orphans = g.take_orphans();
        assert_eq!(
            orphans.len(),
            1,
            "the swept approval surrendered its tokens"
        );
        assert_eq!(orphans[0].token, "tok");
        assert!(g.take_orphans().is_empty(), "draining twice yields nothing");
    }

    #[test]
    fn a_request_swept_before_anyone_approved_it_surrenders_nothing() {
        let g = grants();
        file(&g, "tv", seq_mint());
        g.age(400);
        assert!(matches!(g.poll("anything"), PollState::Unknown));
        assert!(g.take_orphans().is_empty(), "no tokens were ever minted");
    }
}

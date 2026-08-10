//! The store both pairing flows share: a pending request filed under a public
//! handle, holding a private poll secret and whatever the flow needs to describe
//! itself, approved once by a signed-in account and collected exactly once.
//!
//! In-memory behind a `Mutex` and swept by TTL on every access: a pairing that
//! did not complete inside its window is worth nothing, so nothing here outlives
//! a restart.

use std::collections::HashMap;
use std::hash::Hash;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use crate::model::User;
use crate::services::auth::{ct_eq, random_token};

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
    Authorized { token: String, access_token: String, user: Box<User> },
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
        Some(Orphaned { token: g.token, access_token: g.access_token })
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
        debug_assert!(capacity > 0, "a grant store with no capacity can hold nothing");
        Self {
            map: Mutex::new(HashMap::new()),
            orphanage: Mutex::new(Vec::new()),
            ttl_secs,
            capacity,
        }
    }

    fn reap(&self, map: &mut HashMap<String, Entry<M>>) {
        let cutoff = now() - self.ttl_secs;
        let lapsed: Vec<String> =
            map.iter().filter(|(_, e)| e.fresh_at <= cutoff).map(|(h, _)| h.clone()).collect();
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

    /// File `meta` under the first free handle `mint` produces, or None when the
    /// store is full.
    ///
    /// Full REFUSES rather than evicting. Eviction is what an unauthenticated
    /// endpoint must not do: whoever calls most often would otherwise decide
    /// whose pairing survives, and a few requests a second would keep every
    /// honest device out of every list. A caller that must not be refused files
    /// through [`Self::replace_scoped`], which takes room from whichever scope
    /// holds the most rather than from whoever happens to be oldest.
    pub fn insert(&self, meta: M, mut mint: impl FnMut() -> String) -> Option<Filed> {
        let mut map = self.map.lock().unwrap();
        self.reap(&mut map);
        if map.len() >= self.capacity {
            return None;
        }
        Some(Self::file(&mut map, meta, &mut mint))
    }

    /// File `meta` in its own scope, replacing whatever the same caller filed
    /// before, under ONE lock: forgetting, counting and inserting in three calls
    /// is a race where a device re-announcing frees its slot and loses it to
    /// whoever asked in between.
    ///
    /// A scope already holding `scope_limit` is refused, because those slots
    /// belong to the devices that took them. A full STORE is not: it takes the
    /// least-recently-seen entry of whichever OTHER scope holds the most, so a
    /// flood spread across many scopes is displaced by the callers it was
    /// crowding out and no scope can cost another one its place. Only a store
    /// holding nothing outside the caller's own scope refuses.
    pub fn replace_scoped<K: Eq + Hash>(
        &self,
        mine: impl Fn(&M) -> bool,
        scope_of: impl Fn(&M) -> K,
        scope_limit: usize,
        meta: M,
        mut mint: impl FnMut() -> String,
    ) -> ScopedInsert {
        let mut map = self.map.lock().unwrap();
        self.reap(&mut map);

        let previous: Vec<String> =
            map.iter().filter(|(_, e)| mine(&e.meta)).map(|(h, _)| h.clone()).collect();
        let orphans: Vec<Orphaned> = previous
            .into_iter()
            .filter_map(|handle| map.remove(&handle))
            .filter_map(Entry::orphaned)
            .collect();

        let scope = scope_of(&meta);
        if map.values().filter(|e| scope_of(&e.meta) == scope).count() >= scope_limit {
            return ScopedInsert { filed: None, orphans };
        }
        if map.len() >= self.capacity {
            let Some(handle) = crowded_out(&map, &scope_of, &scope) else {
                return ScopedInsert { filed: None, orphans };
            };
            self.abandon(map.remove(&handle));
        }
        ScopedInsert { filed: Some(Self::file(&mut map, meta, &mut mint)), orphans }
    }

    fn file(
        map: &mut HashMap<String, Entry<M>>,
        meta: M,
        mint: &mut impl FnMut() -> String,
    ) -> Filed {
        let handle = loop {
            let candidate = mint();
            if !map.contains_key(&candidate) {
                break candidate;
            }
        };
        let secret = random_token();
        map.insert(
            handle.clone(),
            Entry { secret: secret.clone(), fresh_at: now(), seen: tick(), meta, granted: None },
        );
        Filed { handle, secret }
    }

    /// Approve `handle` for a request whose metadata satisfies `allowed`. False
    /// when the handle is unknown, lapsed, fails the predicate, or was ALREADY
    /// approved. All four answer "no such device", which is all a caller may
    /// learn.
    ///
    /// Refusing the second approval is what makes this one-shot in both
    /// directions. Overwriting would silently discard the first approver's
    /// tokens (rows in SQLite that nothing would then delete) and hand the
    /// device to whoever asked last, which is not a race a pairing flow should
    /// have: two phones can see one waiting television, and so can one phone
    /// twice.
    pub fn authorize(&self, handle: &str, allowed: impl Fn(&M) -> bool, granted: Granted) -> bool {
        let rule = |meta: &mut M| match allowed(meta) {
            true => Verdict::Approve,
            false => Verdict::Refuse(()),
        };
        matches!(self.decide(handle, rule, granted), Decided::Approved)
    }

    /// [`Self::authorize`] for a rule that has more than one way to say no, and
    /// that may record the refusal on the entry it just read: `rule` is handed
    /// the metadata mutably, and a [`Verdict::Burn`] takes the entry down.
    pub fn decide<R>(
        &self,
        handle: &str,
        rule: impl FnOnce(&mut M) -> Verdict<R>,
        granted: Granted,
    ) -> Decided<R> {
        let mut map = self.map.lock().unwrap();
        self.reap(&mut map);
        let Some(entry) = map.get_mut(handle).filter(|e| e.granted.is_none()) else {
            return Decided::Gone;
        };
        match rule(&mut entry.meta) {
            Verdict::Approve => {
                entry.granted = Some(granted);
                Decided::Approved
            }
            Verdict::Refuse(reason) => Decided::Refused(reason),
            Verdict::Burn(reason) => {
                self.abandon(map.remove(handle));
                Decided::Refused(reason)
            }
        }
    }

    /// Poll by secret. An approved entry is consumed, so its tokens are handed
    /// out exactly once.
    pub fn poll(&self, secret: &str) -> PollState {
        let mut map = self.map.lock().unwrap();
        self.reap(&mut map);
        let Some(handle) = Self::handle_for(&map, secret) else {
            return PollState::Unknown;
        };
        match map.get(&handle).and_then(|e| e.granted.as_ref()) {
            Some(_) => {
                let granted = map.remove(&handle).and_then(|e| e.granted).expect("just matched");
                PollState::Authorized {
                    token: granted.token,
                    access_token: granted.access_token,
                    user: Box::new(granted.user),
                }
            }
            None => PollState::Pending,
        }
    }

    /// Keep the entry holding `secret` alive for another TTL. False when it is
    /// already gone, which tells its device to announce itself again.
    pub fn touch(&self, secret: &str) -> bool {
        let mut map = self.map.lock().unwrap();
        self.reap(&mut map);
        let Some(handle) = Self::handle_for(&map, secret) else {
            return false;
        };
        map.entry(handle).and_modify(|e| {
            e.fresh_at = now();
            e.seen = tick();
        });
        true
    }

    /// Forget the entry holding `secret`, surrendering any tokens it accrued.
    pub fn forget(&self, secret: &str) -> Option<Orphaned> {
        let mut map = self.map.lock().unwrap();
        self.reap(&mut map);
        let handle = Self::handle_for(&map, secret)?;
        map.remove(&handle)?.orphaned()
    }

    /// Project every live entry NOT yet approved through `view`, dropping the
    /// `None`s.
    ///
    /// Approved-but-uncollected is deliberately excluded: such an entry is spent
    /// (the second approval is refused) and its device is a few seconds from
    /// signing in, so listing it offers a row that can only fail.
    pub fn map_pending<T>(&self, view: impl Fn(&str, &M) -> Option<T>) -> Vec<T> {
        let mut map = self.map.lock().unwrap();
        self.reap(&mut map);
        map.iter()
            .filter(|(_, e)| e.granted.is_none())
            .filter_map(|(handle, e)| view(handle, &e.meta))
            .collect()
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

// Whose slot a newcomer takes when the store is full: the least-recently-seen
// entry of the biggest scope that is not `spared`. Biggest first is what makes
// the bound fair, since a flood only ever crowds itself out; least-recently-seen
// within it is what makes the choice deterministic, since `seen` is unique.
fn crowded_out<M, K: Eq + Hash>(
    map: &HashMap<String, Entry<M>>,
    scope_of: &impl Fn(&M) -> K,
    spared: &K,
) -> Option<String> {
    let mut share: HashMap<K, usize> = HashMap::new();
    for entry in map.values() {
        *share.entry(scope_of(&entry.meta)).or_default() += 1;
    }
    map.iter()
        .filter(|(_, e)| scope_of(&e.meta) != *spared)
        .max_by_key(|(_, e)| {
            (share.get(&scope_of(&e.meta)).copied().unwrap_or_default(), std::cmp::Reverse(e.seen))
        })
        .map(|(handle, _)| handle.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::pairing::approved;

    fn user() -> User {
        crate::test_support::test_user("u1", vec![])
    }

    fn granted() -> Granted {
        Granted { token: "tok".into(), access_token: "acc".into(), user: user() }
    }

    fn grants() -> Grants<&'static str> {
        Grants::new(300, 4)
    }

    fn seq_mint() -> impl FnMut() -> String {
        let mut n = 0;
        move || {
            n += 1;
            format!("h{n}")
        }
    }

    fn file(
        g: &Grants<&'static str>,
        meta: &'static str,
        mint: impl FnMut() -> String,
    ) -> (String, String) {
        let Filed { handle, secret } = g.insert(meta, mint).expect("room in the store");
        (handle, secret)
    }

    type Scoped = (&'static str, &'static str);

    fn scope(meta: &Scoped) -> &'static str {
        meta.0
    }

    fn place(g: &Grants<Scoped>, meta: Scoped, mint: impl FnMut() -> String) -> Filed {
        g.replace_scoped(|_| false, scope, 8, meta, mint).filed.expect("room in the store")
    }

    #[test]
    fn a_fresh_request_polls_pending_until_it_is_approved() {
        let g = grants();
        let (handle, secret) = file(&g, "tv", seq_mint());
        assert!(matches!(g.poll(&secret), PollState::Pending));
        assert!(g.authorize(&handle, |_| true, granted()));
        let (token, access_token, user) =
            approved(g.poll(&secret)).expect("an approved request");
        assert_eq!((token.as_str(), access_token.as_str()), ("tok", "acc"));
        assert_eq!(user.id, "u1");
        // Collected exactly once: the entry is gone on the next poll.
        assert!(matches!(g.poll(&secret), PollState::Unknown));
    }

    #[test]
    fn an_unknown_secret_or_handle_is_refused_without_saying_why() {
        let g = grants();
        let (handle, _) = file(&g, "tv", seq_mint());
        assert!(matches!(g.poll("nope"), PollState::Unknown));
        assert!(!g.authorize("nope", |_| true, granted()));
        assert!(!g.touch("nope"));
        assert!(g.forget("nope").is_none());
        // A predicate that refuses reads exactly like an unknown handle.
        assert!(!g.authorize(&handle, |_| false, granted()));
    }

    #[test]
    fn approval_happens_once_and_the_second_asker_is_refused() {
        // Two phones can see one waiting television, and one phone can be
        // tapped twice. Overwriting would discard the first approver's tokens,
        // which are rows nothing else would ever delete, and hand the device to
        // whoever asked last.
        let g = grants();
        let (handle, secret) = file(&g, "tv", seq_mint());
        assert!(g.authorize(&handle, |_| true, granted()));

        let second =
            Granted { token: "tok2".into(), access_token: "acc2".into(), user: user() };
        assert!(!g.authorize(&handle, |_| true, second));

        let (token, ..) = approved(g.poll(&secret)).expect("the FIRST approval");
        assert_eq!(token, "tok");
    }

    #[test]
    fn a_rule_may_refuse_with_a_reason_of_its_own() {
        let g = grants();
        let (handle, secret) = file(&g, "tv", seq_mint());
        let refused = g.decide(&handle, |_| Verdict::Refuse("wrong"), granted());
        assert!(matches!(refused, Decided::Refused("wrong")));
        assert!(matches!(g.poll(&secret), PollState::Pending), "the entry is still there");

        let approved = g.decide(&handle, |_| Verdict::<&str>::Approve, granted());
        assert!(matches!(approved, Decided::Approved));
    }

    #[test]
    fn a_burnt_entry_is_gone_and_reads_as_one_that_never_existed() {
        let g = grants();
        let (handle, secret) = file(&g, "tv", seq_mint());
        let burnt = g.decide(&handle, |_| Verdict::Burn("enough"), granted());
        assert!(matches!(burnt, Decided::Refused("enough")));

        assert!(matches!(g.poll(&secret), PollState::Unknown));
        let again = g.decide(&handle, |_| Verdict::<&str>::Approve, granted());
        assert!(matches!(again, Decided::Gone));
        assert_eq!(g.len(), 0);
    }

    #[test]
    fn a_rule_writes_what_it_learned_back_onto_the_entry() {
        let g: Grants<u32> = Grants::new(300, 4);
        let Filed { handle, .. } = g.insert(0, seq_mint()).expect("room in the store");
        for expected in 1..=3 {
            let seen = g.decide(
                &handle,
                |tries| {
                    *tries += 1;
                    Verdict::Refuse(*tries)
                },
                granted(),
            );
            assert!(matches!(seen, Decided::Refused(n) if n == expected));
        }
    }

    #[test]
    fn mint_keeps_going_until_it_finds_a_free_handle() {
        let g = grants();
        let (first, _) = file(&g, "tv", || "fixed".to_string());
        let mut proposals = ["fixed".to_string(), "other".to_string()].into_iter();
        let (second, _) = file(&g, "tv", move || proposals.next().expect("mint ran dry"));
        assert_eq!(first, "fixed");
        assert_eq!(second, "other");
    }

    #[test]
    fn a_full_store_refuses_rather_than_evicting_someone() {
        // Eviction on an endpoint nobody authenticates to would let whoever
        // asks most often decide whose pairing survives.
        let g = grants();
        let mut mint = seq_mint();
        let (_, first) = file(&g, "tv", &mut mint);
        for _ in 0..3 {
            file(&g, "tv", &mut mint);
        }
        assert_eq!(g.len(), 4);

        assert!(g.insert("tv", &mut mint).is_none());
        assert_eq!(g.len(), 4);
        // And the one that was already there is untouched.
        assert!(matches!(g.poll(&first), PollState::Pending));
    }

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
        assert!(matches!(g.poll("anything"), PollState::Unknown), "the sweep ran");

        let orphans = g.take_orphans();
        assert_eq!(orphans.len(), 1, "the swept approval surrendered its tokens");
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

    #[test]
    fn a_heartbeat_carries_a_request_past_its_ttl() {
        let g = grants();
        let (_, secret) = file(&g, "tv", seq_mint());
        assert!(g.touch(&secret));
        assert!(matches!(g.poll(&secret), PollState::Pending));
    }

    #[test]
    fn forgetting_surrenders_only_the_tokens_nobody_will_collect() {
        let g = grants();
        let (_, pending) = file(&g, "tv", seq_mint());
        assert!(g.forget(&pending).is_none());

        let (handle, approved) = file(&g, "tv", seq_mint());
        assert!(g.authorize(&handle, |_| true, granted()));
        let orphan = g.forget(&approved).expect("approved but never collected");
        assert_eq!((orphan.token.as_str(), orphan.access_token.as_str()), ("tok", "acc"));
        assert!(matches!(g.poll(&approved), PollState::Unknown));
    }

    #[test]
    fn refiling_drops_the_callers_own_entries_and_leaves_the_rest() {
        let g = grants();
        let mut mint = seq_mint();
        let (doomed, _) = file(&g, "old", &mut mint);
        let (_, kept) = file(&g, "new", &mut mint);
        assert!(g.authorize(&doomed, |_| true, granted()));

        let again = g.replace_scoped(|m| *m == "old", |_| (), 4, "old", &mut mint);
        assert!(again.filed.is_some());
        assert_eq!(again.orphans.len(), 1, "the replaced entry surrendered its tokens");
        assert_eq!(g.len(), 2);
        assert!(matches!(g.poll(&kept), PollState::Pending));
    }

    #[test]
    fn a_full_scope_is_refused_even_while_the_store_has_room() {
        // The slots in a scope belong to the entries that took them, so a
        // newcomer waits rather than pushing a neighbour out.
        let g = grants();
        let mut mint = seq_mint();
        file(&g, "mine", &mut mint);
        file(&g, "mine", &mut mint);
        file(&g, "theirs", &mut mint);

        let refused = g.replace_scoped(|_| false, |m| *m, 2, "mine", &mut mint);
        assert!(refused.filed.is_none());
        assert_eq!(g.len(), 3, "nobody was pushed out to make room");
        assert!(g.replace_scoped(|_| false, |m| *m, 2, "theirs", &mut mint).filed.is_some());
    }

    #[test]
    fn a_full_store_takes_room_from_the_scope_holding_the_most() {
        // The bound a flood meets: it can only crowd itself out, so the scopes
        // it was keeping out are the ones that survive it.
        let g: Grants<(&str, &str)> = Grants::new(300, 4);
        let mut mint = seq_mint();
        let flood = place(&g, ("loud", "1"), &mut mint);
        place(&g, ("loud", "2"), &mut mint);
        place(&g, ("loud", "3"), &mut mint);
        let quiet = place(&g, ("quiet", "1"), &mut mint);

        let arrival = g.replace_scoped(|_| false, scope, 3, ("new", "1"), &mut mint);
        assert!(arrival.filed.is_some());
        assert_eq!(g.len(), 4);
        assert!(matches!(g.poll(&flood.secret), PollState::Unknown), "the oldest of the most");
        assert!(matches!(g.poll(&quiet.secret), PollState::Pending), "one scope, one beacon");
    }

    #[test]
    fn an_entry_crowded_out_surrenders_its_tokens_like_a_lapse_does() {
        let g: Grants<(&str, &str)> = Grants::new(300, 2);
        let mut mint = seq_mint();
        let doomed = place(&g, ("loud", "1"), &mut mint);
        place(&g, ("loud", "2"), &mut mint);
        assert!(g.authorize(&doomed.handle, |_| true, granted()));
        assert!(g.take_orphans().is_empty(), "nothing has left yet");

        assert!(g.replace_scoped(|_| false, scope, 2, ("new", "1"), &mut mint).filed.is_some());
        let orphans = g.take_orphans();
        assert_eq!(orphans.len(), 1);
        assert_eq!(orphans[0].token, "tok");
    }

    #[test]
    fn a_caller_is_refused_rather_than_making_room_among_its_own() {
        let g: Grants<(&str, &str)> = Grants::new(300, 2);
        let mut mint = seq_mint();
        let first = place(&g, ("mine", "1"), &mut mint);
        place(&g, ("mine", "2"), &mut mint);

        let refused = g.replace_scoped(|_| false, scope, 8, ("mine", "3"), &mut mint);
        assert!(refused.filed.is_none());
        assert!(matches!(g.poll(&first.secret), PollState::Pending));
    }

    #[test]
    fn map_pending_sees_what_is_still_waiting_and_may_skip_some() {
        let g = grants();
        let mut mint = seq_mint();
        file(&g, "keep", &mut mint);
        file(&g, "skip", &mut mint);
        let mut seen = g.map_pending(|handle, meta| (*meta == "keep").then(|| handle.to_string()));
        seen.sort();
        assert_eq!(seen, vec!["h1".to_string()]);
    }

    #[test]
    fn map_pending_hides_a_request_already_approved() {
        // Its device is seconds from signing in and the second approval is
        // refused, so offering the row again can only fail.
        let g = grants();
        let (handle, _) = file(&g, "tv", seq_mint());
        assert_eq!(g.map_pending(|h, _| Some(h.to_string())).len(), 1);

        assert!(g.authorize(&handle, |_| true, granted()));
        assert!(g.map_pending(|h, _| Some(h.to_string())).is_empty());
    }
}

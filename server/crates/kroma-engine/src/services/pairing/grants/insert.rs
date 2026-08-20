use std::collections::HashMap;
use std::hash::Hash;

use crate::services::auth::random_token;

use super::{now, tick, Entry, Filed, Grants, Orphaned, ScopedInsert};

#[cfg(test)]
mod tests;

impl<M> Grants<M> {
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

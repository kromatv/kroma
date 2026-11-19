//! The settings store: in-memory key/value map, typed accessors and
//! persist-on-patch writes, over the keys [`super::keys`] declares.

use std::collections::{BTreeMap, BTreeSet};
use std::sync::{Arc, RwLock};

use serde_json::Value;

use crate::db::Pool;

use super::keys::defaults;

/// Shared, cheap-to-clone handle to the live settings map.
#[derive(Clone)]
pub struct Settings {
    inner: Arc<RwLock<Live>>,
}

struct Live {
    values: BTreeMap<String, Value>,
    unread: Unread,
}

enum Unread {
    Keys(BTreeSet<String>),
    AllBut(BTreeSet<String>),
}

impl Live {
    fn read(pool: &Pool) -> Self {
        let mut values = defaults();
        let unread = match crate::db::settings_all(pool) {
            Ok(stored) => {
                values.extend(stored.values);
                Unread::Keys(stored.unreadable.into_iter().collect())
            }
            Err(_) => Unread::AllBut(BTreeSet::new()),
        };
        Live { values, unread }
    }

    fn put(&mut self, key: &str, value: Value) {
        match &mut self.unread {
            Unread::Keys(unread) => {
                unread.remove(key);
            }
            Unread::AllBut(known) => {
                known.insert(key.to_string());
            }
        }
        self.values.insert(key.to_string(), value);
    }

    fn could_not_read(&self, key: &str) -> bool {
        match &self.unread {
            Unread::Keys(unread) => unread.contains(key),
            Unread::AllBut(known) => !known.contains(key),
        }
    }
}

impl Settings {
    /// Build the store, loading any persisted rows over the built-in defaults.
    pub fn load(pool: &Pool) -> Self {
        Settings {
            inner: Arc::new(RwLock::new(Live::read(pool))),
        }
    }

    /// Reload the live map from the database, over the built-in defaults, for
    /// writers that bypass [`Self::set_patch`] (e.g. a backup import).
    pub fn reload(&self, pool: &Pool) {
        *self.inner.write().unwrap() = Live::read(pool);
    }

    /// Raw value for `key`, falling back to the built-in default.
    pub fn get(&self, key: &str) -> Value {
        self.inner
            .read()
            .unwrap()
            .values
            .get(key)
            .cloned()
            .or_else(|| defaults().get(key).cloned())
            .unwrap_or(Value::Null)
    }

    /// Whether this store failed to read what is stored under `key`: its row
    /// is not JSON, or the table did not read at all. What [`Self::get`]
    /// answers is then a default, and not known to be what was saved. A value
    /// written through this store is read again.
    pub fn could_not_read(&self, key: &str) -> bool {
        self.inner.read().unwrap().could_not_read(key)
    }

    pub fn get_bool(&self, key: &str, fallback: bool) -> bool {
        self.get(key).as_bool().unwrap_or(fallback)
    }

    pub fn get_str(&self, key: &str, fallback: &str) -> String {
        match self.get(key) {
            Value::String(s) => s,
            _ => fallback.to_string(),
        }
    }

    pub fn get_i64(&self, key: &str, fallback: i64) -> i64 {
        let v = self.get(key);
        v.as_i64()
            .or_else(|| v.as_str().and_then(|s| s.trim().parse::<i64>().ok()))
            .unwrap_or(fallback)
    }

    /// Persist one server-owned value, bypassing the [`defaults`] allow-list.
    ///
    /// A failed write still reaches the live map, so this process keeps the
    /// value and the next start does not: what that costs is the caller's to
    /// decide.
    pub fn set_internal(&self, pool: &Pool, key: &str, value: Value) -> anyhow::Result<()> {
        let written = crate::db::settings_set(pool, key, &value);
        self.inner.write().unwrap().put(key, value);
        written
    }

    /// Apply a patch in-memory and persist it. Keys absent from [`defaults`] are
    /// silently dropped; returns the keys actually written.
    pub fn set_patch(&self, pool: &Pool, patch: BTreeMap<String, Value>) -> Vec<String> {
        let known = defaults();
        let mut written = Vec::new();
        let mut guard = self.inner.write().unwrap();
        for (k, v) in patch {
            if !known.contains_key(&k) {
                continue;
            }
            let _ = crate::db::settings_set(pool, &k, &v);
            guard.put(&k, v);
            written.push(k);
        }
        written
    }

    /// Atomically read-modify-write one setting under a single write-lock, so
    /// concurrent updates to the same key can't clobber each other. Keys absent
    /// from [`defaults`] are ignored.
    pub fn update_json(&self, pool: &Pool, key: &str, f: impl FnOnce(Value) -> Value) {
        if !defaults().contains_key(key) {
            return;
        }
        let mut guard = self.inner.write().unwrap();
        let current = guard
            .values
            .get(key)
            .cloned()
            .or_else(|| defaults().get(key).cloned())
            .unwrap_or(Value::Null);
        let next = f(current);
        let _ = crate::db::settings_set(pool, key, &next);
        guard.put(key, next);
    }
}

#[cfg(test)]
mod tests;

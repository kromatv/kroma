//! The settings store: in-memory key/value map, typed accessors and
//! persist-on-patch writes, over the keys [`super::keys`] declares.

use std::collections::{BTreeMap, BTreeSet};
use std::sync::{Arc, RwLock};

use serde_json::Value;

use crate::db::Pool;

use super::keys::defaults;
use super::library_list::LIBRARIES_KEY;

/// Shared, cheap-to-clone handle to the live settings map.
#[derive(Clone)]
pub struct Settings {
    inner: Arc<RwLock<Live>>,
}

struct Live {
    pool: Pool,
    values: BTreeMap<String, Value>,
    unread: Unread,
}

enum Unread {
    Rows(BTreeSet<String>),
    Table,
}

impl Live {
    fn read(pool: &Pool) -> Self {
        let mut values = defaults();
        let unread = match crate::db::settings_all(pool) {
            Ok(stored) => {
                values.extend(stored.values);
                Unread::Rows(stored.unreadable.into_iter().collect())
            }
            Err(_) => Unread::Table,
        };
        Live {
            pool: pool.clone(),
            values,
            unread,
        }
    }

    fn read_again(&mut self) {
        let again = Live::read(&self.pool);
        if !matches!(again.unread, Unread::Table) {
            *self = again;
        }
    }

    fn put(&mut self, key: &str, value: Value, persisted: bool) {
        if let (true, Unread::Rows(unread)) = (persisted, &mut self.unread) {
            unread.remove(key);
        }
        self.values.insert(key.to_string(), value);
    }

    fn value(&self, key: &str) -> Value {
        self.values
            .get(key)
            .cloned()
            .or_else(|| defaults().get(key).cloned())
            .unwrap_or(Value::Null)
    }

    fn stored(&self, key: &str) -> Option<Value> {
        let unread = match &self.unread {
            Unread::Rows(unread) => unread.contains(key),
            Unread::Table => true,
        };
        (!unread).then(|| self.value(key))
    }
}

fn admits(pool: &Pool, key: &str, value: &Value) -> bool {
    key != LIBRARIES_KEY || matches!(super::refusal(pool, value), Ok(None))
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

    fn live(&self) -> std::sync::RwLockReadGuard<'_, Live> {
        let live = self.inner.read().unwrap();
        if !matches!(live.unread, Unread::Table) {
            return live;
        }
        drop(live);
        let mut faulted = self.inner.write().unwrap();
        if matches!(faulted.unread, Unread::Table) {
            faulted.read_again();
        }
        drop(faulted);
        self.inner.read().unwrap()
    }

    /// Raw value for `key`, falling back to the built-in default.
    pub fn get(&self, key: &str) -> Value {
        self.live().value(key)
    }

    /// What [`Self::get`] answers for `key`, or `None` when this store failed
    /// to read what is stored under it: its row is not JSON, or the table did
    /// not read. `get` then answers a default that is not known to be what was
    /// saved. A table that did not read is read again each time a key is
    /// asked for, and a row is read again once a write of it persisted.
    pub fn stored(&self, key: &str) -> Option<Value> {
        self.live().stored(key)
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
        anyhow::ensure!(admits(pool, key, &value), "`{key}` refuses this value");
        let written = crate::db::settings_set(pool, key, &value);
        self.inner.write().unwrap().put(key, value, written.is_ok());
        written
    }

    /// Apply a patch in-memory and persist it. Keys absent from [`defaults`] are
    /// silently dropped; returns the keys actually written. So is a `libraries`
    /// value [`super::refusal`] refuses: no writer of a whole value may leave
    /// out a library the index holds.
    pub fn set_patch(&self, pool: &Pool, patch: BTreeMap<String, Value>) -> Vec<String> {
        let known = defaults();
        let mut written = Vec::new();
        let mut guard = self.inner.write().unwrap();
        for (k, v) in patch {
            if !known.contains_key(&k) || !admits(pool, &k, &v) {
                continue;
            }
            let persisted = crate::db::settings_set(pool, &k, &v).is_ok();
            guard.put(&k, v, persisted);
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
        let next = f(guard.value(key));
        if !admits(pool, key, &next) {
            return;
        }
        let persisted = crate::db::settings_set(pool, key, &next).is_ok();
        guard.put(key, next, persisted);
    }
}

impl Settings {
    pub(super) fn save_library_list(&self, pool: &Pool, list: Value) {
        let persisted = crate::db::settings_set(pool, LIBRARIES_KEY, &list).is_ok();
        self.inner
            .write()
            .unwrap()
            .put(LIBRARIES_KEY, list, persisted);
    }
}

#[cfg(test)]
mod tests;

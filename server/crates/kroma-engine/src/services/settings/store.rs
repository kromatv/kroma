//! The settings store: in-memory key/value map, typed accessors and
//! persist-on-patch writes, over the keys [`super::keys`] declares.

use std::collections::BTreeMap;
use std::sync::{Arc, RwLock};

use serde_json::Value;

use crate::db::Pool;

use super::keys::defaults;

/// Shared, cheap-to-clone handle to the live settings map.
#[derive(Clone)]
pub struct Settings {
    inner: Arc<RwLock<BTreeMap<String, Value>>>,
}

impl Settings {
    /// Build the store, loading any persisted rows over the built-in defaults.
    pub fn load(pool: &Pool) -> Self {
        let mut map = defaults();
        if let Ok(rows) = crate::db::settings_all(pool) {
            for (k, v) in rows {
                map.insert(k, v);
            }
        }
        Settings {
            inner: Arc::new(RwLock::new(map)),
        }
    }

    /// Reload the live map from the database, over the built-in defaults, for
    /// writers that bypass [`Self::set_patch`] (e.g. a backup import).
    pub fn reload(&self, pool: &Pool) {
        let mut map = defaults();
        if let Ok(rows) = crate::db::settings_all(pool) {
            for (k, v) in rows {
                map.insert(k, v);
            }
        }
        *self.inner.write().unwrap() = map;
    }

    /// Raw value for `key`, falling back to the built-in default.
    pub fn get(&self, key: &str) -> Value {
        self.inner
            .read()
            .unwrap()
            .get(key)
            .cloned()
            .or_else(|| defaults().get(key).cloned())
            .unwrap_or(Value::Null)
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
    /// [`Self::set_patch`] takes its keys from an HTTP body, so it writes only
    /// what `defaults` declares. Identity the server mints for itself is not a
    /// preference, so it is written through here and cannot be lost to a missing
    /// declaration. A minted value that must also be withheld from a sidecar
    /// still declares its reach in [`super::keys`]; writing it here does not.
    pub fn set_internal(&self, pool: &Pool, key: &str, value: Value) {
        let _ = crate::db::settings_set(pool, key, &value);
        self.inner.write().unwrap().insert(key.to_string(), value);
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
            guard.insert(k.clone(), v);
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
            .get(key)
            .cloned()
            .or_else(|| defaults().get(key).cloned())
            .unwrap_or(Value::Null);
        let next = f(current);
        let _ = crate::db::settings_set(pool, key, &next);
        guard.insert(key.to_string(), next);
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::db::testing::TempPool;

    fn test_pool() -> TempPool {
        crate::db::testing::temp_pool("settings-store")
    }

    #[test]
    fn get_falls_back_to_default_then_null() {
        let pool = test_pool();
        let s = Settings::load(&pool);
        assert_eq!(s.get("serverName"), json!("KROMA"));
        assert_eq!(s.get("totallyUnknown"), Value::Null);
    }

    #[test]
    fn typed_getters_coerce_and_fall_back() {
        let pool = test_pool();
        let s = Settings::load(&pool);
        assert!(s.get_bool("watchAutoScan", false));
        assert!(s.get_bool("anonStats", false));
        assert!(s.get_bool("missingBool", true));
        assert!(s.get_bool("serverName", true));
        assert_eq!(s.get_str("serverName", "x"), "KROMA");
        assert_eq!(s.get_str("anonStats", "fb"), "fb");
        assert_eq!(s.get_str("missingStr", "fb"), "fb");
        assert_eq!(s.get_i64("watchIntervalSecs", 99), -1);
        assert_eq!(s.get_i64("maxConcurrent", 0), 8);
        assert_eq!(s.get_i64("serverName", 42), 42);
        assert_eq!(s.get_i64("missingI64", 7), 7);
    }

    #[test]
    fn set_patch_keeps_known_skips_unknown_and_persists() {
        let pool = test_pool();
        let s = Settings::load(&pool);
        let mut patch = BTreeMap::new();
        patch.insert("serverName".to_string(), json!("MyBox"));
        patch.insert("bogusKey".to_string(), json!(123));
        let mut written = s.set_patch(&pool, patch);
        written.sort();
        assert_eq!(written, vec!["serverName".to_string()]);
        assert_eq!(s.get("serverName"), json!("MyBox"));
        assert_eq!(s.get("bogusKey"), Value::Null);
        let s2 = Settings::load(&pool);
        assert_eq!(s2.get("serverName"), json!("MyBox"));
    }

    #[test]
    fn update_json_read_modify_writes_known_key_only() {
        let pool = test_pool();
        let s = Settings::load(&pool);
        s.update_json(&pool, "watchIntervalSecs", |v| {
            json!(v.as_i64().unwrap_or(0) + 5)
        });
        assert_eq!(s.get_i64("watchIntervalSecs", 0), 4);
        assert_eq!(Settings::load(&pool).get_i64("watchIntervalSecs", 0), 4);
        s.update_json(&pool, "notAKey", |_| json!("x"));
        assert_eq!(s.get("notAKey"), Value::Null);
    }

    #[test]
    fn reload_picks_up_direct_db_writes() {
        let pool = test_pool();
        let s = Settings::load(&pool);
        assert_eq!(s.get("serverName"), json!("KROMA"));
        crate::db::settings_set(&pool, "serverName", &json!("Restored")).unwrap();
        s.reload(&pool);
        assert_eq!(s.get("serverName"), json!("Restored"));
    }

    #[test]
    fn a_store_that_cannot_be_read_falls_back_to_the_built_in_defaults() {
        let pool = test_pool();
        crate::db::settings_set(&pool, "serverName", &json!("Stored")).unwrap();
        pool.get()
            .unwrap()
            .execute_batch("DROP TABLE settings")
            .unwrap();

        let s = Settings::load(&pool);
        assert_eq!(s.get("serverName"), json!("KROMA"));

        s.reload(&pool);
        assert_eq!(s.get("serverName"), json!("KROMA"));
    }

    #[test]
    fn cloned_handle_shares_the_same_map() {
        let pool = test_pool();
        let s = Settings::load(&pool);
        let clone = s.clone();
        s.set_patch(
            &pool,
            BTreeMap::from([("serverName".to_string(), json!("Shared"))]),
        );
        assert_eq!(clone.get("serverName"), json!("Shared"));
    }
}

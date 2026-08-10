//! The settings store: in-memory key/value map, typed accessors, persist-on-patch
//! writes, and the built-in defaults.

use std::collections::BTreeMap;
use std::sync::{Arc, RwLock};

use serde_json::{json, Value};

use crate::db::Pool;

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

fn defaults() -> BTreeMap<String, Value> {
    let mut m = BTreeMap::new();
    m.insert("serverName".into(), json!("KROMA"));
    // One key for the whole blob: `{ "<id>": { "enabled": bool, "config": {..} } }`
    // (module ids are not known at compile time, so they can't be allow-listed).
    m.insert("moduleStates".into(), json!({}));
    // Empty = the built-in catalog (modules.json on this repo's GitHub Releases).
    // This is the OFFICIAL slot: it stays pinned first and wins on an id clash.
    m.insert("moduleRegistryUrl".into(), json!(""));
    // Operator-added registries beyond the official one, as
    // `[{ "name": str, "url": str, "enabled": bool }]`. Validated on read (see
    // api/admin/store/registries.rs): the list is operator input pointing at
    // third-party catalogs of native code.
    m.insert("moduleRegistries".into(), json!([]));
    m.insert("uiLanguage".into(), json!("Français"));
    // Empty → the env-configured `KROMA_TMDB_LANGUAGE` (default "en-US").
    m.insert("tmdbLanguage".into(), json!(""));
    m.insert("timezone".into(), json!("Europe/Zurich (UTC+1)"));
    m.insert("autoUpdate".into(), json!(true));
    m.insert("updateChannel".into(), json!("Stable"));
    // Periodic re-scan cadence, the only path that catches NAS/SMB edits (they
    // emit no FS events). `-1` = `KROMA_WATCH_INTERVAL` or 300s, `0` = FS events only.
    m.insert("watchAutoScan".into(), json!(true));
    m.insert("watchIntervalSecs".into(), json!(-1));
    m.insert("anonStats".into(), json!(false));
    m.insert("showRecentHome".into(), json!(true));
    // Security: exposes the account roster on the login screen. Off by default so
    // knowing the server URL does not reveal who has an account; when off,
    // `GET /api/users` returns an empty list.
    m.insert("publicUserList".into(), json!(false));
    m.insert("themeSongs".into(), json!(false));
    // off | chapters (free, from embedded chapters) | fingerprint (heavy audio job).
    m.insert("introDetection".into(), json!("chapters"));
    m.insert("theme".into(), json!("Sombre (Kroma)"));
    m.insert("dateFormat".into(), json!("JJ/MM/AAAA"));
    m.insert("moduleAutoUpdate".into(), json!(true));
    m.insert("remoteAccess".into(), json!(false));
    m.insert("remoteUrl".into(), json!(""));
    // Cloudflare Tunnel token for the supervised `cloudflared` child
    // (services::remote). A secret: never returned to clients.
    m.insert("remoteAccessToken".into(), json!(""));
    m.insert("upLimit".into(), json!("Illimité"));
    m.insert("https".into(), json!("Préférées"));
    // Self-signed HTTPS listener: browsers only expose Web Crypto (passkeys) on a
    // secure origin. Applied at boot, so a change needs a restart; `KROMA_HTTPS` /
    // `KROMA_HTTPS_PORT` override the stored values. See src/tls.rs.
    m.insert("httpsEnabled".into(), json!(false));
    m.insert("httpsPort".into(), json!("4443"));
    m.insert("httpsRedirect".into(), json!(false));
    m.insert("ipv6".into(), json!(false));
    m.insert("localDiscovery".into(), json!(true));
    m.insert("localNetworks".into(), json!("192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12"));
    m.insert("hwAccel".into(), json!(false));
    m.insert("hwDevice".into(), json!("Auto"));
    m.insert("hevcEncode".into(), json!(false));
    m.insert("transcoderSpeed".into(), json!("Automatique"));
    m.insert("bgQuality".into(), json!("Préférer la vitesse"));
    m.insert("maxConcurrent".into(), json!("8"));
    // Concurrent CPU-heavy background ffmpeg passes; "0" = auto (cores - 1).
    m.insert("mediaConcurrency".into(), json!("0"));
    m.insert("pipelinePaused".into(), json!(false));
    m.insert("deleteAfter".into(), json!(true));
    m.insert("cacheLimit".into(), json!("80 Go"));
    m.insert("transcodeCacheLimit".into(), json!("20 Go"));
    // Scheduler timezone offset in minutes from UTC (60 = UTC+1, -300 = UTC-5).
    m.insert("jobsUtcOffset".into(), json!(0));
    // Keyword lists are comma-separated, matched as whole tokens against release names.
    m.insert("acqEnabled".into(), json!(false));
    m.insert("acqAutoApprove".into(), json!(false));
    m.insert("acqDeleteAfterImport".into(), json!(false));
    m.insert("acqResolution".into(), json!("1080p"));
    m.insert("acqPreferHevc".into(), json!(true));
    m.insert("acqMinSeeders".into(), json!(2));
    m.insert("acqMaxSizeGbMovie".into(), json!(15));
    m.insert("acqMaxSizeGbEpisode".into(), json!(3));
    m.insert("acqRequiredKeywords".into(), json!(""));
    m.insert(
        "acqForbiddenKeywords".into(),
        json!("cam, hdcam, ts, telesync, telecine, screener, dvdscr, workprint"),
    );
    // Embedded torrent engine knobs (0 = ephemeral port / unlimited rate).
    m.insert("rqbitPort".into(), json!(0));
    m.insert("rqbitDownKbps".into(), json!(0));
    m.insert("rqbitUpKbps".into(), json!(0));
    // `vpnWgConfig` is a secret: written via /api/admin/vpn, never returned in a
    // settings view.
    m.insert("vpnWgConfig".into(), json!(""));
    m.insert("vpnLocalPort".into(), json!(25345));
    m.insert("vpnKillSwitch".into(), json!(false));
    m.insert("vpnCheckUrl".into(), json!("https://api.ipify.org"));
    // Library new downloads land in, by name; "Auto" = first of the matching kind.
    m.insert("acqMovieLibrary".into(), json!("Auto"));
    m.insert("acqSeriesLibrary".into(), json!("Auto"));
    // Sonarr/Radarr-style tokens; see kroma_torrent::organize::naming.
    m.insert("namingMovieFolder".into(), json!("{Title} ({Year})"));
    m.insert("namingMovieFile".into(), json!("{Title} ({Year}) {Quality Full}"));
    m.insert("namingSeriesFolder".into(), json!("{Title} ({Year})"));
    m.insert("namingSeasonFolder".into(), json!("Season {season:00}"));
    m.insert(
        "namingEpisodeFile".into(),
        json!("{Title} - S{season:00}E{episode:00} - {Episode Title} {Quality Full}"),
    );
    // MUST stay registered: `set_patch` silently drops unknown keys, so without
    // this line `save_naming` answers `{"ok": true}` and throws the value away.
    m.insert("namingCase".into(), json!("default"));
    // openai = any OpenAI-compatible server (Ollama, llama.cpp, LM Studio, …);
    // anthropic = Claude.
    m.insert("llmEnabled".into(), json!(false));
    m.insert("llmProvider".into(), json!("openai"));
    m.insert("llmBaseUrl".into(), json!(""));
    m.insert("llmModel".into(), json!(""));
    m.insert("llmApiKey".into(), json!(""));
    m.insert("llmTemperature".into(), json!(0.7));
    m.insert("llmMaxTokens".into(), json!(900));
    m.insert("llmReasoning".into(), json!(false));
    // Seeded from the flat `llm*` keys above on first read when empty.
    m.insert("llmProviders".into(), json!([]));
    m.insert("llmDefaultProvider".into(), json!(""));
    m.insert("libraries".into(), json!(null));
    // ISO-8601 `items.added_at` the digest has reported up to. Empty = never run:
    // the first pass adopts the current library as its baseline and stays silent.
    m.insert("notifications.digest.since".into(), json!(""));
    // Web Push (RFC 8292) VAPID identity, minted on the first subscription and
    // then left alone: rotating it invalidates every subscribed browser.
    m.insert("notifications.vapid.publicKey".into(), json!(""));
    m.insert("notifications.vapid.privateKey".into(), json!(""));
    // Apple/Google only accept keys they issued to whoever PUBLISHES the app, so
    // these normally arrive with the build (`KROMA_APNS_*` /
    // `KROMA_FCM_SERVICE_ACCOUNT`); the rows are the fallback for a fork shipping
    // its own app. Empty = that platform's push stays off.
    m.insert("notifications.apns.keyP8".into(), json!(""));
    m.insert("notifications.apns.keyId".into(), json!(""));
    m.insert("notifications.apns.teamId".into(), json!(""));
    m.insert("notifications.fcm.serviceAccount".into(), json!(""));
    m
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::TempPool;

    fn test_pool() -> TempPool {
        crate::db::testing::temp_pool("settings-store")
    }

    #[test]
    fn defaults_carry_known_keys() {
        let d = defaults();
        assert_eq!(d.get("serverName"), Some(&json!("KROMA")));
        assert_eq!(d.get("moduleStates"), Some(&json!({})));
        assert_eq!(d.get("watchIntervalSecs"), Some(&json!(-1)));
        assert_eq!(d.get("llmTemperature"), Some(&json!(0.7)));
        assert!(d.get("nonexistentKey").is_none());
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
        assert!(!s.get_bool("anonStats", true));
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
        s.update_json(&pool, "watchIntervalSecs", |v| json!(v.as_i64().unwrap_or(0) + 5));
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
    fn cloned_handle_shares_the_same_map() {
        let pool = test_pool();
        let s = Settings::load(&pool);
        let clone = s.clone();
        s.set_patch(&pool, BTreeMap::from([("serverName".to_string(), json!("Shared"))]));
        assert_eq!(clone.get("serverName"), json!("Shared"));
    }
}

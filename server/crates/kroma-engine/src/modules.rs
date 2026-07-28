//! Per-module admin state: the enabled flag + config values each module carries,
//! persisted in the `moduleStates` settings blob (`{ id: { enabled, config } }`).
//!
//! The module REGISTRY -- which modules exist, their manifests, capabilities and
//! backend behavior -- lives in the `kroma-module-kernel` crate (the one
//! composition point), built from the generated roster. This is only the
//! settings-state half, kept in the engine because engine internals read a
//! module's enabled flag to gate their work.

use serde_json::{json, Map, Value};

use crate::db::Pool;
use crate::services::settings::Settings;

/// The whole `{ id: { enabled, config } }` blob.
fn states(settings: &Settings) -> Map<String, Value> {
    settings.get("moduleStates").as_object().cloned().unwrap_or_default()
}

/// Read-modify-write one module's entry in the `moduleStates` blob under a
/// single settings write-lock, so a concurrent enable + config-save cannot
/// clobber each other (a plain read-then-write would drop one).
fn update_entry(
    settings: &Settings,
    pool: &Pool,
    id: &str,
    f: impl FnOnce(&mut Map<String, Value>),
) {
    settings.update_json(pool, "moduleStates", |current| {
        let mut all = current.as_object().cloned().unwrap_or_default();
        let mut entry = all.get(id).and_then(Value::as_object).cloned().unwrap_or_default();
        f(&mut entry);
        all.insert(id.to_string(), Value::Object(entry));
        Value::Object(all)
    });
}

/// Whether a module is enabled (default true when never toggled).
pub fn module_enabled(settings: &Settings, id: &str) -> bool {
    states(settings)
        .get(id)
        .and_then(|s| s.get("enabled"))
        .and_then(Value::as_bool)
        .unwrap_or(true)
}

/// A module's stored config values (key -> value).
pub fn module_config(settings: &Settings, id: &str) -> Map<String, Value> {
    states(settings)
        .get(id)
        .and_then(|s| s.get("config"))
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
}

/// Persist a module's enabled flag.
pub fn set_module_enabled(settings: &Settings, pool: &Pool, id: &str, enabled: bool) {
    update_entry(settings, pool, id, |entry| {
        entry.insert("enabled".into(), json!(enabled));
    });
}

/// Merge new config values into a module's stored config.
pub fn set_module_config(settings: &Settings, pool: &Pool, id: &str, values: Map<String, Value>) {
    update_entry(settings, pool, id, |entry| {
        let mut cfg = entry.get("config").and_then(Value::as_object).cloned().unwrap_or_default();
        for (k, v) in values {
            cfg.insert(k, v);
        }
        entry.insert("config".into(), Value::Object(cfg));
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> (Pool, Settings) {
        static SEQ: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let n = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path =
            std::env::temp_dir().join(format!("kroma-modstate-{}-{n}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let pool = crate::db::init(&path).unwrap();
        let settings = Settings::load(&pool);
        (pool, settings)
    }

    #[test]
    fn a_module_nobody_ever_toggled_is_enabled() {
        // Defaulting to false would mean every new module ships dark and the
        // upgrade silently loses features.
        let (_pool, settings) = store();
        assert!(module_enabled(&settings, "tv.kroma.indexer"));
        assert!(module_enabled(&settings, "a.module.that.does.not.exist"));
        assert!(module_config(&settings, "tv.kroma.indexer").is_empty());
    }

    #[test]
    fn the_enabled_flag_round_trips() {
        let (pool, settings) = store();
        set_module_enabled(&settings, &pool, "tv.kroma.vpn", false);
        assert!(!module_enabled(&settings, "tv.kroma.vpn"));
        // Its neighbours are unaffected.
        assert!(module_enabled(&settings, "tv.kroma.indexer"));

        set_module_enabled(&settings, &pool, "tv.kroma.vpn", true);
        assert!(module_enabled(&settings, "tv.kroma.vpn"));
    }

    #[test]
    fn config_merges_rather_than_replaces() {
        // The admin UI saves one panel at a time; a replacing write would wipe
        // every field the open panel did not happen to show.
        let (pool, settings) = store();
        set_module_config(
            &settings,
            &pool,
            "tv.kroma.indexer",
            [("host".to_string(), json!("nas.local")), ("port".to_string(), json!(9117))]
                .into_iter()
                .collect(),
        );
        set_module_config(
            &settings,
            &pool,
            "tv.kroma.indexer",
            [("port".to_string(), json!(9200))].into_iter().collect(),
        );

        let cfg = module_config(&settings, "tv.kroma.indexer");
        assert_eq!(cfg.get("host"), Some(&json!("nas.local")), "an untouched key survives");
        assert_eq!(cfg.get("port"), Some(&json!(9200)), "a named key is overwritten");
    }

    #[test]
    fn enabling_and_configuring_do_not_clobber_each_other() {
        // Both write the same `moduleStates` blob. A read-then-write pair would
        // drop whichever landed first; this is the reason update_entry exists.
        let (pool, settings) = store();
        set_module_config(
            &settings,
            &pool,
            "tv.kroma.whisper",
            [("model".to_string(), json!("small"))].into_iter().collect(),
        );
        set_module_enabled(&settings, &pool, "tv.kroma.whisper", false);

        assert!(!module_enabled(&settings, "tv.kroma.whisper"));
        assert_eq!(module_config(&settings, "tv.kroma.whisper").get("model"), Some(&json!("small")));

        // ...and in the other order, on a second module.
        set_module_enabled(&settings, &pool, "tv.kroma.scene", false);
        set_module_config(
            &settings,
            &pool,
            "tv.kroma.scene",
            [("threshold".to_string(), json!(0.4))].into_iter().collect(),
        );
        assert!(!module_enabled(&settings, "tv.kroma.scene"));
        assert_eq!(module_config(&settings, "tv.kroma.scene").get("threshold"), Some(&json!(0.4)));
        // And the first module is still exactly as it was.
        assert!(!module_enabled(&settings, "tv.kroma.whisper"));
    }

    #[test]
    fn a_blob_written_by_hand_is_read_defensively() {
        // `moduleStates` is a settings value an admin (or an older build) can put
        // anything into; every accessor has to survive the wrong shape rather
        // than panic during boot.
        let (pool, settings) = store();
        settings.update_json(&pool, "moduleStates", |_| json!("not an object"));
        assert!(module_enabled(&settings, "tv.kroma.indexer"));
        assert!(module_config(&settings, "tv.kroma.indexer").is_empty());

        settings.update_json(&pool, "moduleStates", |_| {
            json!({ "tv.kroma.indexer": { "enabled": "yes", "config": [1, 2] } })
        });
        // A non-bool `enabled` is not a false - it is unreadable, so the default
        // stands.
        assert!(module_enabled(&settings, "tv.kroma.indexer"));
        assert!(module_config(&settings, "tv.kroma.indexer").is_empty());

        // Writing over it repairs the entry without losing the id.
        set_module_enabled(&settings, &pool, "tv.kroma.indexer", false);
        assert!(!module_enabled(&settings, "tv.kroma.indexer"));
    }

    #[test]
    fn state_survives_a_reload_from_the_database() {
        // The flag has to outlive the process, which is the whole reason it is in
        // settings rather than memory.
        let (pool, settings) = store();
        set_module_enabled(&settings, &pool, "tv.kroma.vector", false);
        set_module_config(
            &settings,
            &pool,
            "tv.kroma.vector",
            [("dim".to_string(), json!(512))].into_iter().collect(),
        );

        let reloaded = Settings::load(&pool);
        assert!(!module_enabled(&reloaded, "tv.kroma.vector"));
        assert_eq!(module_config(&reloaded, "tv.kroma.vector").get("dim"), Some(&json!(512)));
    }
}

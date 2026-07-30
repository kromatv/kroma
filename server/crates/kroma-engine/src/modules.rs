//! Per-module admin state: the enabled flag + config values each module carries,
//! persisted in the `moduleStates` settings blob (`{ id: { enabled, config } }`).
//! The registry of which modules exist lives in `kroma-module-kernel`.

use serde_json::{json, Map, Value};

use crate::db::Pool;
use crate::services::settings::Settings;

fn states(settings: &Settings) -> Map<String, Value> {
    settings.get("moduleStates").as_object().cloned().unwrap_or_default()
}

// One settings write-lock, so a concurrent enable + config-save cannot clobber
// each other the way a read-then-write pair would.
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

/// True when the module was never toggled.
pub fn module_enabled(settings: &Settings, id: &str) -> bool {
    states(settings)
        .get(id)
        .and_then(|s| s.get("enabled"))
        .and_then(Value::as_bool)
        .unwrap_or(true)
}

pub fn module_config(settings: &Settings, id: &str) -> Map<String, Value> {
    states(settings)
        .get(id)
        .and_then(|s| s.get("config"))
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
}

pub fn set_module_enabled(settings: &Settings, pool: &Pool, id: &str, enabled: bool) {
    update_entry(settings, pool, id, |entry| {
        entry.insert("enabled".into(), json!(enabled));
    });
}

/// Merges into the stored config rather than replacing it.
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
        assert!(module_enabled(&settings, "tv.kroma.indexer"));

        set_module_enabled(&settings, &pool, "tv.kroma.vpn", true);
        assert!(module_enabled(&settings, "tv.kroma.vpn"));
    }

    #[test]
    fn config_merges_rather_than_replaces() {
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

        // The other order, on a second module.
        set_module_enabled(&settings, &pool, "tv.kroma.scene", false);
        set_module_config(
            &settings,
            &pool,
            "tv.kroma.scene",
            [("threshold".to_string(), json!(0.4))].into_iter().collect(),
        );
        assert!(!module_enabled(&settings, "tv.kroma.scene"));
        assert_eq!(module_config(&settings, "tv.kroma.scene").get("threshold"), Some(&json!(0.4)));
        assert!(!module_enabled(&settings, "tv.kroma.whisper"));
    }

    #[test]
    fn a_blob_written_by_hand_is_read_defensively() {
        let (pool, settings) = store();
        settings.update_json(&pool, "moduleStates", |_| json!("not an object"));
        assert!(module_enabled(&settings, "tv.kroma.indexer"));
        assert!(module_config(&settings, "tv.kroma.indexer").is_empty());

        settings.update_json(&pool, "moduleStates", |_| {
            json!({ "tv.kroma.indexer": { "enabled": "yes", "config": [1, 2] } })
        });
        assert!(module_enabled(&settings, "tv.kroma.indexer"));
        assert!(module_config(&settings, "tv.kroma.indexer").is_empty());

        set_module_enabled(&settings, &pool, "tv.kroma.indexer", false);
        assert!(!module_enabled(&settings, "tv.kroma.indexer"));
    }

    #[test]
    fn state_survives_a_reload_from_the_database() {
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

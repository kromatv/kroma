//! The registry list: one pinned official catalog plus any the operator added.
//!
//! Official is always first and always wins an id clash, so a third-party
//! registry cannot shadow an official module with its own build. Everything a
//! registry offers is still gated at install time by the https + published
//! sha256 checks in [`super::install`] — a registry is a *list*, not a trust
//! grant.

use std::collections::HashSet;

use kroma_module_supervisor::Supervisor;
use serde::Deserialize;
use serde_json::{json, Value};

use super::catalog::{self, CatalogModule};
use crate::state::SharedState;

// Bounds on operator input: each accepted entry becomes an outbound request.
const MAX_EXTRA_REGISTRIES: usize = 16;
const MAX_NAME_LEN: usize = 64;
const MAX_URL_LEN: usize = 512;

pub const OFFICIAL_NAME: &str = "Official";

/// One registry after normalization, with the reason it will not be consulted
/// when there is one. Fetching and the admin editor read the same list, so the
/// rows on screen can never disagree with what was actually fetched.
pub struct Registry {
    pub name: String,
    pub url: String,
    pub official: bool,
    pub enabled: bool,
    pub skipped: Option<&'static str>,
}

/// One registry's fetch outcome. A failure is per-registry: the others still
/// produce a catalog, so one unreachable host cannot blank the Store.
pub struct Fetched {
    pub registry: Registry,
    pub modules: Vec<CatalogModule>,
    pub error: Option<String>,
    pub shadowed: Vec<String>,
}

#[derive(Deserialize)]
pub struct StoredRegistry {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub url: String,
    #[serde(default = "enabled_default")]
    pub enabled: bool,
}

fn enabled_default() -> bool {
    true
}

/// The list exactly as saved, including disabled and malformed entries. The
/// admin editor needs all of them; only the vetted ones are fetched.
///
/// Parsed per element: one unreadable entry must not take the rest of the list
/// with it, or a single bad row would blank the editor and the next save would
/// then persist that truncation.
pub fn stored(state: &SharedState) -> Vec<StoredRegistry> {
    let Value::Array(entries) = state.settings.get("moduleRegistries") else {
        return Vec::new();
    };
    entries
        .into_iter()
        .map(|entry| {
            serde_json::from_value(entry).unwrap_or(StoredRegistry {
                name: String::new(),
                url: String::new(),
                enabled: false,
            })
        })
        .collect()
}

/// Every registry in precedence order: the official slot, then each stored entry
/// normalized and vetted.
///
/// `moduleRegistryUrl` says WHERE the official catalog lives, so an operator who
/// pointed the Store at their own keeps exactly that one rather than gaining the
/// built-in catalog back underneath it. An extra must be https: its catalog names
/// the artifact URL *and* the checksum that vouches for it, so fetching it in
/// cleartext hands an on-path attacker both halves. The official slot keeps its
/// tolerance for any scheme — it is one deliberate override, and the test harness
/// points it at a loopback server.
pub fn considered(official_url: String, stored: Vec<StoredRegistry>) -> Vec<Registry> {
    let mut seen: HashSet<String> = [official_url.trim().to_string()].into_iter().collect();
    let mut accepted = 0usize;
    let official = Registry {
        name: OFFICIAL_NAME.to_string(),
        url: official_url,
        official: true,
        enabled: true,
        skipped: None,
    };
    std::iter::once(official)
        .chain(stored.into_iter().map(|entry| {
            let url = entry.url.trim().to_string();
            let name: String = entry.name.trim().chars().take(MAX_NAME_LEN).collect();
            let name = if name.is_empty() { url.clone() } else { name };
            let skipped = if !entry.enabled {
                Some("disabled")
            } else if url.len() > MAX_URL_LEN {
                Some("not consulted: the URL is too long")
            } else if !url.starts_with("https://") {
                Some("not consulted: a registry URL must be https")
            } else if !seen.insert(url.clone()) {
                Some("not consulted: already listed")
            } else if accepted >= MAX_EXTRA_REGISTRIES {
                Some("not consulted: past the registry limit")
            } else {
                accepted += 1;
                None
            };
            Registry { name, url, official: false, enabled: entry.enabled, skipped }
        }))
        .collect()
}

// `claimed` carries precedence across the walk: whoever inserts an id first
// keeps it.
fn merge_one(
    registry: Registry,
    mut modules: Vec<CatalogModule>,
    error: Option<String>,
    claimed: &mut HashSet<String>,
) -> Fetched {
    let mut shadowed = Vec::new();
    modules.retain(|m| {
        if claimed.insert(m.id.clone()) {
            return true;
        }
        shadowed.push(m.id.clone());
        false
    });
    Fetched { registry, modules, error, shadowed }
}

/// Fetch every registry and resolve id clashes in precedence order. Skipped rows
/// come back too, carrying their reason, so one pass produces both the merged
/// catalog and every row the editor shows.
///
/// Sequential: each fetch is bounded by the supervisor's catalog timeout, so this
/// costs a round trip per consulted registry rather than an unbounded stall.
pub async fn fetch_all(state: &SharedState, sup: &Supervisor) -> Vec<Fetched> {
    let mut claimed: HashSet<String> = HashSet::new();
    let mut out = Vec::new();
    for registry in considered(catalog::registry_url(state), stored(state)) {
        if registry.skipped.is_some() {
            out.push(Fetched { registry, modules: Vec::new(), error: None, shadowed: Vec::new() });
            continue;
        }
        let (modules, error) = match catalog::fetch(sup, &registry.url).await {
            Ok(modules) => (modules, None),
            Err(e) => (Vec::new(), Some(format!("{e:#}"))),
        };
        out.push(merge_one(registry, modules, error, &mut claimed));
    }
    out
}

/// The merged catalog for install and update resolution.
///
/// A failed OFFICIAL fetch is an error, not an empty list: official claims its
/// ids first, so treating an outage as "official offers nothing" would let a
/// third-party registry supply a first-party id — and auto-update would then
/// install it unattended. An extra registry failing is tolerated and logged.
pub async fn fetch_merged(state: &SharedState, sup: &Supervisor) -> anyhow::Result<Vec<CatalogModule>> {
    let fetched = fetch_all(state, sup).await;
    for f in &fetched {
        let Some(error) = &f.error else { continue };
        if f.registry.official {
            anyhow::bail!("registry {} is unreachable: {error}", f.registry.url);
        }
        tracing::warn!(registry = %f.registry.url, %error, "module registry unreachable; skipped");
    }
    Ok(fetched.into_iter().flat_map(|f| f.modules).collect())
}

/// Every registry row the admin editor shows, straight off the one pass that
/// fetched them — disabled and malformed entries included, each carrying the
/// reason it was skipped, so the editor can display and fix them.
pub fn status(fetched: &[Fetched]) -> Value {
    let rows: Vec<Value> = fetched
        .iter()
        .map(|f| {
            json!({
                "name": f.registry.name,
                "url": f.registry.url,
                "official": f.registry.official,
                "enabled": f.registry.enabled,
                "skipped": f.registry.skipped,
                "error": f.error,
                "moduleCount": f.modules.len(),
                "shadowed": f.shadowed,
            })
        })
        .collect();
    Value::Array(rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reg(name: &str, url: &str, official: bool) -> Registry {
        Registry { name: name.into(), url: url.into(), official, enabled: true, skipped: None }
    }

    fn module(id: &str, version: &str) -> CatalogModule {
        catalog::test_module(id, version)
    }

    // Drives `merge_one`, the same step `fetch_all` walks the registry list with.
    fn merge(input: Vec<(Registry, Vec<CatalogModule>)>) -> Vec<Fetched> {
        let mut claimed: HashSet<String> = HashSet::new();
        input
            .into_iter()
            .map(|(registry, modules)| merge_one(registry, modules, None, &mut claimed))
            .collect()
    }

    #[test]
    fn official_wins_an_id_declared_by_a_later_registry() {
        let merged = merge(vec![
            (reg(OFFICIAL_NAME, "https://o", true), vec![module("tv.kroma.a", "1.0.0")]),
            (
                reg("Third party", "https://x", false),
                // A higher version does NOT let a third party take the id over.
                vec![module("tv.kroma.a", "9.9.9"), module("tv.x.b", "0.1.0")],
            ),
        ]);
        assert_eq!(merged[0].modules.len(), 1);
        assert_eq!(merged[0].modules[0].version, "1.0.0");
        assert_eq!(merged[1].shadowed, vec!["tv.kroma.a"]);
        assert_eq!(merged[1].modules.len(), 1);
        assert_eq!(merged[1].modules[0].id, "tv.x.b");
    }

    fn stored_entry(name: &str, url: &str, enabled: bool) -> StoredRegistry {
        StoredRegistry { name: name.into(), url: url.into(), enabled }
    }

    #[test]
    fn every_rejected_entry_is_kept_with_the_reason_it_was_skipped() {
        let out = considered(
            "https://official".into(),
            vec![
                stored_entry("Cleartext", "http://insecure/modules.json", true),
                stored_entry("Disabled", "https://off/modules.json", false),
                stored_entry("Good", " https://good/modules.json ", true),
                stored_entry("Dupe", "https://good/modules.json", true),
                stored_entry("Same as official", "https://official", true),
                stored_entry("", "https://unnamed/modules.json", true),
            ],
        );
        assert!(out[0].official, "official is first, so it claims ids first");
        assert!(out[0].skipped.is_none());
        // Nothing is dropped: the editor must be able to show and fix each one.
        let extras = &out[1..];
        assert_eq!(extras.len(), 6);
        let skipped: Vec<bool> = extras.iter().map(|c| c.skipped.is_some()).collect();
        assert_eq!(skipped, vec![true, true, false, true, true, false]);
        assert_eq!(extras[2].url, "https://good/modules.json", "url is trimmed");
        assert_eq!(extras[5].name, "https://unnamed/modules.json", "empty name falls back to url");
    }

    #[test]
    fn the_extra_registry_count_is_capped() {
        let many = (0..MAX_EXTRA_REGISTRIES + 5)
            .map(|i| stored_entry("r", &format!("https://r{i}/modules.json"), true))
            .collect();
        let out = considered("https://official".into(), many);
        let extras = &out[1..];
        assert_eq!(extras.iter().filter(|c| c.skipped.is_none()).count(), MAX_EXTRA_REGISTRIES);
        assert_eq!(extras.len(), MAX_EXTRA_REGISTRIES + 5, "over-cap entries are still listed");
    }

    #[test]
    fn a_long_name_is_truncated_once_for_both_the_fetch_and_the_editor() {
        let out = considered(
            "https://official".into(),
            vec![stored_entry(&"x".repeat(200), "https://a", true)],
        );
        assert_eq!(out[1].name.chars().count(), MAX_NAME_LEN);
    }

    #[test]
    fn an_over_long_url_is_listed_with_its_reason_rather_than_fetched() {
        let long = format!("https://x/{}", "y".repeat(MAX_URL_LEN));
        let out = considered("https://official".into(), vec![stored_entry("Long", &long, true)]);
        assert_eq!(out[1].skipped, Some("not consulted: the URL is too long"));
    }

    #[tokio::test]
    async fn one_unreadable_saved_entry_does_not_take_the_rest_of_the_list_with_it() {
        let t = crate::api::test_support::test_app();
        t.state.settings.set_patch(
            &t.state.db,
            [(
                "moduleRegistries".to_string(),
                json!([
                    { "name": "Kept", "url": "https://a/modules.json" },
                    "not an object at all",
                    { "name": "Also kept", "url": "https://b/modules.json", "enabled": false },
                ]),
            )]
            .into_iter()
            .collect(),
        );

        let saved = stored(&t.state);
        assert_eq!(saved.len(), 3, "the editor must be able to see and fix the bad row");
        assert_eq!(saved[0].url, "https://a/modules.json");
        assert!(saved[0].enabled);
        assert!(saved[1].url.is_empty());
        assert!(!saved[1].enabled);
        assert!(!saved[2].enabled);
    }

    #[tokio::test]
    async fn a_setting_that_is_not_a_list_reads_as_no_extra_registries() {
        let t = crate::api::test_support::test_app();
        assert!(stored(&t.state).is_empty(), "unset means none");
        t.state.settings.set_patch(
            &t.state.db,
            [("moduleRegistries".to_string(), json!("https://a/modules.json"))].into_iter().collect(),
        );
        assert!(stored(&t.state).is_empty());
    }

    #[test]
    fn earlier_third_party_shadows_a_later_one() {
        let merged = merge(vec![
            (reg(OFFICIAL_NAME, "https://o", true), vec![]),
            (reg("First", "https://a", false), vec![module("tv.x.b", "1.0.0")]),
            (reg("Second", "https://b", false), vec![module("tv.x.b", "2.0.0")]),
        ]);
        assert_eq!(merged[1].modules[0].version, "1.0.0");
        assert_eq!(merged[2].shadowed, vec!["tv.x.b"]);
    }
}

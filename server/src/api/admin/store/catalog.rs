//! Registry catalog: normalize the index `bun run modules registry` emits, pick
//! the artifact for this build target, enrich with installed/update state.
//! Legacy schema 1 (a flat `url`/`size`/`sha256`) still parses as one artifact.

use kroma_module_host::HostCtx;
use kroma_module_supervisor::Supervisor;
use serde_json::{json, Value};

use crate::state::SharedState;

const BUILD_TARGET: &str = env!("KROMA_BUILD_TARGET");

const SERVER_VERSION: &str = env!("CARGO_PKG_VERSION");

/// One downloadable `.kmod` build. `target = None` means the bundle is
/// platform-independent (a library module: manifest + FE only).
pub struct Artifact {
    pub target: Option<String>,
    pub url: String,
    pub size: Option<u64>,
    pub sha256: Option<String>,
}

pub struct CatalogModule {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub min_server: Option<String>,
    pub library: bool,
    pub icon: Option<String>,
    // `(module id, optional semver range)`.
    pub depends_on: Vec<(String, Option<String>)>,
    // Same shape; offered as an opt-in at install time, never auto-pulled.
    pub optional_depends_on: Vec<(String, Option<String>)>,
    // `(kind, id)` capabilities this module provides (e.g. download-client).
    pub provides: Vec<(String, String)>,
    // `(kind, optional provider id)` capabilities it needs SOMEONE to provide;
    // the install planner suggests providers for the unsatisfied ones.
    pub requires: Vec<(String, Option<String>)>,
    pub artifacts: Vec<Artifact>,
}

/// The `moduleRegistryUrl` setting, or the built-in default when unset/blank.
pub fn registry_url(state: &SharedState) -> String {
    let u = state.setting_str("moduleRegistryUrl", super::DEFAULT_REGISTRY);
    if u.trim().is_empty() { super::DEFAULT_REGISTRY.to_string() } else { u }
}

pub async fn fetch(sup: &Supervisor, url: &str) -> anyhow::Result<Vec<CatalogModule>> {
    let raw = sup.fetch_catalog(url).await?;
    let modules: Vec<CatalogModule> = raw
        .get("modules")
        .and_then(Value::as_array)
        .map(|mods| mods.iter().filter_map(parse_module).collect())
        .unwrap_or_default();
    // A registry proxy (the first-party worker) degrades to an EMPTY catalog
    // carrying an `error` field when its upstream is down. That must count as
    // a fetch failure, not a catalog that offers nothing: an official outage
    // reported as "0 modules" would let a lower-priority registry claim
    // first-party ids, and auto-update would install its copies unattended.
    if modules.is_empty() {
        if let Some(error) = raw.get("error").and_then(Value::as_str) {
            anyhow::bail!("registry reports: {error}");
        }
    }
    Ok(modules)
}


fn parse_module(m: &Value) -> Option<CatalogModule> {
    let id = m.get("id")?.as_str()?.to_string();
    let str_of = |k: &str| m.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
    let artifacts: Vec<Artifact> = match m.get("artifacts").and_then(Value::as_array) {
        Some(list) => list.iter().filter_map(parse_artifact).collect(),
        // Schema 1 carries no target metadata: platform-independent.
        None => m
            .get("url")
            .and_then(Value::as_str)
            .map(|url| Artifact {
                target: None,
                url: url.to_string(),
                size: m.get("size").and_then(Value::as_u64),
                sha256: m.get("sha256").and_then(Value::as_str).map(str::to_string),
            })
            .into_iter()
            .collect(),
    };
    let depends_on = parse_deps(m, "dependsOn");
    let optional_depends_on = parse_deps(m, "optionalDependsOn");
    let provides = m
        .get("provides")
        .and_then(Value::as_array)
        .map(|caps| {
            caps.iter()
                .filter_map(|c| {
                    Some((
                        c.get("kind")?.as_str()?.to_string(),
                        c.get("id")?.as_str()?.to_string(),
                    ))
                })
                .collect()
        })
        .unwrap_or_default();
    let requires = m
        .get("requires")
        .and_then(Value::as_array)
        .map(|reqs| {
            reqs.iter()
                .filter_map(|r| {
                    Some((
                        r.get("kind")?.as_str()?.to_string(),
                        r.get("id").and_then(Value::as_str).map(str::to_string),
                    ))
                })
                .collect()
        })
        .unwrap_or_default();
    // Only an inline data image of a sane size may reach the admin page's
    // <img>; anything else from a third-party catalog is dropped.
    let icon = m
        .get("icon")
        .and_then(Value::as_str)
        .filter(|s| s.starts_with("data:image/") && s.len() <= 128 * 1024)
        .map(str::to_string);
    Some(CatalogModule {
        id,
        name: str_of("name"),
        version: str_of("version"),
        description: str_of("description"),
        min_server: m.get("minServer").and_then(Value::as_str).map(str::to_string),
        library: m.get("library").and_then(Value::as_bool).unwrap_or(false),
        icon,
        depends_on,
        optional_depends_on,
        provides,
        requires,
        artifacts,
    })
}

// A `{ "<id>": "<range>" }` dependency map; `"*"`/blank ranges normalize away.
fn parse_deps(m: &Value, key: &str) -> Vec<(String, Option<String>)> {
    m.get(key)
        .and_then(Value::as_object)
        .map(|deps| {
            deps.iter()
                .map(|(dep_id, range)| {
                    let range = range
                        .as_str()
                        .map(str::trim)
                        .filter(|r| !r.is_empty() && *r != "*")
                        .map(str::to_string);
                    (dep_id.clone(), range)
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_artifact(a: &Value) -> Option<Artifact> {
    Some(Artifact {
        target: a.get("target").and_then(Value::as_str).map(str::to_string),
        url: a.get("url")?.as_str()?.to_string(),
        size: a.get("size").and_then(Value::as_u64),
        sha256: a.get("sha256").and_then(Value::as_str).map(str::to_string),
    })
}

/// Preference order: exact build-target match, then a platform-independent
/// bundle, then a musl build of the same arch (static, so it runs on glibc too).
pub fn pick_artifact(m: &CatalogModule) -> Option<&Artifact> {
    pick_for(&m.artifacts, BUILD_TARGET)
}

fn pick_for<'a>(artifacts: &'a [Artifact], host: &str) -> Option<&'a Artifact> {
    if let Some(a) = artifacts.iter().find(|a| a.target.as_deref() == Some(host)) {
        return Some(a);
    }
    if let Some(a) = artifacts.iter().find(|a| a.target.is_none()) {
        return Some(a);
    }
    let musl = host.replace("-gnu", "-musl");
    if musl != host {
        return artifacts.iter().find(|a| a.target.as_deref() == Some(musl.as_str()));
    }
    None
}


fn dep_rows(deps: &[(String, Option<String>)]) -> Vec<Value> {
    deps.iter().map(|(id, range)| json!({ "id": id, "version": range })).collect()
}

fn cap_rows<I: serde::Serialize>(caps: &[(String, I)]) -> Vec<Value> {
    caps.iter().map(|(kind, id)| json!({ "kind": kind, "id": id })).collect()
}
pub fn compat_verdict(m: &CatalogModule) -> (bool, Option<String>) {
    if !kroma_module_manifest::server_satisfies(m.min_server.as_deref(), SERVER_VERSION) {
        let needs = m.min_server.as_deref().unwrap_or("?");
        return (false, Some(format!("requires KROMA server {needs} (this server is {SERVER_VERSION})")));
    }
    if pick_artifact(m).is_none() {
        return (false, Some(format!("no build for this server's platform ({BUILD_TARGET})")));
    }
    (true, None)
}

/// The `GET /api/admin/store/catalog` response, merged across every configured
/// registry. Field names stay a superset of the legacy schema-1 passthrough, so
/// an older client keeps working: `registryUrl` and a top-level `error` still
/// describe the OFFICIAL registry, which is the only one such a client knew.
pub fn enriched(state: &SharedState, fetched: &[super::registries::Fetched]) -> Value {
    let installed: std::collections::HashMap<String, String> =
        kroma_module_kernel::manifests(state).into_iter().map(|m| (m.id, m.version)).collect();
    let entries: Vec<Value> = fetched
        .iter()
        .flat_map(|f| f.modules.iter().map(move |m| (m, f.registry.name.as_str())))
        .map(|(m, source)| {
            let artifact = pick_artifact(m);
            let installed_version = installed.get(&m.id);
            let (compatible, reason) = compat_verdict(m);
            let update_available = installed_version
                .is_some_and(|current| kroma_module_manifest::is_newer(&m.version, current));
            json!({
                "id": m.id,
                "name": m.name,
                "version": m.version,
                "description": m.description,
                "library": m.library,
                "icon": m.icon,
                "minServer": m.min_server,
                "dependsOn": dep_rows(&m.depends_on),
                "optionalDependsOn": dep_rows(&m.optional_depends_on),
                "provides": cap_rows(&m.provides),
                "requires": cap_rows(&m.requires),
                "target": artifact.and_then(|a| a.target.clone()),
                "url": artifact.map(|a| a.url.clone()),
                "size": artifact.and_then(|a| a.size),
                "sha256": artifact.and_then(|a| a.sha256.clone()),
                "installedVersion": installed_version,
                "updateAvailable": update_available,
                "compatible": compatible,
                "reason": reason,
                "source": source,
            })
        })
        .collect();
    let official = fetched.iter().find(|f| f.registry.official);
    json!({
        "schema": 2,
        "serverVersion": SERVER_VERSION,
        "target": BUILD_TARGET,
        "registryUrl": official.map(|f| f.registry.url.as_str()).unwrap_or_default(),
        "error": official.and_then(|f| f.error.clone()),
        "registries": super::registries::status(fetched),
        "modules": entries,
    })
}

// Bare catalog entry for the store tests; each test sets what it needs via
// struct update.
#[cfg(test)]
pub(super) fn test_module(id: &str, version: &str) -> CatalogModule {
    CatalogModule {
        id: id.into(),
        name: id.into(),
        version: version.into(),
        description: String::new(),
        min_server: None,
        library: false,
        icon: None,
        depends_on: Vec::new(),
        optional_depends_on: Vec::new(),
        provides: Vec::new(),
        requires: Vec::new(),
        artifacts: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn artifact(target: Option<&str>) -> Artifact {
        Artifact {
            target: target.map(str::to_string),
            url: format!("https://x/{}.kmod", target.unwrap_or("universal")),
            size: Some(1),
            sha256: Some("00".into()),
        }
    }

    #[test]
    fn pick_prefers_exact_target_then_universal_then_musl() {
        let arts = vec![
            artifact(Some("x86_64-unknown-linux-musl")),
            artifact(Some("aarch64-unknown-linux-musl")),
        ];
        let picked = pick_for(&arts, "x86_64-unknown-linux-musl").unwrap();
        assert_eq!(picked.target.as_deref(), Some("x86_64-unknown-linux-musl"));
        let picked = pick_for(&arts, "x86_64-unknown-linux-gnu").unwrap();
        assert_eq!(picked.target.as_deref(), Some("x86_64-unknown-linux-musl"));
        assert!(pick_for(&arts, "aarch64-apple-darwin").is_none());
        let with_universal = vec![artifact(Some("x86_64-unknown-linux-musl")), artifact(None)];
        let picked = pick_for(&with_universal, "aarch64-apple-darwin").unwrap();
        assert!(picked.target.is_none());
    }

    #[test]
    fn parse_handles_schema_2_and_legacy_schema_1() {
        let v2: Value = serde_json::from_str(
            r#"{ "id": "a.b", "name": "AB", "version": "0.2.0", "minServer": "0.1.4",
                 "library": false,
                 "dependsOn": { "c.d": "^0.1.0", "e.f": "*" },
                 "optionalDependsOn": { "g.h": "^0.2.0" },
                 "provides": [{ "kind": "download-client", "id": "qbittorrent", "label": "qBittorrent" }],
                 "requires": [{ "kind": "indexer-engine" }, { "kind": "download-client", "id": "rqbit" }],
                 "artifacts": [{ "target": "x86_64-unknown-linux-musl",
                                 "url": "https://x/a.b-x86_64-unknown-linux-musl.kmod",
                                 "size": 5, "sha256": "ab" }] }"#,
        )
        .unwrap();
        let m = parse_module(&v2).unwrap();
        assert_eq!(m.version, "0.2.0");
        assert_eq!(m.min_server.as_deref(), Some("0.1.4"));
        assert_eq!(
            m.depends_on,
            vec![("c.d".to_string(), Some("^0.1.0".to_string())), ("e.f".to_string(), None)]
        );
        assert_eq!(m.optional_depends_on, vec![("g.h".to_string(), Some("^0.2.0".to_string()))]);
        assert_eq!(m.provides, vec![("download-client".to_string(), "qbittorrent".to_string())]);
        assert_eq!(
            m.requires,
            vec![
                ("indexer-engine".to_string(), None),
                ("download-client".to_string(), Some("rqbit".to_string())),
            ]
        );
        assert_eq!(m.artifacts.len(), 1);
        assert_eq!(m.artifacts[0].target.as_deref(), Some("x86_64-unknown-linux-musl"));

        let v1: Value = serde_json::from_str(
            r#"{ "id": "a.b", "name": "AB", "version": "0.1.0",
                 "url": "https://x/a.b.kmod", "size": 5, "sha256": "ab" }"#,
        )
        .unwrap();
        let m = parse_module(&v1).unwrap();
        assert_eq!(m.artifacts.len(), 1);
        assert!(m.artifacts[0].target.is_none());
        assert_eq!(m.artifacts[0].sha256.as_deref(), Some("ab"));
    }
}

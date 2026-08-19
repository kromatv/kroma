//! Registry catalog: read an RFC 110 registry into one module list, pick the
//! artifact for this build target, enrich with installed/update state.
//!
//! One shape, not three. A registry URL is either the `registry.json` descriptor
//! (followed to the `index.json` beside it) or that index directly. The older
//! `{ "modules": [...] }` catalogs are not read: their fields moved, and the
//! moved ones parse as ABSENT rather than as errors, so accepting them would
//! offer modules with their dependencies and checksums quietly missing.

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
    /// The manifest contract the bundle was built against; `0` when the registry
    /// row predates the field, which is the same answer as "too old".
    pub schema_version: u64,
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    /// What the module needs from its host, by engine name and semver range.
    pub engines: std::collections::BTreeMap<String, String>,
    pub library: bool,
    pub icon: Option<String>,
    // `(module id, optional semver range)`.
    pub dependencies: Vec<(String, Option<String>)>,
    // Same shape; offered as an opt-in at install time, never auto-pulled.
    pub optional_dependencies: Vec<(String, Option<String>)>,
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

/// The registry contract this server speaks. A document declaring a higher one
/// is refused rather than half-read: an unknown major means fields this build
/// would silently ignore.
const REGISTRY_API_VERSION: u64 = 1;

/// The one-request module list an RFC 110 descriptor fronts, resolved against
/// the URL the descriptor was actually FETCHED from rather than the `url` it
/// declares - a registry does not get to redirect a client somewhere else by
/// describing itself as living there.
fn index_url(descriptor: &Value, fetched_from: &str) -> anyhow::Result<Option<String>> {
    let Some(schema_version) = descriptor.get("apiVersion").and_then(Value::as_u64) else {
        return Ok(None);
    };
    // `modules` holds ids in a descriptor and records in a catalog.
    let ids_only = descriptor
        .get("modules")
        .and_then(Value::as_array)
        .is_some_and(|m| m.iter().all(Value::is_string));
    if !ids_only {
        return Ok(None);
    }
    anyhow::ensure!(
        schema_version <= REGISTRY_API_VERSION,
        "registry speaks apiVersion {schema_version}; this server speaks {REGISTRY_API_VERSION}",
    );
    Ok(Some(kroma_module_supervisor::sibling_url(fetched_from, "index.json")?))
}

pub async fn fetch(sup: &Supervisor, url: &str) -> anyhow::Result<Vec<CatalogModule>> {
    let mut raw = sup.fetch_catalog(url).await?;
    if let Some(index) = index_url(&raw, url)? {
        raw = sup.fetch_catalog(&index).await?;
    }
    let Value::Array(entries) = &raw else {
        anyhow::bail!("not an RFC 110 registry: expected a descriptor or a module index");
    };
    Ok(entries.iter().filter_map(parse_module).collect())
}


fn parse_module(m: &Value) -> Option<CatalogModule> {
    let id = m.get("id")?.as_str()?.to_string();
    let str_of = |k: &str| m.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
    let artifacts: Vec<Artifact> = m
        .get("artifacts")
        .and_then(Value::as_array)
        .map(|list| list.iter().filter_map(parse_artifact).collect())
        .unwrap_or_default();
    let dependencies = parse_deps(m, "dependencies");
    let optional_dependencies = parse_deps(m, "optionalDependencies");
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
        schema_version: m.get("schemaVersion").and_then(Value::as_u64).unwrap_or(0),
        id,
        name: str_of("name"),
        version: str_of("version"),
        description: str_of("description"),
        engines: m
            .get("engines")
            .and_then(Value::as_object)
            .map(|e| {
                e.iter()
                    .filter_map(|(k, v)| Some((k.clone(), v.as_str()?.to_string())))
                    .collect()
            })
            .unwrap_or_default(),
        library: m.get("library").and_then(Value::as_bool).unwrap_or(false),
        icon,
        dependencies,
        optional_dependencies,
        provides,
        requires,
        artifacts,
    })
}

// A `{ "<id>": "<range>" }` dependency map; `"*"`/blank ranges normalize away.
fn parse_deps(m: &Value, key: &str) -> Vec<(String, Option<String>)> {
    let Some(deps) = m.get(key).and_then(Value::as_object) else {
        return Vec::new();
    };
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
}

/// A Subresource-Integrity string (`sha256-<base64>`, RFC 110's mandatory
/// artifact checksum) as the hex digest the installer compares against, or
/// `None` when it is not one this server can check.
pub fn sha256_from_sri(integrity: &str) -> Option<String> {
    use base64::Engine as _;
    let encoded = integrity.trim().strip_prefix("sha256-")?;
    let raw = base64::engine::general_purpose::STANDARD.decode(encoded).ok()?;
    (raw.len() == 32).then(|| hex::encode(raw))
}

fn parse_artifact(a: &Value) -> Option<Artifact> {
    let integrity = a.get("integrity").and_then(Value::as_str).and_then(sha256_from_sri);
    Some(Artifact {
        target: a.get("target").and_then(Value::as_str).map(str::to_string),
        url: a.get("url")?.as_str()?.to_string(),
        size: a.get("size").and_then(Value::as_u64),
        sha256: integrity.or_else(|| a.get("sha256").and_then(Value::as_str).map(str::to_string)),
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


// The `{ id: range }` map a manifest and a registry record both use; a declared
// "no constraint" serializes back as the wildcard it came from.
fn dep_map(deps: &[(String, Option<String>)]) -> Value {
    Value::Object(
        deps.iter()
            .map(|(id, range)| (id.clone(), json!(range.as_deref().unwrap_or("*"))))
            .collect(),
    )
}

fn cap_rows<I: serde::Serialize>(caps: &[(String, I)]) -> Vec<Value> {
    caps.iter().map(|(kind, id)| json!({ "kind": kind, "id": id })).collect()
}
pub fn compat_verdict(m: &CatalogModule) -> (bool, Option<String>) {
    // Refused at unpack anyway (see the supervisor's install gate); said here so
    // the Store never offers an install that cannot succeed.
    let speaks = u64::from(kroma_module_manifest::MODULE_SCHEMA_VERSION);
    if m.schema_version != speaks {
        return (
            false,
            Some(format!(
                "built for manifest schema v{} (this server speaks v{speaks}); it needs rebuilding",
                m.schema_version,
            )),
        );
    }
    if let Err(reason) = kroma_module_manifest::engines_satisfied(&m.engines, SERVER_VERSION) {
        return (false, Some(reason));
    }
    if pick_artifact(m).is_none() {
        return (false, Some(format!("no build for this server's platform ({BUILD_TARGET})")));
    }
    (true, None)
}

/// The `GET /api/admin/store/catalog` response, merged across every configured
/// registry. `registryUrl` and the top-level `error` describe the OFFICIAL
/// registry, which is the only one an older client knew about.
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
                "schemaVersion": m.schema_version,
                "id": m.id,
                "name": m.name,
                "version": m.version,
                "description": m.description,
                "library": m.library,
                "icon": m.icon,
                "engines": m.engines,
                "dependencies": dep_map(&m.dependencies),
                "optionalDependencies": dep_map(&m.optional_dependencies),
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
        schema_version: u64::from(kroma_module_manifest::MODULE_SCHEMA_VERSION),
        id: id.into(),
        name: id.into(),
        version: version.into(),
        description: String::new(),
        engines: std::collections::BTreeMap::new(),
        library: false,
        icon: None,
        dependencies: Vec::new(),
        optional_dependencies: Vec::new(),
        provides: Vec::new(),
        requires: Vec::new(),
        artifacts: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base64_of(hex: &str) -> String {
        use base64::Engine as _;
        base64::engine::general_purpose::STANDARD.encode(hex::decode(hex).unwrap())
    }

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
    fn an_sri_checksum_becomes_the_hex_digest_the_installer_compares() {
        let hex = "ab".repeat(32);
        let sri = format!("sha256-{}", base64_of(&hex));
        assert_eq!(sha256_from_sri(&sri).as_deref(), Some(hex.as_str()));
        assert_eq!(sha256_from_sri(&format!("  {sri}  ")).as_deref(), Some(hex.as_str()));
    }

    #[test]
    fn an_integrity_this_server_cannot_check_is_refused_rather_than_trusted() {
        assert!(sha256_from_sri("md5-abc").is_none());
        assert!(sha256_from_sri("nonsense").is_none());
        assert!(sha256_from_sri("sha256-!!!").is_none());
        // Right prefix, wrong digest length: a truncated hash must not pass.
        assert!(sha256_from_sri("sha256-3q2+7w==").is_none());
    }

    #[test]
    fn parse_reads_an_rfc_110_record() {
        let rfc: Value = serde_json::from_str(&format!(
            r#"{{ "id": "a.b", "name": "AB", "version": "0.2.0", "engines": {{ "server": ">=0.1.4" }},
                  "dependencies": {{ "c.d": "^0.1.0" }},
                  "optionalDependencies": {{ "g.h": "^0.2.0" }},
                  "artifacts": [{{ "target": "x86_64-unknown-linux-musl",
                                   "url": "https://x/a.b.kmod", "size": 5,
                                   "integrity": "sha256-{}" }}] }}"#,
            base64_of(&"cd".repeat(32)),
        ))
        .unwrap();
        let m = parse_module(&rfc).unwrap();
        assert_eq!(m.dependencies, vec![("c.d".to_string(), Some("^0.1.0".to_string()))]);
        assert_eq!(m.optional_dependencies, vec![("g.h".to_string(), Some("^0.2.0".to_string()))]);
        assert_eq!(m.artifacts[0].sha256.as_deref(), Some("cd".repeat(32).as_str()));
    }

    #[test]
    fn a_descriptor_is_followed_to_the_index_beside_it_and_a_catalog_is_not() {
        let descriptor: Value = serde_json::from_str(
            r#"{ "apiVersion": 1, "name": "R", "url": "https://elsewhere.example",
                 "modules": ["a.b", "c.d"] }"#,
        )
        .unwrap();
        assert_eq!(
            index_url(&descriptor, "https://r.example/registry.json").unwrap().as_deref(),
            // Resolved against where it was fetched, NOT the `url` it declares.
            Some("https://r.example/index.json"),
        );

        let catalog: Value =
            serde_json::from_str(r#"{ "schema": 2, "modules": [{ "id": "a.b" }] }"#).unwrap();
        assert!(index_url(&catalog, "https://r.example/modules.json").unwrap().is_none());
    }

    #[test]
    fn a_registry_speaking_a_newer_contract_is_refused() {
        let future: Value =
            serde_json::from_str(r#"{ "apiVersion": 2, "modules": ["a.b"] }"#).unwrap();
        let err = index_url(&future, "https://r.example/registry.json").unwrap_err();
        assert!(err.to_string().contains("apiVersion 2"), "{err}");
    }

    #[test]
    fn parse_reads_a_full_record() {
        let entry: Value = serde_json::from_str(
            r#"{ "schemaVersion": 2, "id": "a.b", "name": "AB", "version": "0.2.0",
                 "engines": { "server": ">=0.1.4" }, "library": false,
                 "dependencies": { "c.d": "^0.1.0", "e.f": "*" },
                 "optionalDependencies": { "g.h": "^0.2.0" },
                 "provides": [{ "kind": "download-client", "id": "qbittorrent", "label": "qBittorrent" }],
                 "requires": [{ "kind": "indexer-engine" }, { "kind": "download-client", "id": "rqbit" }],
                 "artifacts": [{ "target": "x86_64-unknown-linux-musl",
                                 "url": "https://x/a.b-x86_64-unknown-linux-musl.kmod",
                                 "size": 5, "sha256": "ab" }] }"#,
        )
        .unwrap();
        let m = parse_module(&entry).unwrap();
        assert_eq!(m.schema_version, 2);
        assert_eq!(m.version, "0.2.0");
        assert_eq!(m.engines.get("server").map(String::as_str), Some(">=0.1.4"));
        // A "*" range normalizes away, so the planner sees "no constraint".
        assert_eq!(
            m.dependencies,
            vec![("c.d".to_string(), Some("^0.1.0".to_string())), ("e.f".to_string(), None)]
        );
        assert_eq!(m.optional_dependencies, vec![("g.h".to_string(), Some("^0.2.0".to_string()))]);
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
    }

    #[test]
    fn a_record_built_for_another_contract_is_listed_but_not_offered() {
        // Not dropped: the Store shows it with the reason, which is more use than
        // a module silently missing from the shelf.
        let old: Value = serde_json::from_str(
            r#"{ "id": "a.b", "name": "AB", "version": "0.1.0",
                 "artifacts": [{ "target": null, "url": "https://x/a.b.kmod" }] }"#,
        )
        .unwrap();
        let m = parse_module(&old).unwrap();
        assert_eq!(m.schema_version, 0);
        let (compatible, reason) = compat_verdict(&m);
        assert!(!compatible);
        assert!(reason.unwrap_or_default().contains("manifest schema v0"));
    }
}

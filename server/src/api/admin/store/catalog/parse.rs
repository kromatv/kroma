//! Reading a registry: following a descriptor to its index, and each record into
//! a [`CatalogModule`].

use kroma_module_supervisor::Supervisor;
use serde_json::Value;

use super::{Artifact, CatalogModule};

/// The registry contract this server speaks. A document declaring a higher one
/// is refused rather than half-read: an unknown major means fields this build
/// would silently ignore.
const REGISTRY_API_VERSION: u64 = 1;

/// The one-request module list an RFC 110 descriptor fronts, resolved against
/// the URL the descriptor was actually FETCHED from rather than the `url` it
/// declares - a registry does not get to redirect a client somewhere else by
/// describing itself as living there.
pub(super) fn index_url(descriptor: &Value, fetched_from: &str) -> anyhow::Result<Option<String>> {
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
    Ok(Some(kroma_module_supervisor::sibling_url(
        fetched_from,
        "index.json",
    )?))
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

pub(super) fn parse_module(m: &Value) -> Option<CatalogModule> {
    let id = m.get("id")?.as_str()?.to_string();
    let str_of = |k: &str| {
        m.get(k)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    };
    let artifacts: Vec<Artifact> = m
        .get("artifacts")
        .and_then(Value::as_array)
        .map(|list| list.iter().filter_map(parse_artifact).collect())
        .unwrap_or_default();
    let dependencies = parse_deps(m, "dependencies");
    let optional_dependencies = parse_deps(m, "optionalDependencies");
    let contributes = parse_points(m, "contributes");
    let consumes = parse_points(m, "consumes");
    // Only an inline data image of a sane size may reach the admin page's
    // <img>; anything else from a third-party catalog is dropped.
    let icon = m
        .get("icon")
        .and_then(Value::as_str)
        .filter(|s| s.starts_with("data:image/") && s.len() <= 128 * 1024)
        .map(str::to_string);
    Some(CatalogModule {
        official: false,
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
        contributes,
        consumes,
        artifacts,
        permissions: declared(m, "permissions"),
        storage: declared(m, "storage"),
        settings: declared(m, "settings"),
        helpers: declared(m, "helpers"),
    })
}

fn declared<T: serde::de::DeserializeOwned>(m: &Value, key: &str) -> Option<T> {
    m.get(key)
        .and_then(|block| serde_json::from_value(block.clone()).ok())
}

// `contributes` and `consumes` are the same shape on the wire: a point, and an
// optional instance. An entry naming no point is not addressable and is dropped
// rather than guessed at.
fn parse_points(m: &Value, key: &str) -> Vec<(String, Option<String>)> {
    m.get(key)
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .filter_map(|e| {
                    Some((
                        e.get("point")?.as_str()?.to_string(),
                        e.get("id").and_then(Value::as_str).map(str::to_string),
                    ))
                })
                .collect()
        })
        .unwrap_or_default()
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
pub(super) fn sha256_from_sri(integrity: &str) -> Option<String> {
    use base64::Engine as _;
    let encoded = integrity.trim().strip_prefix("sha256-")?;
    let raw = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .ok()?;
    (raw.len() == 32).then(|| hex::encode(raw))
}

fn parse_artifact(a: &Value) -> Option<Artifact> {
    let integrity = a
        .get("integrity")
        .and_then(Value::as_str)
        .and_then(sha256_from_sri);
    Some(Artifact {
        target: a.get("target").and_then(Value::as_str).map(str::to_string),
        url: a.get("url")?.as_str()?.to_string(),
        size: a.get("size").and_then(Value::as_u64),
        sha256: integrity.or_else(|| a.get("sha256").and_then(Value::as_str).map(str::to_string)),
    })
}

//! The wire shape a module publishes about itself.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// A module's reported version. Kept as a plain string for now; a real build
/// would parse and range-check it during dependency resolution.
pub type Version = String;

/// One thing a module contributes to the running server, as a (`kind`, `id`)
/// pair. `kind` is the interface ("download-client", "indexer-engine"); `id` is
/// the concrete implementation ("rqbit", "transmission", "builtin").
///
/// The host dispatches on these today through hand-written `match`es (e.g. the
/// `DownloadClientRegistry` in `kroma_torrent`). Recording them in the registry
/// makes the set introspectable now, and is the natural home for the dispatch
/// table itself later.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Capability {
    pub kind: String,
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fields: Vec<ConfigField>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flow: Option<String>,
}

impl Capability {
    pub fn new(kind: impl Into<String>, id: impl Into<String>) -> Self {
        Self { kind: kind.into(), id: id.into(), label: None, fields: Vec::new(), flow: None }
    }
}

/// One admin-configurable setting a module exposes. The admin console renders a
/// control per field; the value is interpreted by `kind`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigField {
    pub key: String,
    pub label: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub default: Option<String>,
    #[serde(default)]
    pub options: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,
    #[serde(default)]
    pub secret: bool,
    #[serde(default)]
    pub required: bool,
}

/// The frontend half of a module, when it ships a Module Federation remote. The
/// remote's entry URL is derived by the server (`/modules/<id>/remoteEntry.js`),
/// so this only names the exposed module the host `loadRemote`s. Absent for
/// backend-only modules and for compile-time-bundled frontends.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeRemote {
    pub module: String,
}

/// A dependency on another module: its `id` and an optional semver range the
/// depended module's version must satisfy (e.g. `^1.0`). In a manifest the whole
/// collection is written as a package.json-style `{ id: range }` map (see
/// [`dep_map`]); a single entry also deserializes leniently from a bare `"id"`
/// string, an `"id@range"` string, or an object `{ id, version }`, so older
/// array-form manifests keep working.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dependency {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

impl Dependency {
    pub fn new(id: impl Into<String>) -> Self {
        Self { id: id.into(), version: None }
    }
}

impl<'de> Deserialize<'de> for Dependency {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", untagged)]
        enum Repr {
            Str(String),
            Obj {
                id: String,
                #[serde(default)]
                version: Option<String>,
            },
        }
        Ok(match Repr::deserialize(deserializer)? {
            Repr::Str(s) => match s.split_once('@') {
                Some((id, range)) => Dependency { id: id.into(), version: normalize_range(range) },
                None => Dependency { id: s, version: None },
            },
            Repr::Obj { id, version } => {
                Dependency { id, version: version.as_deref().and_then(normalize_range) }
            }
        })
    }
}

// A blank or `"*"` range means "no constraint" (`None`); applied to every
// input form so they all collapse to the same in-memory shape.
fn normalize_range(range: &str) -> Option<String> {
    let trimmed = range.trim();
    (!trimmed.is_empty() && trimmed != "*").then(|| trimmed.to_string())
}

// (De)serialize a `dependencies` / `optionalDependencies` collection as a
// package.json-style map `{ "<id>": "<range>" }`, where a bare `"*"` (or empty)
// range means "any version".
mod dep_map {
    use std::fmt;

    use serde::de::{MapAccess, Visitor};
    use serde::ser::SerializeMap;
    use serde::{Deserializer, Serializer};

    use super::Dependency;

    pub fn serialize<S: Serializer>(deps: &[Dependency], serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(deps.len()))?;
        for dep in deps {
            map.serialize_entry(&dep.id, dep.version.as_deref().unwrap_or("*"))?;
        }
        map.end()
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Vec<Dependency>, D::Error> {
        struct DepsVisitor;

        impl<'de> Visitor<'de> for DepsVisitor {
            type Value = Vec<Dependency>;

            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("a { id: range } map")
            }

            // An explicit `null` (some manifest generators emit it for the empty
            // case) means "no dependencies", not a type error.
            fn visit_unit<E: serde::de::Error>(self) -> Result<Self::Value, E> {
                Ok(Vec::new())
            }

            // Package.json-style map: each key is a module id, each value a range.
            fn visit_map<M: MapAccess<'de>>(self, mut access: M) -> Result<Self::Value, M::Error> {
                let mut out = Vec::new();
                while let Some((id, range)) = access.next_entry::<String, String>()? {
                    out.push(Dependency { id, version: super::normalize_range(&range) });
                }
                Ok(out)
            }
        }

        deserializer.deserialize_any(DepsVisitor)
    }
}

/// A dependency on a CAPABILITY rather than a specific module: satisfied by any
/// module whose `provides` matches `kind` (and `id` when given).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityReq {
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
}

/// The module manifest contract this build speaks.
///
/// A `.kmod` built against a different one is REFUSED rather than read on a
/// best-effort basis, and the reason is that the shapes which changed between
/// versions parse as *absent*, never as errors: a v1 bundle still spelling its
/// dependencies `dependsOn` would install with an empty dependency set and fail
/// at runtime, somewhere else, with nothing pointing back here.
pub const MODULE_SCHEMA_VERSION: u32 = 2;

/// The public description of a module.
///
/// This is the serde shape served at `GET /api/modules` and mirrored by the
/// frontend registry, so it holds no runtime handles - only data. The `id` is
/// the join key across the backend crate and the `@kroma/module-<id>` frontend
/// package. Serialized camelCase so `dependencies` reaches the frontend (and a
/// wasm plugin's JSON) as `dependencies`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleManifest {
    /// Which manifest contract this module was built against. `0` when absent,
    /// which is every bundle predating the field and therefore every bundle
    /// this build refuses.
    #[serde(default)]
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub version: Version,
    #[serde(default)]
    pub description: String,
    /// What this module needs from its host, by engine name (`server`) and
    /// semver range. Named like npm's `engines` because it is that, and an
    /// object because a floor on one thing was never going to be all of it.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub engines: BTreeMap<String, String>,
    #[serde(default, with = "dep_map", skip_serializing_if = "Vec::is_empty")]
    pub dependencies: Vec<Dependency>,
    #[serde(default, with = "dep_map", skip_serializing_if = "Vec::is_empty")]
    pub optional_dependencies: Vec<Dependency>,
    #[serde(default)]
    pub requires: Vec<CapabilityReq>,
    #[serde(default)]
    pub provides: Vec<Capability>,
    /// The cross-module RPC contracts this module SERVES, by name
    /// (`"torznab"`, `"indexer-db"`). Distinct from [`Self::provides`], which
    /// describes user-configurable capabilities: this is machine wiring, and it
    /// is what lets a consumer reach a provider without naming its module id.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ports: Vec<String>,
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default)]
    pub config: Vec<ConfigField>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fe_remote: Option<FeRemote>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub library: bool,
}

impl ModuleManifest {
    /// Start a manifest with the required fields; chain the builder methods for
    /// the rest.
    pub fn new(id: impl Into<String>, name: impl Into<String>, version: impl Into<Version>) -> Self {
        Self {
            schema_version: MODULE_SCHEMA_VERSION,
            id: id.into(),
            name: name.into(),
            version: version.into(),
            description: String::new(),
            engines: BTreeMap::new(),
            dependencies: Vec::new(),
            optional_dependencies: Vec::new(),
            requires: Vec::new(),
            provides: Vec::new(),
            ports: Vec::new(),
            permissions: Vec::new(),
            config: Vec::new(),
            fe_remote: None,
            library: false,
        }
    }

    pub fn describe(mut self, description: impl Into<String>) -> Self {
        self.description = description.into();
        self
    }

    pub fn needs(mut self, module_id: impl Into<String>) -> Self {
        self.dependencies.push(Dependency::new(module_id));
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn depends_on_reads_the_package_json_style_map() {
        let m: ModuleManifest = serde_json::from_str(
            r#"{ "id": "a", "name": "A", "version": "1.0.0",
                 "dependencies": { "tv.kroma.torrents": "^0.1.0", "tv.kroma.lib": "*" } }"#,
        )
        .unwrap();
        assert_eq!(m.dependencies.len(), 2);
        assert_eq!(m.dependencies[0], Dependency { id: "tv.kroma.torrents".into(), version: Some("^0.1.0".into()) });
        // A "*" range normalizes to "no constraint".
        assert_eq!(m.dependencies[1], Dependency::new("tv.kroma.lib"));
    }

    #[test]
    fn the_pre_v2_array_form_is_refused_rather_than_read() {
        // Refused LOUDLY on purpose. Accepting it was the compatibility this
        // build dropped; reading it silently as empty would be worse than either.
        let err = serde_json::from_str::<ModuleManifest>(
            r#"{ "schemaVersion": 2, "id": "a", "name": "A", "version": "1.0.0",
                 "dependencies": ["bare", "with@^1.2"] }"#,
        )
        .unwrap_err()
        .to_string();
        assert!(err.contains("a { id: range } map"), "{err}");
    }

    #[test]
    fn serializes_as_a_map_and_omits_empty_collections() {
        let mut m = ModuleManifest::new("a", "A", "1.0.0");
        m.dependencies.push(Dependency { id: "lib".into(), version: Some("^1".into()) });
        m.dependencies.push(Dependency::new("plain"));
        let json = serde_json::to_value(&m).unwrap();
        assert_eq!(json["dependencies"]["lib"], "^1");
        // No declared range serializes back as the wildcard.
        assert_eq!(json["dependencies"]["plain"], "*");
        // Empty optionalDependencies is skipped entirely (not written as {} or []).
        assert!(json.get("optionalDependencies").is_none());

        // And the map round-trips back to the same in-memory shape.
        let back: ModuleManifest = serde_json::from_value(json).unwrap();
        assert_eq!(back.dependencies, m.dependencies);
    }

    #[test]
    fn depends_on_null_means_empty() {
        // Some generators emit `null` for the empty case; it must load as empty,
        // not error the whole manifest.
        let m: ModuleManifest = serde_json::from_str(
            r#"{ "id": "a", "name": "A", "version": "1.0.0", "dependencies": null }"#,
        )
        .unwrap();
        assert!(m.dependencies.is_empty());
    }

    #[test]
    fn a_depends_on_that_is_neither_a_map_nor_a_list_says_what_was_expected() {
        let err = serde_json::from_str::<ModuleManifest>(
            r#"{ "id": "a", "name": "A", "version": "1.0.0", "dependencies": 7 }"#,
        )
        .unwrap_err()
        .to_string();
        assert!(err.contains("a { id: range } map"), "{err}");
    }

    #[test]
    fn a_manifest_declares_which_contract_it_was_built_against() {
        let fresh = ModuleManifest::new("a", "A", "1.0.0");
        assert_eq!(fresh.schema_version, MODULE_SCHEMA_VERSION);
        assert_eq!(serde_json::to_value(&fresh).unwrap()["schemaVersion"], MODULE_SCHEMA_VERSION);

        // Absent reads as 0, which is every bundle predating the field - the
        // supervisor's install gate turns that into a refusal with a reason.
        let old: ModuleManifest =
            serde_json::from_str(r#"{ "id": "a", "name": "A", "version": "1.0.0" }"#).unwrap();
        assert_eq!(old.schema_version, 0);
    }

    #[test]
    fn describe_sets_the_description_the_admin_lists() {
        let m = ModuleManifest::new("a", "A", "1.0.0").describe("Grabs torrents");
        assert_eq!(m.description, "Grabs torrents");
        assert_eq!(serde_json::to_value(&m).unwrap()["description"], "Grabs torrents");
    }
}

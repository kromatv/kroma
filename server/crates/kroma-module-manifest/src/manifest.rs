//! The wire shape a module publishes about itself.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// A module's reported version, unparsed: ranges are checked against it by
/// [`crate::range_matches`], which treats anything unparseable as no constraint.
pub type Version = String;

/// A point this module DEFINES: somewhere other modules can plug in. `name` is
/// local, and the point's full name is `<this module's id>/<name>`, so ownership
/// is legible from the name alone and two authors cannot collide.
///
/// Any module may define one. That is the whole trick: the core resolves a point
/// by matching a string against the installed manifests, so a module defining a
/// point is not a special case of the core defining one.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PointDef {
    pub name: String,
    /// The major this module serves. A consumer declaring another major is not
    /// resolved to it. Within a major, evolution is additive only: the two ends
    /// were built at different times, so a new field must default.
    #[serde(default = "one")]
    pub version: u32,
    /// The methods a contributor is expected to answer, as
    /// `/_port/<point>/<method>`. Introspection today; what lets the Store warn
    /// about a consumer wanting a method the installed provider lacks.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub methods: Vec<String>,
}

fn one() -> u32 {
    1
}

impl PointDef {
    pub fn new(name: impl Into<String>) -> Self {
        Self { name: name.into(), version: 1, methods: Vec::new() }
    }
}

/// One thing a module contributes: it answers `point` (a full
/// `<definer>/<name>`), under `id` when several contributions to that point can
/// be live at once.
///
/// This is one declaration where there used to be three. `provides` described a
/// user-configurable capability for the admin picker, `ports` described the RPC
/// name resolution matched on, and they were the same fact written twice — an
/// engine advertised `download-client` under both. The UI metadata rides along
/// because the admin's add-form is data-driven off it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Contribution {
    pub point: String,
    /// The major this contribution was built against.
    #[serde(default = "one")]
    pub version: u32,
    /// The instance name, for a point several modules answer at once: a consumer
    /// picks a download client by it. Absent when the point takes one answer.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fields: Vec<ConfigField>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flow: Option<String>,
}

impl Contribution {
    pub fn new(point: impl Into<String>) -> Self {
        Self {
            point: point.into(),
            version: 1,
            id: None,
            label: None,
            fields: Vec::new(),
            flow: None,
        }
    }

    /// The same, under an instance name.
    pub fn instance(point: impl Into<String>, id: impl Into<String>) -> Self {
        Self { id: Some(id.into()), ..Self::new(point) }
    }

    /// The point's local name, i.e. without the defining module's id. What the
    /// wire path is built from.
    pub fn local(&self) -> &str {
        self.point.rsplit_once('/').map_or(self.point.as_str(), |(_, name)| name)
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

/// A point this module CALLS, rather than a dependency on a specific module:
/// satisfied by whichever module contributes `point` (under `id`, when given).
///
/// This is what makes a module's needs legible without naming a peer. A module id
/// in `dependencies` says "install that one"; this says "something has to answer
/// this", which is what a marketplace can resolve.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PointReq {
    pub point: String,
    /// The majors this module can speak, as a semver range over the point's
    /// version (`^1`). Absent takes any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// The module works without it, so an unmet optional need is not reported as
    /// leaving the module inert.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub optional: bool,
}

/// The module manifest contract this build speaks.
///
/// A `.kmod` built against a different one is REFUSED rather than read on a
/// best-effort basis, and the reason is that the shapes which changed between
/// versions parse as *absent*, never as errors: a v1 bundle still spelling its
/// dependencies `dependsOn` would install with an empty dependency set and fail
/// at runtime, somewhere else, with nothing pointing back here.
pub const MODULE_SCHEMA_VERSION: u32 = 2;

/// A module's declared storage, and the capability itself: a manifest with no
/// `storage` object gets no database at all, and the sidecar built for it does
/// not link SQLite.
///
/// Additive, so it cost no [`MODULE_SCHEMA_VERSION`] bump: a reader that
/// predates the field sees a module with no database, which is what such a
/// module had. What a module needs from its HOST is `engines`, and that is where
/// the floor for this one is declared.
///
/// Presence alone grants the module its own file
/// (`<data>/modules/<id>/module.sqlite`), which it owns outright. Reaching the
/// SHARED core database is separate and narrower: only what [`core`](Self::core)
/// lists, enforced per connection by SQLite's authorizer.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Storage {
    #[serde(default, skip_serializing_if = "CoreScope::is_empty")]
    pub core: CoreScope,
    /// Tables this module used to keep in the core database and now owns, moved
    /// into its own file the first time it starts under a host that understands
    /// this field. Table and rows travel together, and the core copy is dropped,
    /// so the move happens exactly once and never runs again.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub adopt: Vec<String>,
}

/// The slice of the CORE database a module may reach, as `"table"` (the whole
/// table) or `"table.column"` entries. Empty -- the default -- means none of it.
///
/// Two rules are not visible from the list itself, because they come from
/// SQLite rather than from us: a column named in a `WHERE` is reached as much as
/// one that is projected, and a foreign key drags its other table in (a write
/// into a child reads the parent, a cascading delete writes the child).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct CoreScope {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub read: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub write: Vec<String>,
}

impl CoreScope {
    pub fn is_empty(&self) -> bool {
        self.read.is_empty() && self.write.is_empty()
    }
}

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
    /// Points this module invents, for other modules to plug into.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub defines_points: Vec<PointDef>,
    /// Points this module answers, its own included.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub contributes: Vec<Contribution>,
    /// Points this module calls.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub consumes: Vec<PointReq>,
    #[serde(default)]
    pub config: Vec<ConfigField>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fe_remote: Option<FeRemote>,
    /// Absent for a module that touches no database, which is most of them.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub storage: Option<Storage>,
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
            defines_points: Vec::new(),
            contributes: Vec::new(),
            consumes: Vec::new(),
            config: Vec::new(),
            fe_remote: None,
            storage: None,
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
    fn storage_is_absent_unless_declared_and_round_trips_when_it_is() {
        let plain: ModuleManifest =
            serde_json::from_str(r#"{ "id": "a", "name": "A", "version": "1.0.0" }"#).unwrap();
        assert!(plain.storage.is_none(), "no storage object means no database");
        assert!(serde_json::to_value(&plain).unwrap().get("storage").is_none());

        // An empty object is NOT the same as an absent one: it is the module's
        // own file, with no reach into the core database.
        let private: ModuleManifest = serde_json::from_str(
            r#"{ "id": "a", "name": "A", "version": "1.0.0", "storage": {} }"#,
        )
        .unwrap();
        assert_eq!(private.storage, Some(Storage::default()));

        let scoped: ModuleManifest = serde_json::from_str(
            r#"{ "id": "a", "name": "A", "version": "1.0.0",
                 "storage": { "core": { "read": ["requests"], "write": ["wanted"] },
                              "adopt": ["indexers"] } }"#,
        )
        .unwrap();
        let storage = scoped.storage.as_ref().unwrap();
        assert_eq!(storage.core.read, ["requests"]);
        assert_eq!(storage.core.write, ["wanted"]);
        assert_eq!(storage.adopt, ["indexers"]);

        let back: ModuleManifest =
            serde_json::from_value(serde_json::to_value(&scoped).unwrap()).unwrap();
        assert_eq!(back.storage, scoped.storage);
    }

    #[test]
    fn depends_on_reads_the_package_json_style_map() {
        let m: ModuleManifest = serde_json::from_str(
            r#"{ "id": "a", "name": "A", "version": "1.0.0",
                 "dependencies": { "tv.kroma.torrents": "^0.1.0", "tv.kroma.lib": "*" } }"#,
        )
        .unwrap();
        assert_eq!(m.dependencies.len(), 2);
        assert_eq!(m.dependencies[0], Dependency { id: "tv.kroma.torrents".into(), version: Some("^0.1.0".into()) });
        assert_eq!(m.dependencies[1], Dependency::new("tv.kroma.lib"));
    }

    #[test]
    fn the_pre_v2_array_form_is_refused_rather_than_read() {
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
        assert_eq!(json["dependencies"]["plain"], "*");
        assert!(json.get("optionalDependencies").is_none());

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

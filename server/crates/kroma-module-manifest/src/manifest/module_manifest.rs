use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::{
    dep_map, ComponentNeeds, ConfigField, Contribution, Dependency, FeRemote, Helper, PointDef,
    PointReq, SettingsScope, Storage, Version, MODULE_SCHEMA_VERSION,
};

/// The public description of a module.
///
/// This is the serde shape served at `GET /api/modules` and mirrored by the
/// frontend registry, so it holds no runtime handles - only data. The `id` is
/// the join key across the backend crate and the `@kromatv/module-<id>` frontend
/// package. Serialized camelCase so `dependencies` reaches the frontend (and a
/// wasm plugin's JSON) as `dependencies`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleManifest {
    /// Upstream programs the host fetches and starts for this module, by the name
    /// `permissions.run` declares them under.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub helpers: BTreeMap<String, Helper>,
    /// What this module needs from the host to run as a component.
    #[serde(default)]
    pub component: ComponentNeeds,
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
    /// semver range.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub engines: BTreeMap<String, String>,
    #[serde(default, with = "dep_map", skip_serializing_if = "Vec::is_empty")]
    pub dependencies: Vec<Dependency>,
    #[serde(default, with = "dep_map", skip_serializing_if = "Vec::is_empty")]
    pub optional_dependencies: Vec<Dependency>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub defines_points: Vec<PointDef>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub contributes: Vec<Contribution>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub consumes: Vec<PointReq>,
    #[serde(default)]
    pub config: Vec<ConfigField>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fe_remote: Option<FeRemote>,
    /// Absent for a module that touches no database, which is most of them.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub storage: Option<Storage>,
    /// Absent for a module that declares no setting, which reaches none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub settings: Option<SettingsScope>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub library: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub permissions: Option<crate::Permissions>,
    /// Directories under the data directory that hold this module's own state.
    /// The server opens them only to a module the official registry shipped.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub data_dirs: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub notifications: Vec<kroma_module_wire::NotificationType>,
    /// One sentence, in English, that says what this module does for a
    /// household. The guided setup offers the module by it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tagline: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub translations: crate::Translations,
}

impl ModuleManifest {
    /// Start a manifest with the required fields; chain the builder methods for
    /// the rest.
    pub fn new(
        id: impl Into<String>,
        name: impl Into<String>,
        version: impl Into<Version>,
    ) -> Self {
        Self {
            schema_version: MODULE_SCHEMA_VERSION,
            id: id.into(),
            name: name.into(),
            version: version.into(),
            ..Self::default()
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

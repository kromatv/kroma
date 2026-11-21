//! Registry catalog: read an RFC 110 registry into one module list, pick each
//! module's component artifact, enrich with installed/update state.
//!
//! One shape, not three. A registry URL is either the `registry.json` descriptor
//! (followed to the `index.json` beside it) or that index directly. The older
//! `{ "modules": [...] }` catalogs are not read: their fields moved, and the
//! moved ones parse as ABSENT rather than as errors, so accepting them would
//! offer modules with their dependencies and checksums quietly missing.

use kroma_module_host::HostCtx;
use kroma_module_manifest::{
    Declared, Helper, ModuleManifest, Permissions, Provides, SettingsScope, Storage,
};
use serde_json::{json, Value};

use super::refusal::Refusal;
use crate::state::SharedState;

mod forms;
mod parse;
mod row;
mod versions;
mod words;

pub use forms::Form;
pub use parse::{fetch, Listing};

const SERVER_VERSION: &str = crate::VERSION;

/// What this server offers a catalog row's `engines`: the version it reports
/// and the core schema it carries.
pub(super) fn this_server() -> Provides<'static> {
    Provides {
        server: SERVER_VERSION,
        core: crate::core_schema(),
    }
}

/// One downloadable `.kmod` build. `target = None` is a WebAssembly component or a
/// library module, the same on every platform; a `target` names a native build.
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
    /// One sentence that says what the module does for a household.
    pub tagline: Option<String>,
    /// The module's words in each other language it speaks, by language tag.
    pub translations: kroma_module_manifest::Translations,
    /// What the module needs from its host, by engine name and semver range.
    pub engines: std::collections::BTreeMap<String, String>,
    pub library: bool,
    pub icon: Option<String>,
    // `(module id, optional semver range)`.
    pub dependencies: Vec<(String, Option<String>)>,
    // Same shape; offered as an opt-in at install time, never auto-pulled.
    pub optional_dependencies: Vec<(String, Option<String>)>,
    // `(point, instance)` this module answers. The instance is absent for a
    // point that takes one answer.
    pub contributes: Vec<(String, Option<String>)>,
    pub forms: Vec<Form>,
    // `(kind, optional provider id)` capabilities it needs SOMEONE to provide;
    // the install planner suggests providers for the unsatisfied ones.
    pub consumes: Vec<(String, Option<String>)>,
    pub artifacts: Vec<Artifact>,
    pub declaration: Declaration,
    /// Whether the registry this row came from is the official one. Set when
    /// the fetched registries are merged, and recorded at install time so a
    /// module's provenance is a fact rather than something re-derived later
    /// from an artifact URL that names a release host, not a catalog.
    pub official: bool,
    /// Set when this server refuses the registry's newest version and this row
    /// is the newest older version it runs instead.
    pub newest: Option<Newest>,
}

/// The registry's newest version of a module, which this server refuses, kept
/// beside the older version offered in its place.
pub struct Newest {
    pub version: String,
    pub refusal: Refusal,
}

/// The `moduleRegistryUrl` setting, or the built-in default when unset/blank.
pub fn registry_url(state: &SharedState) -> String {
    let u = state.setting_str("moduleRegistryUrl", super::DEFAULT_REGISTRY);
    if u.trim().is_empty() {
        super::DEFAULT_REGISTRY.to_string()
    } else {
        u
    }
}

/// The one artifact this server takes: the build that names no target. A module
/// published only with targets is a native build, which no server runs any more.
pub fn pick_artifact(m: &CatalogModule) -> Option<&Artifact> {
    m.artifacts.iter().find(|a| a.target.is_none())
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

fn point_rows(points: &[(String, Option<String>)]) -> Vec<Value> {
    points
        .iter()
        .map(|(point, id)| json!({ "point": point, "id": id }))
        .collect()
}
pub fn compat_verdict(m: &CatalogModule) -> Result<(), Refusal> {
    // Refused at unpack anyway (see the supervisor's install gate); said here so
    // the Store never offers an install that cannot succeed.
    let speaks = u64::from(kroma_module_manifest::MODULE_SCHEMA_VERSION);
    if m.schema_version != speaks {
        return Err(Refusal::Schema {
            built: m.schema_version,
            speaks,
        });
    }
    kroma_module_manifest::engines_satisfied(
        &m.engines,
        m.declaration.storage.as_ref(),
        this_server(),
    )
    .map_err(Refusal::from)?;
    if pick_artifact(m).is_none() {
        return Err(Refusal::Native);
    }
    Ok(())
}

/// The `GET /api/admin/store/catalog` response, merged across every configured
/// registry. `registryUrl` and the top-level `error` describe the OFFICIAL
/// registry, which is the only one an older client knew about.
pub fn enriched(state: &SharedState, fetched: &[super::registries::Fetched]) -> Value {
    let manifests = kroma_module_kernel::manifests(state);
    let installed = |id: &str| manifests.iter().find(|m| m.id == id);
    let entries: Vec<Value> = fetched
        .iter()
        .flat_map(|f| f.modules.iter().map(move |m| (m, f.registry.name.as_str())))
        .map(|(m, source)| row::store_row(m, source, installed(&m.id)))
        .collect();
    let official = fetched.iter().find(|f| f.registry.official);
    json!({
        "schema": 2,
        "serverVersion": SERVER_VERSION,
        "registryUrl": official.map(|f| f.registry.url.as_str()).unwrap_or_default(),
        "error": official.and_then(|f| f.error.clone()),
        "registries": super::registries::status(fetched),
        "modules": entries,
        "setup": super::registries::setup_offer(fetched),
    })
}

// Bare catalog entry for the store tests; each test sets what it needs via
// struct update.
#[cfg(test)]
pub(super) fn test_module(id: &str, version: &str) -> CatalogModule {
    CatalogModule {
        official: false,
        schema_version: u64::from(kroma_module_manifest::MODULE_SCHEMA_VERSION),
        id: id.into(),
        name: id.into(),
        version: version.into(),
        description: String::new(),
        tagline: None,
        translations: kroma_module_manifest::Translations::new(),
        engines: std::collections::BTreeMap::new(),
        library: false,
        icon: None,
        dependencies: Vec::new(),
        optional_dependencies: Vec::new(),
        contributes: Vec::new(),
        forms: Vec::new(),
        consumes: Vec::new(),
        artifacts: Vec::new(),
        declaration: Declaration::default(),
        newest: None,
    }
}

/// What a version declares it may do and reach. Each part is `None` when the
/// registry does not say, or says something this server cannot read.
#[derive(Clone, Default)]
pub struct Declaration {
    pub permissions: Option<Permissions>,
    pub storage: Option<Storage>,
    pub settings: Option<SettingsScope>,
    pub helpers: Option<std::collections::BTreeMap<String, Helper>>,
}

impl Declaration {
    pub fn as_declared(&self) -> Declared<'_> {
        Declared {
            permissions: self.permissions.as_ref(),
            storage: self.storage.as_ref(),
            settings: self.settings.as_ref(),
            helpers: self.helpers.as_ref(),
        }
    }
}

/// What a row declares it may do and reach, under the keys every store response
/// that names a module carries, so a consent can show it before install.
pub fn declared_fields(m: &CatalogModule) -> [(String, Value); 4] {
    [
        ("permissions".into(), json!(m.declaration.permissions)),
        ("storage".into(), json!(m.declaration.storage)),
        ("settings".into(), json!(m.declaration.settings)),
        ("helpers".into(), json!(m.declaration.helpers)),
    ]
}

/// Whether taking this entry asks for more than `installed` was granted. What
/// the row does not say widens nothing.
pub fn widens_access(entry: &CatalogModule, installed: Option<&ModuleManifest>) -> bool {
    installed.is_some_and(|installed| entry.declaration.as_declared().widens(installed))
}

#[cfg(test)]
mod tests;

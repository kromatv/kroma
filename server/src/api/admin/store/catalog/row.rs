use kroma_module_manifest::ModuleManifest;
use serde_json::{json, Value};

use super::{
    compat_verdict, declared_fields, dep_map, pick_artifact, point_rows, widens_access,
    CatalogModule,
};
use crate::api::admin::store::refusal::Refusal;

/// One row of the store catalog: what the module says it is, what this server
/// makes of it, and what it declares it may do and reach.
pub(super) fn store_row(
    m: &CatalogModule,
    source: &str,
    installed: Option<&ModuleManifest>,
) -> Value {
    let mut row = described(m);
    if let Value::Object(fields) = &mut row {
        fields.extend(download(m));
        fields.extend(verdict(m, source, installed));
        fields.extend(declared_fields(m));
    }
    row
}

fn described(m: &CatalogModule) -> Value {
    json!({
        "schemaVersion": m.schema_version,
        "id": m.id,
        "name": m.name,
        "version": m.version,
        "description": m.description,
        "tagline": m.tagline,
        "translations": m.translations,
        "library": m.library,
        "icon": m.icon,
        "engines": m.engines,
        "dependencies": dep_map(&m.dependencies),
        "optionalDependencies": dep_map(&m.optional_dependencies),
        "contributes": point_rows(&m.contributes),
        "consumes": point_rows(&m.consumes),
    })
}

fn download(m: &CatalogModule) -> [(String, Value); 3] {
    let artifact = pick_artifact(m);
    let sha256 = artifact.and_then(|a| a.sha256.as_ref());
    [
        ("url".into(), json!(artifact.map(|a| &a.url))),
        ("size".into(), json!(artifact.and_then(|a| a.size))),
        ("sha256".into(), json!(sha256)),
    ]
}

fn verdict(
    m: &CatalogModule,
    source: &str,
    installed: Option<&ModuleManifest>,
) -> [(String, Value); 10] {
    let refusal = compat_verdict(m).err();
    let newer = installed.is_some_and(|i| kroma_module_manifest::is_newer(&m.version, &i.version));
    let reason = refusal.as_ref().map(Refusal::reason);
    [
        (
            "installedVersion".into(),
            json!(installed.map(|i| &i.version)),
        ),
        ("updateAvailable".into(), json!(newer && refusal.is_none())),
        ("updateBlocked".into(), json!(newer && refusal.is_some())),
        ("compatible".into(), json!(refusal.is_none())),
        ("reason".into(), json!(reason)),
        ("source".into(), json!(source)),
        (
            "widensPermissions".into(),
            json!(widens_access(m, installed)),
        ),
        ("official".into(), json!(m.official)),
        ("newest".into(), newest(m)),
        ("refusal".into(), json!(refusal)),
    ]
}

fn newest(m: &CatalogModule) -> Value {
    json!(m.newest.as_ref().map(|n| json!({
        "version": n.version,
        "refusal": n.refusal,
        "reason": n.refusal.reason(),
    })))
}

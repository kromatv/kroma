use super::DeclaredPurposes;
use kroma_module_manifest::ModuleManifest;

fn declaring(permissions: serde_json::Value) -> DeclaredPurposes {
    let manifest: ModuleManifest = serde_json::from_value(serde_json::json!({
        "id": "tv.kroma.fixture",
        "name": "Fixture",
        "version": "0.1.0",
        "permissions": permissions,
    }))
    .expect("a valid manifest");
    DeclaredPurposes::of(&manifest)
}

fn tmdb_only() -> DeclaredPurposes {
    declaring(serde_json::json!({
        "net": { "connect": [{ "purpose": "metadata", "to": ["api.themoviedb.org"], "ports": [443] }] }
    }))
}

#[test]
fn a_purpose_the_manifest_declares_passes() {
    assert_eq!(tmdb_only().check("metadata"), Ok(()));
}

#[test]
fn a_dotted_child_of_the_declared_purpose_passes() {
    assert_eq!(tmdb_only().check("metadata.discover"), Ok(()));
}

#[test]
fn a_purpose_the_declaration_does_not_cover_is_refused_by_name() {
    let refusal = tmdb_only().check("metadatax").unwrap_err();

    assert!(refusal.contains("tv.kroma.fixture"), "{refusal}");
    assert!(refusal.contains("`metadatax`"), "{refusal}");
}

#[test]
fn a_module_that_declares_no_permissions_declares_no_purpose() {
    let manifest: ModuleManifest = serde_json::from_value(serde_json::json!({
        "id": "tv.kroma.fixture",
        "name": "Fixture",
        "version": "0.1.0",
    }))
    .expect("a valid manifest");

    assert!(DeclaredPurposes::of(&manifest).check("metadata").is_err());
}

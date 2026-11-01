use std::path::{Path, PathBuf};

use kroma_module_manifest::ModuleManifest;

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .expect("kroma-module-manifest sits three levels below the repository root")
        .to_path_buf()
}

fn first_party() -> Vec<(String, ModuleManifest)> {
    let modules = repo_root().join("modules");
    let mut found: Vec<(String, ModuleManifest)> = std::fs::read_dir(&modules)
        .expect("read modules/")
        .filter_map(Result::ok)
        .map(|entry| entry.path().join("module.json"))
        .filter(|path| path.is_file())
        .map(|path| {
            let text = std::fs::read_to_string(&path).expect("read a module.json");
            let manifest: ModuleManifest = serde_json::from_str(&text)
                .unwrap_or_else(|error| panic!("{}: {error}", path.display()));
            (manifest.id.clone(), manifest)
        })
        .collect();
    found.sort_by(|a, b| a.0.cmp(&b.0));
    found
}

#[test]
fn every_first_party_module_declares_permissions_the_server_accepts() {
    let modules = first_party();

    let undeclared: Vec<&str> = modules
        .iter()
        .filter(|(_, manifest)| manifest.permissions.is_none())
        .map(|(id, _)| id.as_str())
        .collect();
    let refused: Vec<String> = modules
        .iter()
        .filter_map(|(id, manifest)| {
            let problem = manifest.permissions.as_ref()?.problem()?;
            Some(format!("{id}: {problem}"))
        })
        .collect();
    assert!(
        undeclared.is_empty(),
        "no permissions block: {undeclared:?}"
    );
    assert!(refused.is_empty(), "{refused:#?}");
}

#[test]
fn the_scan_reads_the_first_party_modules() {
    let ids: Vec<String> = first_party().into_iter().map(|(id, _)| id).collect();

    assert!(ids.iter().any(|id| id == "tv.kroma.torrents"), "{ids:?}");
    assert!(ids.iter().any(|id| id == "tv.kroma.scene"), "{ids:?}");
}

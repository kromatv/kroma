use std::collections::BTreeMap;

use kroma_module_manifest::{CoreSchema, TableVersions};

mod install_support;

use install_support::{current, supervisor_on_core, tar_with_manifest, temp_modules_dir, uploaded};

const ID: &str = "com.example.ledger";

fn core_at(version: u32) -> CoreSchema {
    let downloads = TableVersions {
        changed: version,
        broke: 1,
        dropped: false,
    };
    CoreSchema {
        version,
        tables: BTreeMap::from([("downloads".to_string(), downloads)]),
    }
}

fn reading_downloads_as(core: u32) -> Vec<u8> {
    tar_with_manifest(&current(&format!(
        r#""id": "{ID}", "name": "Ledger", "version": "1.0.0", "library": true,
             "engines": {{ "server": ">=0.1.0", "core": "{core}" }},
             "storage": {{ "core": {{ "read": ["downloads"] }} }}"#
    )))
}

#[test]
fn install_refuses_a_module_that_needs_a_newer_core_schema() {
    let scratch = temp_modules_dir("core-newer");
    let sup = supervisor_on_core(scratch.path(), core_at(18));

    let err = sup
        .install(&reading_downloads_as(19), None, uploaded())
        .unwrap_err();

    assert_eq!(
        err.to_string(),
        format!("'{ID}' requires core schema 19 (this server's is 18)")
    );
    assert!(sup.installed_ids().is_empty());
}

#[test]
fn install_takes_a_module_this_core_schema_runs() {
    let scratch = temp_modules_dir("core-met");
    let sup = supervisor_on_core(scratch.path(), core_at(19));

    let installed = sup.install(&reading_downloads_as(19), None, uploaded());

    assert_eq!(installed.unwrap().id, ID);
}

#[test]
fn a_module_installed_on_a_newer_core_schema_does_not_start_on_an_older_one() {
    let scratch = temp_modules_dir("core-spawn");
    supervisor_on_core(scratch.path(), core_at(19))
        .install(&reading_downloads_as(19), None, uploaded())
        .unwrap();
    let older = supervisor_on_core(scratch.path(), core_at(18));

    let err = older.start_installed(ID).unwrap_err();

    assert_eq!(
        err.to_string(),
        format!("'{ID}' requires core schema 19 (this server's is 18)")
    );
}

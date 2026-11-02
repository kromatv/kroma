use std::sync::atomic::Ordering;

use super::super::test_support::{counted, serve, store_for, tarball, tmpdir, DEMO_YML};
use super::*;

#[test]
fn a_sync_the_vpn_must_carry_is_refused_while_the_vpn_is_down() {
    let archive = tarball(&[("Indexers-master/definitions/v9/demo.yml", DEMO_YML)]);
    let (source, served) = counted(200, archive);
    let dir = tmpdir("vpn-down");
    let store = DefinitionStore {
        dir: dir.path().to_path_buf(),
        source,
        route: Err("no VPN is running".into()),
    };

    let err = store.sync().unwrap_err().to_string();

    assert!(err.contains("no VPN is running"), "{err}");
    assert_eq!(served.load(Ordering::SeqCst), 0);
}

#[test]
fn version_dir_picks_highest() {
    let tmp = kroma_module_sdk::testing::temp_dir("defs-test");
    let defs = tmp.path().join("definitions");
    for v in ["v1", "v9", "v11", "v10", "notaversion"] {
        std::fs::create_dir_all(defs.join(v)).unwrap();
    }
    assert_eq!(pick_version_dir(&defs).as_deref(), Some("v11"));
}

#[test]
fn find_definitions_root_prefers_nested_then_falls_back() {
    let nested = tmpdir("root-nested");
    let want = nested.path().join("Indexers-master").join("definitions");
    std::fs::create_dir_all(&want).unwrap();
    assert_eq!(
        find_definitions_root(nested.path()).as_deref(),
        Some(want.as_path())
    );

    let direct = tmpdir("root-direct");
    let want = direct.path().join("definitions");
    std::fs::create_dir_all(&want).unwrap();
    assert_eq!(
        find_definitions_root(direct.path()).as_deref(),
        Some(want.as_path())
    );

    let empty = tmpdir("root-none");
    assert!(find_definitions_root(empty.path()).is_none());
}

#[test]
fn version_dir_none_when_no_versioned_subdir() {
    let dir = tmpdir("ver-none");
    std::fs::create_dir_all(dir.path().join("stable")).unwrap();
    std::fs::create_dir_all(dir.path().join("vX")).unwrap();
    assert!(pick_version_dir(dir.path()).is_none());
}

#[test]
fn a_new_schema_folder_holding_almost_nothing_does_not_replace_the_full_one() {
    let bytes = tarball(&[
        ("Indexers-master/definitions/v11/demo.yml", DEMO_YML),
        ("Indexers-master/definitions/v11/other.yml", DEMO_YML),
        ("Indexers-master/definitions/v12/lonely.yml", DEMO_YML),
    ]);
    let store = store_for(serve(200, bytes));

    let report = store.sync().unwrap();

    assert_eq!(report.version, "v11");
    assert_eq!(report.count, 2);
}

#[test]
fn a_sync_extracts_the_highest_schema_version_and_nothing_else() {
    let bytes = tarball(&[
        ("Indexers-master/definitions/v1/ancient.yml", DEMO_YML),
        ("Indexers-master/definitions/v9/demo.yml", DEMO_YML),
        ("Indexers-master/definitions/v11/demo.yml", DEMO_YML),
        ("Indexers-master/definitions/v11/other.yaml", DEMO_YML),
        (
            "Indexers-master/definitions/v11/README.md",
            "not a definition",
        ),
        ("Indexers-master/README.md", "ignored"),
    ]);
    let store = store_for(serve(200, bytes));
    assert!(
        !store.is_populated(),
        "nothing cached before the first sync"
    );

    let report = store.sync().unwrap();
    assert_eq!(report.version, "v11");
    assert_eq!(report.count, 2, "the .md is not a definition");
    assert!(store.is_populated());

    assert!(store.dir().join("demo.yml").is_file());
    assert!(store.dir().join("other.yaml").is_file());
    assert!(
        !store.dir().join(".sync-tmp").exists(),
        "the temp dir was left behind"
    );
    assert!(
        !store.dir().join("ancient.yml").exists(),
        "an older version leaked in"
    );
}

#[test]
fn a_sync_brings_every_definition_however_many_there_are() {
    let names: Vec<String> = (0..600)
        .map(|n| format!("Indexers-master/definitions/v11/t{n}.yml"))
        .collect();
    let layout: Vec<(&str, &str)> = names.iter().map(|name| (name.as_str(), DEMO_YML)).collect();
    let store = store_for(serve(200, tarball(&layout)));

    let report = store.sync().unwrap();

    let cached = std::fs::read_dir(store.dir())
        .unwrap()
        .filter(|entry| is_yml(entry.as_ref().unwrap()))
        .count();
    assert_eq!(report.count, 600);
    assert_eq!(cached, 600);
}

#[test]
fn a_synced_definition_can_be_listed_and_loaded() {
    let bytes = tarball(&[("Indexers-master/definitions/v9/demo.yml", DEMO_YML)]);
    let store = store_for(serve(200, bytes));
    store.sync().unwrap();

    let listed = store.list().unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].name, "Demo Tracker");
    assert_eq!(listed[0].kind, "public");
    assert_eq!(listed[0].links, ["https://demo.example/"]);
    assert_eq!(listed[0].id, "demo");

    let parsed = store.load("demo").unwrap();
    assert_eq!(parsed.name, "Demo Tracker");
}

#[test]
fn a_definition_whose_filename_differs_from_its_internal_id_is_keyed_by_the_file() {
    let bytes = tarball(&[("Indexers-master/definitions/v9/demo-api.yml", DEMO_YML)]);
    let store = store_for(serve(200, bytes));
    store.sync().unwrap();

    let listed = store.list().unwrap();
    assert_eq!(listed[0].id, "demo-api", "the internal id was 'demo'");
    assert!(store.load("demo-api").is_ok());
    assert!(
        store.load("demo").is_err(),
        "the internal id must not resolve"
    );
}

#[test]
fn an_archive_that_already_is_the_definitions_directory_still_works() {
    let bytes = tarball(&[("definitions/v9/demo.yml", DEMO_YML)]);
    let store = store_for(serve(200, bytes));
    assert_eq!(store.sync().unwrap().count, 1);
}

#[test]
fn a_sync_replaces_what_was_cached_before() {
    let first = tarball(&[("Indexers-master/definitions/v9/demo.yml", DEMO_YML)]);
    let store = store_for(serve(200, first));
    store.sync().unwrap();
    let before = std::fs::read_to_string(store.dir().join("demo.yml")).unwrap();

    let updated = DEMO_YML.replace("Demo Tracker", "Demo Tracker (renamed)");
    let second = tarball(&[("Indexers-master/definitions/v9/demo.yml", &updated)]);
    let store = DefinitionStore {
        dir: store.dir().to_path_buf(),
        source: serve(200, second),
        route: Ok(None),
    };
    store.sync().unwrap();

    let after = std::fs::read_to_string(store.dir().join("demo.yml")).unwrap();
    assert_ne!(before, after);
    assert_eq!(store.list().unwrap()[0].name, "Demo Tracker (renamed)");
}

#[test]
fn every_way_a_sync_can_fail_says_which_one_it_was() {
    let unreachable = store_for("http://127.0.0.1:1/nope.tar.gz".into());
    assert!(unreachable.sync().is_err(), "an unreachable source");

    let missing = store_for(serve(404, b"not found".to_vec()));
    assert!(missing.sync().is_err(), "a 404 from the source");

    let not_an_archive = store_for(serve(200, b"this is not a gzip stream".to_vec()));
    let err = not_an_archive.sync().unwrap_err().to_string();
    assert!(err.contains("tar failed"), "{err}");

    let wrong_shape = store_for(serve(200, tarball(&[("Indexers-master/README.md", "x")])));
    let err = wrong_shape.sync().unwrap_err().to_string();
    assert!(err.contains("no definitions/"), "{err}");

    let no_versions = store_for(serve(
        200,
        tarball(&[("Indexers-master/definitions/readme.txt", "x")]),
    ));
    let err = no_versions.sync().unwrap_err().to_string();
    assert!(err.contains("no version directory"), "{err}");

    let empty_version = store_for(serve(
        200,
        tarball(&[("Indexers-master/definitions/v9/notes.txt", "x")]),
    ));
    let err = empty_version.sync().unwrap_err().to_string();
    assert!(err.contains("no definitions"), "{err}");
}

use super::test_support::{scratch, store_for, tmpdir, valid_definition, DEMO_YML};
use super::*;

#[test]
fn a_store_that_has_never_synced_is_empty_rather_than_broken() {
    let dir = kroma_module_sdk::testing::temp_dir("defs-empty");
    let store = DefinitionStore::new(dir.path());
    assert!(!store.is_populated());
    assert!(store
        .list()
        .expect("listing a store that never synced")
        .is_empty());
}

#[test]
fn meta_parses_minimal_yaml() {
    let yaml = br#"
id: example
name: Example Tracker
type: public
description: "A test"
links:
  - https://example.org/
"#;
    let meta: DefinitionMeta = serde_yaml::from_slice(yaml).unwrap();
    assert_eq!(meta.id, "example");
    assert_eq!(meta.kind, "public");
    assert_eq!(meta.links, vec!["https://example.org/"]);
}

#[test]
fn dir_is_under_the_data_dir() {
    let data = tmpdir("dir");
    let store = DefinitionStore::new(data.path());
    assert_eq!(store.dir(), data.path().join("indexer-defs"));
}

#[test]
fn is_populated_reflects_presence_of_yaml_files() {
    let data = tmpdir("pop");
    let store = DefinitionStore::new(data.path());
    assert!(!store.is_populated());

    std::fs::create_dir_all(store.dir()).unwrap();
    assert!(!store.is_populated());
    std::fs::write(store.dir().join("readme.txt"), b"hi").unwrap();
    assert!(!store.is_populated());
    std::fs::write(store.dir().join("t.yml"), b"name: T").unwrap();
    assert!(store.is_populated());
}

#[test]
fn list_returns_empty_when_unsynced() {
    let data = tmpdir("unsynced");
    let store = DefinitionStore::new(data.path());
    assert!(store.list().unwrap().is_empty());
}

#[test]
fn list_sorts_by_name_keys_on_stem_and_skips_non_yaml() {
    let data = tmpdir("list");
    let store = DefinitionStore::new(data.path());
    std::fs::create_dir_all(store.dir()).unwrap();
    std::fs::write(store.dir().join("zebra.yml"), b"id: zebra\nname: Zebra").unwrap();
    std::fs::write(store.dir().join("apple.yml"), b"id: apple\nname: apple").unwrap();
    std::fs::write(
        store.dir().join("darkpeers-api.yml"),
        b"id: darkpeers\nname: Dark",
    )
    .unwrap();
    std::fs::write(store.dir().join("notes.txt"), b"skip me").unwrap();

    let metas = store.list().unwrap();
    assert_eq!(metas.len(), 3);
    assert_eq!(metas[0].name, "apple");
    assert_eq!(metas[1].name, "Dark");
    assert_eq!(metas[2].name, "Zebra");
    assert_eq!(metas[1].id, "darkpeers-api");
}

#[test]
fn load_parses_a_cached_definition() {
    let data = tmpdir("load");
    let store = DefinitionStore::new(data.path());
    std::fs::create_dir_all(store.dir()).unwrap();
    std::fs::write(
        store.dir().join("mytracker.yml"),
        valid_definition("t").as_bytes(),
    )
    .unwrap();

    let def = store.load("mytracker").expect("loads and parses");
    assert_eq!(def.id, "t");
    assert_eq!(def.name, "My Tracker");
}

#[test]
fn yaml_extension_is_recognized_like_yml() {
    let data = tmpdir("yaml-ext");
    let store = DefinitionStore::new(data.path());
    std::fs::create_dir_all(store.dir()).unwrap();
    std::fs::write(
        store.dir().join("tracker.yaml"),
        valid_definition("t").as_bytes(),
    )
    .unwrap();
    assert!(store.is_populated());
    let metas = store.list().unwrap();
    assert_eq!(metas.len(), 1);
    assert_eq!(metas[0].id, "tracker");
}

#[test]
fn listing_a_cache_that_was_never_synced_is_empty_not_an_error() {
    let empty = scratch("empty");
    let store = DefinitionStore {
        dir: empty.path().join("never-created"),
        source: String::new(),
        route: Ok(None),
    };
    assert!(store.list().unwrap().is_empty());
    assert!(!store.is_populated());
}

#[test]
fn a_definition_file_that_does_not_parse_is_skipped_rather_than_fatal() {
    let store = store_for(String::new());
    std::fs::create_dir_all(store.dir()).unwrap();
    std::fs::write(store.dir().join("good.yml"), DEMO_YML).unwrap();
    std::fs::write(store.dir().join("broken.yml"), "\t- : :\n").unwrap();
    std::fs::write(store.dir().join("notes.txt"), "ignored").unwrap();

    let listed = store.list().unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, "good");
}

#[test]
fn an_id_that_escapes_the_cache_directory_is_refused() {
    let store = store_for(String::new());
    std::fs::create_dir_all(store.dir()).unwrap();
    let outside = store.dir().parent().unwrap().join("secret.yml");
    std::fs::write(&outside, DEMO_YML).unwrap();

    let err = store.load("../secret").unwrap_err().to_string();

    assert!(err.contains("not a definition id"), "{err}");
    assert!(store.load("..%2Fsecret").is_err());
    assert!(store.load("sub/secret").is_err());
    assert!(store.load("").is_err());
}

#[test]
fn a_yml_entry_that_cannot_be_read_is_skipped_rather_than_fatal() {
    let store = store_for(String::new());
    std::fs::create_dir_all(store.dir().join("interrupted.yml")).unwrap();
    std::fs::write(store.dir().join("good.yml"), DEMO_YML).unwrap();

    let listed = store.list().unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, "good");
}

#[test]
fn a_store_that_never_synced_has_no_record() {
    let data = tmpdir("no-record");
    let store = DefinitionStore::new(data.path());

    assert_eq!(store.record(), SyncRecord::default());
}

#[test]
fn an_empty_catalog_wants_a_sync_at_most_once_a_minute() {
    let data = tmpdir("wants");
    let store = DefinitionStore::new(data.path());
    std::fs::create_dir_all(store.dir()).unwrap();
    store.write_record(&SyncRecord {
        attempted_at_ms: Some(1_000),
        ..SyncRecord::default()
    });

    assert!(!store.wants_first_sync(1_000 + 59_999));
    assert!(store.wants_first_sync(1_000 + 60_000));
    assert!(DefinitionStore::new(tmpdir("never").path()).wants_first_sync(0));
}

#[test]
fn a_populated_catalog_never_wants_a_first_sync() {
    let data = tmpdir("populated");
    let store = DefinitionStore::new(data.path());
    std::fs::create_dir_all(store.dir()).unwrap();
    std::fs::write(store.dir().join("demo.yml"), DEMO_YML).unwrap();

    assert!(!store.wants_first_sync(i64::MAX));
}

#[test]
fn meta_carries_the_definition_language() {
    let yaml = b"id: example\nname: Example\nlanguage: fr-FR\n";

    let meta: DefinitionMeta = serde_yaml::from_slice(yaml).unwrap();

    assert_eq!(meta.language, "fr-FR");
}

#[test]
fn a_record_that_cannot_be_written_is_dropped_rather_than_failing() {
    let data = tmpdir("no-dir");
    let store = DefinitionStore::new(data.path());

    store.write_record(&SyncRecord {
        attempted_at_ms: Some(1),
        ..SyncRecord::default()
    });

    assert_eq!(store.record(), SyncRecord::default());
}

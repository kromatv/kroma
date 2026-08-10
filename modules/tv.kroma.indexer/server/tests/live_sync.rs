//! The one test here talks to the REAL upstream definition repository, so it is
//! `#[ignore]`d and no CI job runs it:
//!
//! ```sh
//! cargo test -p kroma-indexer --test live_sync -- --ignored --nocapture
//! ```
//!
//! It lives in its own file for that reason. A test nothing can run is a test
//! nothing can cover, and leaving it among the unit tests made `store.rs` look
//! partly uncovered when every line of it that CI can reach is exercised.
//!
//! What it is FOR: the definitions are somebody else's schema, and it drifts.
//! This is how a person finds out that upstream changed something before a user
//! does, which is why it prints its failures rather than only counting them.

use kroma_indexer::store::DefinitionStore;

#[test]
#[ignore]
fn real_sync_downloads_and_loads() {
    let dir = kroma_testing::temp_dir("defs-live");
    let store = DefinitionStore::new(dir.path());

    let report = store.sync().expect("sync");
    assert!(report.count > 100, "expected many definitions, got {}", report.count);

    let metas = store.list().unwrap();
    // A stray non-definition yaml or two is fine.
    assert!(metas.len() >= report.count - 5, "listed {} of {}", metas.len(), report.count);

    let tpb = metas.iter().find(|m| m.id == "thepiratebay").expect("thepiratebay present");
    let def = store.load(&tpb.id).expect("load+parse thepiratebay");
    assert_eq!(def.id, "thepiratebay");
    assert!(!def.search.fields.is_empty());

    // Printed, not just counted: a schema gap upstream is only actionable if you
    // can see WHICH definitions stopped parsing.
    let (mut ok, mut fail) = (0u32, 0u32);
    for m in &metas {
        match store.load(&m.id) {
            Ok(_) => ok += 1,
            Err(e) => {
                fail += 1;
                if fail <= 25 {
                    eprintln!("[parse-fail] {}: {e:#}", m.id);
                }
            }
        }
    }
    eprintln!("[schema-coverage] {ok} parsed OK, {fail} failed of {}", metas.len());
    assert!(ok * 100 / metas.len() as u32 >= 90, "only {ok}/{} parsed", metas.len());
}

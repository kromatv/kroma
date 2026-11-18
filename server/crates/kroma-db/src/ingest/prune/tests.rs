use super::*;
use crate::ingest::test_support::*;
use crate::{metadata_core, store_localized, sync_all};
use std::collections::HashMap;

fn two_libraries() -> crate::testing::TempPool {
    let p = pool();
    let items = vec![
        movie("m1", "Dune", "kept", vec![file("f1", "/a/m1.mkv", false)]),
        movie(
            "m2",
            "Arrival",
            "gone",
            vec![file("f2", "/b/m2.mkv", false)],
        ),
    ];
    sync_all(
        &p,
        &[lib("kept"), lib("gone")],
        &[],
        &items,
        &mtimes_of(&items, 100),
    )
    .unwrap();
    let arrival = meta(329865, "Arrival");
    store_localized(&p, metadata_core::ITEM, "m2", &arrival, &HashMap::new()).unwrap();
    p
}

#[test]
fn a_library_that_is_no_longer_configured_goes_with_its_titles_and_what_they_cached() {
    let p = two_libraries();

    let dropped = drop_unconfigured_libraries(&p, &["kept"]).unwrap();

    assert_eq!(dropped, 1);
    assert_eq!(crate::counts(&p).unwrap(), (1, 1, 0));
    assert!(crate::get_item(&p, "m1").unwrap().is_some());
    assert!(metadata_core::get_core(&p, metadata_core::ITEM, "m2")
        .unwrap()
        .is_none());
}

#[test]
fn libraries_that_are_all_configured_lose_nothing() {
    let p = two_libraries();

    let dropped = drop_unconfigured_libraries(&p, &["kept", "gone"]).unwrap();

    assert_eq!(dropped, 0);
    assert_eq!(crate::counts(&p).unwrap(), (2, 2, 0));
    assert!(metadata_core::get_core(&p, metadata_core::ITEM, "m2")
        .unwrap()
        .is_some());
}

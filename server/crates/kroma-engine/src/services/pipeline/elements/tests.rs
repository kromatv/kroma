use super::*;
use crate::test_support;

fn all_filter() -> Filter {
    Filter {
        status: "all".into(),
        kind: "all".into(),
        query: String::new(),
        page: 0,
        limit: 50,
    }
}

#[test]
fn list_groups_catalog_and_overlays_the_ledger() {
    let state = test_support::test_state();
    test_support::seed_movie(&state, "m1");
    test_support::seed_show_episode(&state, "sh1", "ep1");
    test_support::seed_task(
        &state,
        "metadata",
        "item",
        "m1",
        "failed",
        Some("meta boom"),
    );

    let page = list(&state, &all_filter()).unwrap();

    assert_eq!(page.total, 3);
    assert_eq!(page.counts.total, 3);
    assert_eq!(
        (page.counts.film, page.counts.series, page.counts.episode),
        (1, 1, 1)
    );
    assert_eq!(page.counts.failed, 1);
    assert_eq!(page.counts.pending, 2);
    assert_eq!((page.counts.ok, page.counts.running), (0, 0));

    let movie = page
        .elements
        .iter()
        .find(|e| e.id == "m1")
        .expect("movie row present");
    assert_eq!(movie.kind, "film");
    assert_eq!(movie.overall, "failed");
    let meta = movie
        .treatments
        .iter()
        .find(|t| t.key == "metadata")
        .unwrap();
    assert_eq!(meta.status, "failed");
    assert_eq!(meta.error.as_deref(), Some("meta boom"));

    let show = page
        .elements
        .iter()
        .find(|e| e.id == "sh1")
        .expect("show row present");
    assert_eq!(show.kind, "series");
    assert_eq!(show.ep_stats.as_ref().unwrap().episodes, 1);
}

#[test]
fn list_applies_kind_and_status_filters_with_full_catalog_counts() {
    let state = test_support::test_state();
    test_support::seed_movie(&state, "m1");
    test_support::seed_show_episode(&state, "sh1", "ep1");
    test_support::seed_task(&state, "metadata", "item", "m1", "failed", Some("x"));

    let failed = list(
        &state,
        &Filter {
            status: "failed".into(),
            kind: "all".into(),
            query: String::new(),
            page: 0,
            limit: 50,
        },
    )
    .unwrap();
    assert_eq!(failed.total, 1);
    assert_eq!(failed.elements.len(), 1);
    assert_eq!(failed.elements[0].id, "m1");
    assert_eq!(
        failed.counts.total, 3,
        "counts are over the full catalog, not the filtered page"
    );

    let films = list(
        &state,
        &Filter {
            status: "all".into(),
            kind: "film".into(),
            query: String::new(),
            page: 0,
            limit: 50,
        },
    )
    .unwrap();
    assert_eq!(films.total, 1);
    assert!(films.elements.iter().all(|e| e.kind == "film"));
}

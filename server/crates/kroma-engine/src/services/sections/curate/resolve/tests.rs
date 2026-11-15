use super::super::fixtures::entry;
use super::*;

#[test]
fn parse_and_resolve_matches_titles() {
    let reply = r#"Here:```json
    [{"title":{"fr":"Horreur","en":"Best Horror"},"reason":{"fr":"r","en":"scary"},
      "members":["The Shining","Hereditary","Made Up Film","The Mask","It","Alien"]}]```"#;
    let specs = parse_curate(reply).unwrap();
    assert_eq!(specs.len(), 1);
    assert_eq!(
        specs[0].title.get("en").map(String::as_str),
        Some("Best Horror")
    );
    let cat = vec![
        entry("a", "The Shining", 8.0, ""),
        entry("b", "Hereditary", 7.0, ""),
        entry("c", "The Mask", 6.0, ""),
        entry("d", "It", 7.0, ""),
        entry("e", "Alien", 8.0, ""),
    ];
    let (rows, dropped) = resolve_members(&specs, &cat);
    assert_eq!(dropped, 0);
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].key, "best-horror");
    assert_eq!(rows[0].item_ids.len(), 5); // "Made Up Film" dropped (not in catalog)
}

#[test]
fn collection_below_min_is_dropped() {
    let specs = parse_curate(r#"[{"title":{"en":"Tiny"},"members":["A","B"]}]"#).unwrap();
    let cat = vec![entry("a", "A", 1.0, ""), entry("b", "B", 1.0, "")];
    let (rows, dropped) = resolve_members(&specs, &cat);
    assert!(rows.is_empty());
    assert_eq!(dropped, 1);
}

#[test]
fn resolve_by_id_matches_catalog_ids() {
    // Tool-driven path: members are catalog ids; unknown ids are dropped.
    let specs = parse_curate(
        r#"[{"title":{"en":"Nolan","fr":"Nolan"},"members":["a","b","c","zzz","d","e"]}]"#,
    )
    .unwrap();
    let cat: Vec<CatalogEntry> = ["a", "b", "c", "d", "e"]
        .iter()
        .map(|id| entry(id, id, 5.0, ""))
        .collect();
    let (rows, dropped) = resolve_members_by_id(&specs, &cat);
    assert_eq!(dropped, 0);
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].item_ids, ["a", "b", "c", "d", "e"]); // "zzz" not in catalog
    assert_eq!(rows[0].key, "nolan");
}

#[test]
fn two_collections_that_slug_the_same_are_published_once() {
    let specs = parse_curate(
        r#"[{"title":{"en":"Slow Burn"},"members":["a","b","c","d","e"]},
            {"title":{"en":"slow  burn!"},"members":["a","b","c","d","e"]}]"#,
    )
    .unwrap();
    let cat: Vec<CatalogEntry> = ["a", "b", "c", "d", "e"]
        .iter()
        .map(|id| entry(id, id, 5.0, ""))
        .collect();

    let (rows, dropped) = resolve_members_by_id(&specs, &cat);
    assert_eq!(
        dropped, 0,
        "the duplicate resolved fine; it is the key that collides"
    );
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].key, "slow-burn");
}

#[test]
fn a_title_that_slugs_to_nothing_is_not_a_collection() {
    let specs = parse_curate(r#"[{"title":{"en":"!!! ???"},"members":["a","b","c","d","e"]}]"#)
        .unwrap();
    let cat: Vec<CatalogEntry> = ["a", "b", "c", "d", "e"]
        .iter()
        .map(|id| entry(id, id, 5.0, ""))
        .collect();

    assert!(resolve_members_by_id(&specs, &cat).0.is_empty());
}

#[test]
fn normalize_title_and_strip_year() {
    assert_eq!(normalize_title("Le Parrain (1972)"), "leparrain");
    assert_eq!(normalize_title("Le Parrain"), "leparrain");
    // Punctuation and separators are stripped; letters lowercased.
    assert_eq!(
        normalize_title("The Godfather: Part II"),
        "thegodfatherpartii"
    );
    // A bare-number title keeps its digits (only a parenthesized year is dropped).
    assert_eq!(normalize_title("1917"), "1917");
    assert_eq!(strip_year("Alien (1979)"), "Alien");
    assert_eq!(strip_year("Se7en"), "Se7en");
    // Non-4-digit parenthetical is not treated as a year.
    assert_eq!(strip_year("Movie (12)"), "Movie (12)");
}

#[test]
fn extract_json_array_handles_fences_and_missing() {
    assert_eq!(extract_json_array("noise [1,2] tail"), Some("[1,2]"));
    assert_eq!(extract_json_array("```json\n[{}]\n```"), Some("[{}]"));
    assert!(extract_json_array("no array here").is_none());
    assert!(extract_json_array("]before[").is_none()); // end <= start
}

#[test]
fn parse_curate_rejects_non_array() {
    assert!(parse_curate("just prose, no json").is_err());
}

#[test]
fn resolve_members_dedups_within_a_collection() {
    // Same id twice in members -> counted once.
    let specs = parse_curate(r#"[{"title":{"en":"Dup"},"members":["a","a","b","c","d","e"]}]"#)
        .unwrap();
    let cat: Vec<CatalogEntry> = ["a", "b", "c", "d", "e"]
        .iter()
        .map(|id| entry(id, id, 1.0, ""))
        .collect();
    let (rows, _) = resolve_members_by_id(&specs, &cat);
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].item_ids.len(), 5); // "a" deduped
}

#[test]
fn a_language_the_model_keyed_loosely_is_stored_under_the_locale_it_names() {
    let specs = parse_curate(
        r#"[{"title":{"EN":"Slow Burn","fr_FR":"Feu lent","xx":"?"},
             "reason":{"en-us":"patient","Fr":"patient"},
             "members":["a","b","c","d","e"]}]"#,
    )
    .unwrap();
    let cat: Vec<CatalogEntry> = ["a", "b", "c", "d", "e"]
        .iter()
        .map(|id| entry(id, id, 5.0, ""))
        .collect();

    let (rows, _) = resolve_members_by_id(&specs, &cat);

    let mut titled: Vec<&str> = rows[0].titles.keys().map(String::as_str).collect();
    let mut reasoned: Vec<&str> = rows[0].reasons.keys().map(String::as_str).collect();
    titled.sort_unstable();
    reasoned.sort_unstable();
    assert_eq!(titled, ["en", "fr"]);
    assert_eq!(reasoned, ["en", "fr"]);
    assert_eq!(rows[0].key, "slow-burn");
}

#[test]
fn a_collection_titled_in_no_language_the_server_keeps_is_not_published() {
    let specs =
        parse_curate(r#"[{"title":{"xx":"Nobody"},"members":["a","b","c","d","e"]}]"#).unwrap();
    let cat: Vec<CatalogEntry> = ["a", "b", "c", "d", "e"]
        .iter()
        .map(|id| entry(id, id, 5.0, ""))
        .collect();

    let (rows, _) = resolve_members_by_id(&specs, &cat);

    assert!(rows.is_empty());
}

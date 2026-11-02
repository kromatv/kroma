use super::*;

#[test]
fn a_purpose_covers_itself() {
    assert!(purpose_covers("metadata", "metadata"));
}

#[test]
fn a_purpose_covers_its_dotted_children() {
    assert!(purpose_covers("metadata", "metadata.discover"));
    assert!(purpose_covers("metadata", "metadata.discover.page"));
    assert!(purpose_covers("metadata.discover", "metadata.discover.page"));
}

#[test]
fn a_purpose_never_covers_a_sibling_that_starts_with_it() {
    assert!(!purpose_covers("metadata", "metadatax"));
    assert!(!purpose_covers("metadata", "metadata-extra"));
}

#[test]
fn a_child_never_covers_its_parent_or_a_sibling() {
    assert!(!purpose_covers("metadata.discover", "metadata"));
    assert!(!purpose_covers("metadata.discover", "metadata.search"));
}

#[test]
fn an_empty_name_covers_nothing_and_an_empty_purpose_is_covered_by_nothing() {
    assert!(!purpose_covers("", "metadata"));
    assert!(!purpose_covers("", ""));
    assert!(!purpose_covers("metadata", ""));
}

#[test]
fn an_exact_pattern_names_that_host_only() {
    assert!(host_matches("api.example.org", "api.example.org"));
    assert!(host_matches("api.example.org", "API.Example.org."));
    assert!(!host_matches("api.example.org", "cdn.api.example.org"));
    assert!(!host_matches("api.example.org", "example.org"));
}

#[test]
fn a_domain_pattern_names_the_domain_and_every_name_under_it() {
    let cases = [
        ("example.org", true),
        ("api.example.org", true),
        ("a.b.example.org", true),
        ("CDN.Example.Org.", true),
        ("badexample.org", false),
        ("example.org.evil.test", false),
        (".example.org", false),
        ("", false),
    ];

    for (host, expected) in cases {
        assert_eq!(host_matches("*.example.org", host), expected, "{host}");
    }
}

#[test]
fn an_empty_pattern_names_nothing() {
    assert!(!host_matches("", ""));
    assert!(!host_matches("*.", ""));
    assert!(!host_matches("*.", "example.org"));
}

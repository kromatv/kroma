//! Edition labels: which filename tokens name a cut of a title, and which
//! only name a quality tier.

// (needle, label) cut/edition labels first, then source/quality.
const EDITION_TABLE: &[(&str, &str)] = &[
    ("director's cut", "Director's Cut"),
    ("directors cut", "Director's Cut"),
    ("director.cut", "Director's Cut"),
    ("extended", "Extended"),
    ("uncut", "Uncut"),
    ("unrated", "Unrated"),
    ("theatrical", "Theatrical"),
    ("remastered", "Remastered"),
    ("imax", "IMAX"),
    ("remux", "Remux"),
    ("2160p", "4K"),
    ("4k", "4K"),
    ("uhd", "4K"),
    ("1080p", "1080p"),
    ("720p", "720p"),
    ("480p", "480p"),
];

/// The labels that name a distinct CUT of a title rather than a quality tier.
/// Two files sharing a cut are the same content: one can replace the other.
/// Two files differing in cut are different content and never replace one
/// another, however their quality compares.
pub const EDITION_CUTS: &[&str] = &[
    "Director's Cut",
    "Extended",
    "Uncut",
    "Unrated",
    "Theatrical",
    "Remastered",
    "IMAX",
];

/// The edition label a file name carries, e.g. `Extended` or `4K`.
pub fn detect_edition(file_name: &str) -> Option<String> {
    let lower = file_name.to_ascii_lowercase();
    EDITION_TABLE
        .iter()
        .find(|(needle, _)| lower.contains(needle))
        .map(|(_, label)| label.to_string())
}

/// The cut an edition names, or `None` when it only names a quality tier
/// (`4K`, `1080p`, `Remux`, ...) or nothing at all.
pub fn edition_cut(edition: Option<&str>) -> Option<&'static str> {
    let edition = edition?;
    EDITION_CUTS
        .iter()
        .copied()
        .find(|cut| cut.eq_ignore_ascii_case(edition))
}

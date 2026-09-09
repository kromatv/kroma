//! The edition level of the model: which filename tokens name a cut of a title,
//! which only name a quality tier, and the edition a media file therefore
//! belongs to.

use serde::{Deserialize, Serialize};

use crate::slug::slugify;

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

const UNNAMED_EDITION: &str = "default";

/// One named cut of a title: its own runtime, its own content. Two files of one
/// cut at different fidelities are two media files of THIS, never two editions
/// and never two titles. A title whose files name no cut has exactly one unnamed
/// edition, so the title to edition to media file nesting is total.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Edition {
    pub id: String,
    /// `None` is the unnamed edition a title with a single cut has.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(
        rename = "durationMs",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub duration_ms: Option<u64>,
}

/// The edition a file belongs to, derived from the cut its name carries. Stable
/// per (title, cut), so a theatrical 1080p and a theatrical 4K share it while an
/// extended cut of the same title does not. Scoped by the item id, because two
/// titles both having a theatrical cut are not the same edition.
pub fn edition_id(item_id: &str, edition: Option<&str>) -> String {
    match edition_cut(edition) {
        Some(cut) => format!("{item_id}:{}", slugify(cut)),
        None => format!("{item_id}:{UNNAMED_EDITION}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn two_fidelities_of_one_cut_land_in_one_edition_and_two_cuts_do_not() {
        let theatrical_hd = edition_id("m1", Some("Theatrical"));
        let theatrical_4k = edition_id("m1", Some("Theatrical"));
        let extended = edition_id("m1", Some("Extended"));

        assert_eq!(theatrical_hd, theatrical_4k);
        assert_ne!(theatrical_hd, extended);
    }

    #[test]
    fn a_tag_that_only_names_a_quality_tier_belongs_to_the_unnamed_edition() {
        let unnamed = edition_id("m1", None);

        assert_eq!(edition_id("m1", Some("4K")), unnamed);
        assert_eq!(edition_id("m1", Some("1080p")), unnamed);
        assert_eq!(edition_id("m1", Some("Remux")), unnamed);
        assert_eq!(unnamed, "m1:default");
    }

    #[test]
    fn the_same_cut_of_two_titles_is_two_editions() {
        assert_ne!(
            edition_id("m1", Some("Extended")),
            edition_id("m2", Some("Extended"))
        );
    }

    #[test]
    fn an_edition_travels_under_the_keys_a_client_reads() {
        let named = Edition {
            id: "m1:extended".into(),
            name: Some("Extended".into()),
            duration_ms: Some(9_000_000),
        };
        let unnamed = Edition {
            id: "m1:default".into(),
            name: None,
            duration_ms: None,
        };

        assert_eq!(
            serde_json::to_string(&named).unwrap(),
            r#"{"id":"m1:extended","name":"Extended","durationMs":9000000}"#
        );
        assert_eq!(
            serde_json::to_string(&unnamed).unwrap(),
            r#"{"id":"m1:default"}"#
        );
    }

    #[test]
    fn a_cut_with_punctuation_in_its_name_still_makes_one_id() {
        assert_eq!(
            edition_id("m1", Some("Director's Cut")),
            "m1:director-s-cut"
        );
    }
}

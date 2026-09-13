//! The release notes the binary was built with, and what each reader is shown.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use serde::Deserialize;

use crate::domain::{ReleaseNotes, ReleaseView};

mod parts {
    include!(concat!(env!("OUT_DIR"), "/release_parts.rs"));
}

const FALLBACK_LOCALE: &str = "en";

/// One release folder: its date, when it has one, and its notes per language.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Release {
    pub version: String,
    pub date: Option<String>,
    pub notes: BTreeMap<String, ReleaseNotes>,
}

#[derive(Deserialize)]
struct Meta {
    date: Option<String>,
}

/// Every folder under `releases/` at build time, parsed once.
pub fn embedded() -> &'static [Release] {
    static RELEASES: OnceLock<Vec<Release>> = OnceLock::new();
    RELEASES.get_or_init(|| assemble(parts::RELEASE_FILES))
}

/// Groups `(version, file name, contents)` triples into releases.
pub fn assemble(files: &[(&str, &str, &str)]) -> Vec<Release> {
    let mut by_version: BTreeMap<&str, Release> = BTreeMap::new();
    for &(version, name, text) in files {
        let release = by_version.entry(version).or_insert_with(|| Release {
            version: version.to_owned(),
            date: None,
            notes: BTreeMap::new(),
        });
        if name == "release.json" {
            release.date = serde_json::from_str::<Meta>(text).ok().and_then(|meta| meta.date);
        } else if let Some(locale) = name.strip_suffix(".md") {
            release.notes.insert(locale.to_owned(), ReleaseNotes::parse(text));
        }
    }
    by_version.into_values().collect()
}

/// The releases a server at `current` has reached, newest first, in `locale`
/// where the release ships it and in English otherwise. The action and owner
/// sections are the owner's, so they come back empty unless `owner`.
pub fn view(releases: &[Release], current: &str, locale: &str, owner: bool) -> Vec<ReleaseView> {
    let Some(ceiling) = version_key(current) else {
        return Vec::new();
    };
    let mut shown: Vec<(VersionKey, ReleaseView)> = releases
        .iter()
        .filter_map(|release| {
            let key = version_key(&release.version).filter(|key| *key <= ceiling)?;
            let mut notes = release
                .notes
                .get(locale)
                .or_else(|| release.notes.get(FALLBACK_LOCALE))
                .or_else(|| release.notes.values().next())?
                .clone();
            if !owner {
                notes.action.clear();
                notes.owner.clear();
            }
            let view = ReleaseView {
                version: release.version.clone(),
                date: release.date.clone(),
                notes,
            };
            Some((key, view))
        })
        .collect();
    shown.sort_by_key(|(key, _)| std::cmp::Reverse(*key));
    shown.into_iter().map(|(_, view)| view).collect()
}

/// The release a client opens on its own: the newest one with highlights that
/// is past `seen`. A reader who has never been shown one gets the newest.
pub fn unseen(shown: &[ReleaseView], seen: Option<&str>) -> Option<String> {
    let seen = seen.and_then(version_key);
    shown
        .iter()
        .filter(|release| !release.notes.highlights.is_empty())
        .find(|release| match (version_key(&release.version), seen) {
            (Some(key), Some(seen)) => key > seen,
            (Some(_), None) => true,
            (None, _) => false,
        })
        .map(|release| release.version.clone())
}

type VersionKey = (u64, u64, u64);

/// `MAJOR.MINOR.PATCH` as numbers, so `0.1.10` sorts after `0.1.9`. Anything
/// else, a pre-release suffix included, is not a release version.
pub fn version_key(raw: &str) -> Option<VersionKey> {
    let mut parts = raw.trim().split('.');
    let key = (
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
    );
    parts.next().is_none().then_some(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOTES_EN: &str = "
        ## Action required

        - Back up first.

        ## New

        ### Something new
        A paragraph.

        ## For the server owner

        - A server change.
    ";

    const NOTES_FR: &str = "
        ## Nouveautés

        ### Du nouveau
        Un paragraphe.
    ";

    fn catalog() -> Vec<Release> {
        assemble(&[
            ("0.1.9", "en.md", NOTES_EN),
            ("0.1.10", "en.md", NOTES_EN),
            ("0.1.10", "fr.md", NOTES_FR),
            ("0.1.10", "release.json", r#"{ "date": "2026-09-13" }"#),
            ("0.2.0", "en.md", NOTES_EN),
        ])
    }

    fn versions(shown: &[ReleaseView]) -> Vec<&str> {
        shown.iter().map(|release| release.version.as_str()).collect()
    }

    #[test]
    fn shows_only_the_releases_the_server_has_reached_newest_first() {
        let releases = catalog();

        let shown = view(&releases, "0.1.10", "en", true);

        assert_eq!(versions(&shown), vec!["0.1.10", "0.1.9"]);
    }

    #[test]
    fn reads_the_date_from_the_release_json_beside_the_notes() {
        let releases = catalog();

        let shown = view(&releases, "0.1.10", "en", true);

        assert_eq!(shown[0].date.as_deref(), Some("2026-09-13"));
        assert_eq!(shown[1].date, None);
    }

    #[test]
    fn falls_back_to_english_where_a_release_does_not_ship_the_reader_s_language() {
        let releases = catalog();

        let shown = view(&releases, "0.1.10", "fr", true);

        assert_eq!(shown[0].notes.highlights[0].title, "Du nouveau");
        assert_eq!(shown[1].notes.highlights[0].title, "Something new");
    }

    #[test]
    fn a_reader_who_is_not_the_owner_gets_neither_the_action_nor_the_owner_lines() {
        let releases = catalog();

        let shown = view(&releases, "0.1.10", "en", false);

        assert!(shown[1].notes.action.is_empty());
        assert!(shown[1].notes.owner.is_empty());
        assert_eq!(shown[1].notes.highlights.len(), 1);
    }

    #[test]
    fn opens_the_newest_release_past_the_one_the_reader_last_saw() {
        let shown = view(&catalog(), "0.1.10", "en", true);

        assert_eq!(unseen(&shown, Some("0.1.9")).as_deref(), Some("0.1.10"));
        assert_eq!(unseen(&shown, None).as_deref(), Some("0.1.10"));
        assert_eq!(unseen(&shown, Some("0.1.10")), None);
    }

    #[test]
    fn opens_nothing_for_a_release_without_highlights() {
        let releases = assemble(&[("0.1.10", "en.md", "## Fixed\n\n- A fix.")]);
        let shown = view(&releases, "0.1.10", "en", true);

        let opened = unseen(&shown, Some("0.1.9"));

        assert_eq!(opened, None);
    }

    #[test]
    fn orders_versions_by_number_and_refuses_anything_else() {
        assert!(version_key("0.1.10") > version_key("0.1.9"));
        assert_eq!(version_key("1.2.3"), Some((1, 2, 3)));
        assert_eq!(version_key("0.1.39-canary.4"), None);
        assert_eq!(version_key("0.1"), None);
        assert_eq!(version_key("0.1.2.3"), None);
    }
}

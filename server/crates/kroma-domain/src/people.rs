use std::cmp::Reverse;
use std::collections::{BTreeMap, BTreeSet};

use crate::slug::{slug_eq, slugify};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CreditedTitle {
    Movie(String),
    Show(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Credit {
    pub name: String,
    // None on every credit stored before the id was kept: those fold by name.
    pub tmdb_id: Option<u64>,
    pub title: CreditedTitle,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PersonMatch {
    pub name: String,
    pub tmdb_id: Option<u64>,
    pub movie_ids: Vec<String>,
    pub show_ids: Vec<String>,
    pub namesakes: Vec<String>,
}

/// Resolve `lookup`, a provider person id, a URL slug, or a display name in any
/// casing, against the credits a library holds. `None` when nothing is credited
/// under it.
///
/// An id answers exactly, whatever the credits spell the person: it is the only
/// thing that tells two people credited under one name apart. Credits stored
/// before the id was kept have none, so a lookup that matches no id falls back
/// to folding the name, and there several SPELLINGS can share one slug. The one
/// credited on more titles then wins, alphabetically first on a tie, and the
/// rest come back as `namesakes`.
pub fn resolve_person(
    credits: impl IntoIterator<Item = Credit>,
    lookup: &str,
) -> Option<PersonMatch> {
    let credits: Vec<Credit> = credits.into_iter().collect();
    lookup
        .parse::<u64>()
        .ok()
        .and_then(|id| by_provider_id(&credits, id))
        .or_else(|| by_folded_name(&credits, lookup))
}

fn by_provider_id(credits: &[Credit], id: u64) -> Option<PersonMatch> {
    let spellings = group_by_spelling(credits.iter().filter(|c| c.tmdb_id == Some(id)));
    let name = most_credited_then_alphabetical(&spellings)?.clone();
    let mut all = Titles::default();
    for titles in spellings.into_values() {
        all.absorb(titles);
    }
    Some(all.into_match(name, Some(id), Vec::new()))
}

fn by_folded_name(credits: &[Credit], lookup: &str) -> Option<PersonMatch> {
    let want = slugify(lookup);
    if want.is_empty() {
        return None;
    }
    let mut spellings = group_by_spelling(credits.iter().filter(|c| slug_eq(&c.name, &want)));
    let name = most_credited_then_alphabetical(&spellings)?.clone();
    let titles = spellings.remove(&name).unwrap_or_default();
    let id = titles.lone_id();
    Some(titles.into_match(name, id, spellings.into_keys().collect()))
}

fn group_by_spelling<'a>(credits: impl Iterator<Item = &'a Credit>) -> BTreeMap<String, Titles> {
    let mut spellings: BTreeMap<String, Titles> = BTreeMap::new();
    for credit in credits {
        spellings
            .entry(credit.name.clone())
            .or_default()
            .add(credit);
    }
    spellings
}

// A BTreeMap iterates in name order and `min_by_key` keeps the first of equal
// keys, which is together what makes the alphabetical tie-break deterministic.
fn most_credited_then_alphabetical(spellings: &BTreeMap<String, Titles>) -> Option<&String> {
    spellings
        .iter()
        .min_by_key(|(_, titles)| Reverse(titles.count()))
        .map(|(name, _)| name)
}

#[derive(Default)]
struct Titles {
    movies: BTreeSet<String>,
    shows: BTreeSet<String>,
    ids: BTreeSet<u64>,
}

impl Titles {
    fn add(&mut self, credit: &Credit) {
        match &credit.title {
            CreditedTitle::Movie(id) => self.movies.insert(id.clone()),
            CreditedTitle::Show(id) => self.shows.insert(id.clone()),
        };
        if let Some(id) = credit.tmdb_id {
            self.ids.insert(id);
        }
    }

    fn absorb(&mut self, other: Titles) {
        self.movies.extend(other.movies);
        self.shows.extend(other.shows);
        self.ids.extend(other.ids);
    }

    fn count(&self) -> usize {
        self.movies.len() + self.shows.len()
    }

    // Two ids under one spelling are two people the fold cannot separate, so the
    // answer carries neither.
    fn lone_id(&self) -> Option<u64> {
        match self.ids.len() {
            1 => self.ids.iter().next().copied(),
            _ => None,
        }
    }

    fn into_match(self, name: String, tmdb_id: Option<u64>, namesakes: Vec<String>) -> PersonMatch {
        PersonMatch {
            name,
            tmdb_id,
            movie_ids: self.movies.into_iter().collect(),
            show_ids: self.shows.into_iter().collect(),
            namesakes,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn movie(name: &str, id: &str) -> Credit {
        Credit {
            name: name.to_string(),
            tmdb_id: None,
            title: CreditedTitle::Movie(id.to_string()),
        }
    }

    fn show(name: &str, id: &str) -> Credit {
        Credit {
            name: name.to_string(),
            tmdb_id: None,
            title: CreditedTitle::Show(id.to_string()),
        }
    }

    fn credited(person: u64, credit: Credit) -> Credit {
        Credit {
            tmdb_id: Some(person),
            ..credit
        }
    }

    #[test]
    fn a_slug_resolves_to_the_spelling_the_library_holds() {
        let credits = vec![movie("Conan O'Brien", "m1"), show("Conan O'Brien", "s1")];

        let found = resolve_person(credits, "conan-o-brien").expect("a match");

        assert_eq!(found.name, "Conan O'Brien");
        assert_eq!(found.movie_ids, ["m1"]);
        assert_eq!(found.show_ids, ["s1"]);
        assert!(found.namesakes.is_empty());
    }

    #[test]
    fn a_display_name_resolves_however_it_is_cased_or_spaced() {
        let credits = vec![movie("Timothée Chalamet", "m1")];

        let found = resolve_person(credits.clone(), "  timothée   CHALAMET ");

        assert_eq!(found, resolve_person(credits, "Timothée Chalamet"));
        assert_eq!(found.expect("a match").movie_ids, ["m1"]);
    }

    #[test]
    fn a_title_crediting_someone_twice_counts_it_once() {
        let credits = vec![movie("Ben Stiller", "m1"), movie("Ben Stiller", "m1")];

        let found = resolve_person(credits, "ben-stiller").expect("a match");

        assert_eq!(found.movie_ids, ["m1"]);
    }

    #[test]
    fn the_better_credited_of_two_spellings_sharing_a_slug_wins_and_names_the_other() {
        let credits = vec![
            movie("Anne Marie", "m1"),
            movie("Anne-Marie", "m2"),
            show("Anne-Marie", "s1"),
        ];

        let found = resolve_person(credits, "anne-marie").expect("a match");

        assert_eq!(found.name, "Anne-Marie");
        assert_eq!(found.movie_ids, ["m2"]);
        assert_eq!(found.show_ids, ["s1"]);
        assert_eq!(found.namesakes, ["Anne Marie"]);
    }

    #[test]
    fn an_evenly_credited_slug_goes_to_the_alphabetically_first_spelling() {
        let credits = vec![movie("Zoe Bell", "m2"), movie("Zoé Bell", "m1")];

        let found = resolve_person(credits, "zoe-bell").expect("a match");

        assert_eq!(found.name, "Zoe Bell");
        assert_eq!(found.namesakes, ["Zoé Bell"]);
    }

    #[test]
    fn a_lookup_nothing_is_credited_under_resolves_to_nobody() {
        let credits = vec![movie("Emily Blunt", "m1")];

        assert_eq!(resolve_person(credits.clone(), "nobody"), None);
        assert_eq!(resolve_person(credits.clone(), "   "), None);
        assert_eq!(resolve_person(credits, "-"), None);
    }

    #[test]
    fn an_id_answers_with_every_title_however_the_credits_spell_the_person() {
        let credits = vec![
            credited(1234, movie("Zoë Kravitz", "m1")),
            credited(1234, show("Zoe Kravitz", "s1")),
            credited(9999, movie("Zoe Kravitz", "m2")),
        ];

        let found = resolve_person(credits, "1234").expect("a match");

        assert_eq!(found.tmdb_id, Some(1234));
        assert_eq!(found.movie_ids, ["m1"]);
        assert_eq!(found.show_ids, ["s1"]);
        assert!(found.namesakes.is_empty());
    }

    #[test]
    fn an_id_separates_two_people_credited_under_one_name() {
        let credits = vec![
            credited(1, movie("John Williams", "m1")),
            credited(2, movie("John Williams", "m2")),
        ];

        let one = resolve_person(credits.clone(), "1").expect("a match");
        let two = resolve_person(credits.clone(), "2").expect("a match");
        let folded = resolve_person(credits, "john-williams").expect("a match");

        assert_eq!(one.movie_ids, ["m1"]);
        assert_eq!(two.movie_ids, ["m2"]);
        assert_eq!(folded.movie_ids, ["m1", "m2"]);
        assert_eq!(folded.tmdb_id, None);
    }

    #[test]
    fn a_folded_name_still_reports_the_id_its_credits_agree_on() {
        let credits = vec![
            credited(1234, movie("Greta Gerwig", "m1")),
            movie("Greta Gerwig", "m2"),
        ];

        let found = resolve_person(credits, "greta-gerwig").expect("a match");

        assert_eq!(found.tmdb_id, Some(1234));
        assert_eq!(found.movie_ids, ["m1", "m2"]);
    }

    #[test]
    fn an_id_no_credit_carries_falls_back_to_folding_it_as_a_name() {
        let credits = vec![credited(1234, movie("Greta Gerwig", "m1"))];

        assert_eq!(resolve_person(credits, "9999"), None);
    }
}

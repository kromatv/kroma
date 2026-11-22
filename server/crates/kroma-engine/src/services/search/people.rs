//! The people a catalogue credits, matched by name: a search for an actor
//! answers with the actor as well as with the titles they are in.

use std::collections::{BTreeSet, HashMap};

use tantivy::tokenizer::TextAnalyzer;

use super::engine::Asker;
use super::entry::tokens;

/// Somebody credited in the catalogue whose name matches the query.
#[derive(Debug, Clone, PartialEq)]
pub struct PersonHit {
    pub name: String,
    pub tmdb_id: Option<u64>,
    pub profile_url: Option<String>,
    /// How many of the titles the asker may see credit them.
    pub titles: usize,
}

pub(super) struct Person {
    name: String,
    tmdb_id: Option<u64>,
    profile_url: Option<String>,
    words: Vec<String>,
    credits: Vec<Credit>,
}

/// The title a credit is on, which the asker has to see for it to count.
#[derive(Clone)]
pub(super) struct Credit {
    pub(super) library: String,
    pub(super) title: String,
}

impl Credit {
    fn seen_by(&self, asker: &Asker) -> bool {
        (asker.visible)(&self.library) && asker.titles.is_none_or(|ids| ids.contains(&self.title))
    }
}

#[derive(Default)]
pub(super) struct Roster {
    by_key: HashMap<String, Person>,
}

impl Roster {
    pub(super) fn credit(
        &mut self,
        analyzer: &mut TextAnalyzer,
        name: &str,
        tmdb_id: Option<u64>,
        profile_url: Option<&str>,
        on: &Credit,
    ) {
        let words = tokens(analyzer, name);
        if words.is_empty() {
            return;
        }
        let person = self.by_key.entry(words.join(" ")).or_insert_with(|| Person {
            name: name.trim().to_string(),
            tmdb_id,
            profile_url: None,
            words,
            credits: Vec::new(),
        });
        if person.tmdb_id.is_none() {
            person.tmdb_id = tmdb_id;
        }
        if person.profile_url.is_none() {
            person.profile_url = profile_url.map(str::to_string);
        }
        person.credits.push(on.clone());
    }

    pub(super) fn finish(self) -> Vec<Person> {
        let mut people: Vec<Person> = self.by_key.into_values().collect();
        people.sort_by(|a, b| a.name.cmp(&b.name));
        people
    }
}

const MAX_PEOPLE: usize = 6;
const MIN_QUERY_CHARS: usize = 3;

/// The people whose name covers every word of `query`, the best match first.
/// The last word may be unfinished, and a long word may carry a typo.
pub(super) fn matching(people: &[Person], query: &[String], asker: &Asker) -> Vec<PersonHit> {
    let typed: usize = query.iter().map(|w| w.chars().count()).sum();
    if query.is_empty() || typed < MIN_QUERY_CHARS {
        return Vec::new();
    }
    let mut found: Vec<(u32, usize, &Person)> = people
        .iter()
        .filter_map(|person| {
            let closeness = closeness(&person.words, query)?;
            let titles = person.credits.iter().filter(|c| c.seen_by(asker)).count();
            (titles > 0).then_some((closeness, titles, person))
        })
        .collect();
    found.sort_by(|a, b| {
        b.0.cmp(&a.0)
            .then_with(|| b.1.cmp(&a.1))
            .then_with(|| a.2.name.cmp(&b.2.name))
    });
    found
        .into_iter()
        .take(MAX_PEOPLE)
        .map(|(_, titles, person)| PersonHit {
            name: person.name.clone(),
            tmdb_id: person.tmdb_id,
            profile_url: person.profile_url.clone(),
            titles,
        })
        .collect()
}

const EXACT: u32 = 3;
const PREFIX: u32 = 2;
const TYPO: u32 = 1;

fn closeness(name: &[String], query: &[String]) -> Option<u32> {
    if query.len() > name.len() {
        return None;
    }
    let mut taken: BTreeSet<usize> = BTreeSet::new();
    let mut total = 0;
    for (index, word) in query.iter().enumerate() {
        let unfinished = index + 1 == query.len();
        let (slot, score) = name
            .iter()
            .enumerate()
            .filter(|(slot, _)| !taken.contains(slot))
            .filter_map(|(slot, part)| Some((slot, word_match(part, word, unfinished)?)))
            .max_by_key(|(_, score)| *score)?;
        taken.insert(slot);
        total += score;
    }
    Some(total)
}

fn word_match(part: &str, word: &str, unfinished: bool) -> Option<u32> {
    if part == word {
        return Some(EXACT);
    }
    if unfinished && part.starts_with(word) {
        return Some(PREFIX);
    }
    let budget = typo_budget(word);
    (budget > 0 && within(part, word, budget)).then_some(TYPO)
}

pub(super) fn typo_budget(word: &str) -> usize {
    match word.chars().count() {
        0..=4 => 0,
        5..=8 => 1,
        _ => 2,
    }
}

/// Whether `a` and `b` are at most `budget` single-character edits apart.
pub(super) fn within(a: &str, b: &str, budget: usize) -> bool {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.len().abs_diff(b.len()) > budget {
        return false;
    }
    let mut previous: Vec<usize> = (0..=b.len()).collect();
    for (i, ca) in a.iter().enumerate() {
        let mut current = vec![i + 1];
        for (j, cb) in b.iter().enumerate() {
            let substitution = previous[j] + usize::from(ca != cb);
            current.push(substitution.min(previous[j + 1] + 1).min(current[j] + 1));
        }
        previous = current;
    }
    previous[b.len()] <= budget
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;
    use crate::services::search::schema;

    fn roster(credits: &[(&str, &str)]) -> Vec<Person> {
        let mut analyzer = schema::analyzer();
        let mut roster = Roster::default();
        for (title, (name, library)) in credits.iter().enumerate() {
            let on = Credit {
                library: library.to_string(),
                title: title.to_string(),
            };
            roster.credit(&mut analyzer, name, None, None, &on);
        }
        roster.finish()
    }

    fn found_by(
        people: &[Person],
        raw: &str,
        visible: &dyn Fn(&str) -> bool,
        titles: Option<&HashSet<String>>,
    ) -> Vec<PersonHit> {
        let favoured = HashMap::new();
        let asker = Asker {
            visible,
            titles,
            favoured: &favoured,
        };
        matching(people, &query(raw), &asker)
    }

    fn query(raw: &str) -> Vec<String> {
        tokens(&mut schema::analyzer(), raw)
    }

    fn names(people: &[Person], raw: &str) -> Vec<String> {
        found_by(people, raw, &|_| true, None)
            .into_iter()
            .map(|hit| hit.name)
            .collect()
    }

    #[test]
    fn a_full_name_finds_the_person_and_counts_their_titles() {
        let people = roster(&[("Tom Hardy", "films"), ("Tom Hardy", "films"), ("Tom Hanks", "films")]);

        let found = found_by(&people, "tom hardy", &|_| true, None);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "Tom Hardy");
        assert_eq!(found[0].titles, 2);
    }

    #[test]
    fn an_unfinished_last_word_still_finds_them() {
        let people = roster(&[("Tom Hardy", "films"), ("Tom Hanks", "films")]);

        assert_eq!(names(&people, "tom ha"), ["Tom Hanks", "Tom Hardy"]);
        assert_eq!(names(&people, "tom har"), ["Tom Hardy"]);
    }

    #[test]
    fn a_typo_in_a_long_name_is_forgiven_and_ranks_below_the_exact_one() {
        let people = roster(&[("Denis Villeneuve", "films"), ("Dennis Villeneuve", "films")]);

        assert_eq!(
            names(&people, "denis villenueve"),
            ["Denis Villeneuve", "Dennis Villeneuve"]
        );
    }

    #[test]
    fn an_accent_the_query_leaves_out_does_not_hide_them() {
        let people = roster(&[("Léa Seydoux", "films")]);

        assert_eq!(names(&people, "lea seydoux"), ["Léa Seydoux"]);
    }

    #[test]
    fn somebody_credited_only_in_a_library_the_asker_cannot_see_is_absent() {
        let people = roster(&[("Tom Hardy", "private"), ("Tom Hardy", "films")]);

        let seen = found_by(&people, "hardy", &|library| library == "films", None);
        let hidden = found_by(&people, "hardy", &|library| library == "kids", None);

        assert_eq!(seen[0].titles, 1);
        assert!(hidden.is_empty());
    }

    #[test]
    fn a_person_is_counted_only_over_the_titles_a_profile_may_see() {
        let people = roster(&[("Tom Hardy", "films"), ("Tom Hardy", "films")]);
        let one = HashSet::from(["1".to_string()]);
        let none = HashSet::new();

        let seen = found_by(&people, "hardy", &|_| true, Some(&one));
        let hidden = found_by(&people, "hardy", &|_| true, Some(&none));

        assert_eq!(seen[0].titles, 1);
        assert!(hidden.is_empty());
    }

    #[test]
    fn a_query_of_two_letters_names_nobody() {
        let people = roster(&[("Al Pacino", "films")]);

        assert!(names(&people, "al").is_empty());
        assert_eq!(names(&people, "al p"), ["Al Pacino"]);
    }

    #[test]
    fn a_word_typed_twice_needs_two_words_of_the_name() {
        let people = roster(&[("Tom Hardy", "films")]);

        assert!(names(&people, "tom tom").is_empty());
    }

    #[test]
    fn edits_are_counted_up_to_the_budget() {
        assert!(within("villeneuve", "villenueve", 2));
        assert!(!within("villeneuve", "villenueve", 1));
        assert!(within("hardy", "hardi", 1));
        assert!(!within("hardy", "hard", 0));
        assert!(!within("a", "abcd", 2));
    }
}

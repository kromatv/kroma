use super::*;
use crate::services::search::lexicon::Lexicon;

fn read(raw: &str) -> Parsed {
    let words: Vec<String> = raw.split_whitespace().map(str::to_string).collect();
    parse(&words, Lexicon::shared())
}

fn texts(parsed: &Parsed) -> Vec<&str> {
    parsed.tokens.iter().map(|t| t.text.as_str()).collect()
}

#[test]
fn a_year_beside_a_title_is_read_as_the_release_year() {
    let parsed = read("dune 2021");

    assert_eq!(parsed.year(), Some(2021));
    assert_eq!(parsed.text_words(), ["dune"]);
}

#[test]
fn a_year_alone_is_a_title() {
    let parsed = read("2012");

    assert_eq!(parsed.year(), None);
    assert_eq!(parsed.text_words(), ["2012"]);
}

#[test]
fn a_number_out_of_the_cinema_s_lifetime_is_not_a_year() {
    assert_eq!(read("blade runner 2049").year(), Some(2049));
    assert_eq!(read("apollo 1313").year(), None);
    assert_eq!(read("thx 1138").year(), None);
}

#[test]
fn a_word_naming_the_kind_is_read_as_one_only_beside_a_title() {
    assert_eq!(read("dune film").kind(), Some(HitKind::Movie));
    assert_eq!(read("dark series").kind(), Some(HitKind::Show));
    assert_eq!(read("show").kind(), None);
}

#[test]
fn an_episode_is_located_however_it_is_written() {
    let at = |season, episode| Some(Locator { season, episode });

    assert_eq!(read("breaking bad s02e05").locator, at(2, Some(5)));
    assert_eq!(read("breaking bad 2x05").locator, at(2, Some(5)));
    assert_eq!(read("breaking bad s2 e5").locator, at(2, Some(5)));
    assert_eq!(read("breaking bad s2").locator, at(2, None));
    assert_eq!(read("breaking bad saison 2 episode 5").locator, at(2, Some(5)));
    assert_eq!(read("breaking bad season 3").locator, at(3, None));
}

#[test]
fn the_locator_leaves_the_words_of_the_title_behind() {
    let parsed = read("breaking bad s02e05");

    assert_eq!(texts(&parsed), ["breaking", "bad"]);
}

#[test]
fn a_locator_with_nothing_to_locate_is_a_title() {
    let parsed = read("s2");

    assert_eq!(parsed.locator, None);
    assert_eq!(texts(&parsed), ["s2"]);
}

#[test]
fn a_word_that_only_looks_like_a_locator_stays_a_word() {
    assert_eq!(read("sex education").locator, None);
    assert_eq!(read("the season finale").locator, None);
    assert_eq!(read("saxophone").locator, None);
}

#[test]
fn a_sequel_number_carries_its_other_spellings() {
    let two = &read("rocky 2").tokens[1];
    let roman = &read("rocky iii").tokens[1];

    assert_eq!(two.aliases, ["ii", "two", "deux"]);
    assert_eq!(roman.aliases, ["3", "three", "trois"]);
}

#[test]
fn a_single_letter_is_never_expanded_to_a_number() {
    assert!(read("x men").tokens[0].aliases.is_empty());
    assert!(read("v for vendetta").tokens[0].aliases.is_empty());
}

#[test]
fn a_literal_reading_keeps_every_word_as_text() {
    let parsed = literal(&["dune".to_string(), "2021".to_string(), "s2".to_string()]);

    assert_eq!(parsed.text_words(), ["dune", "2021", "s2"]);
    assert_eq!(parsed.locator, None);
}

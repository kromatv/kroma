use super::super::context::{Context, PartOfDay};
use super::*;
use crate::db::TitleFacts;
use crate::services::reco::genre::{
    ACTION, ANIMATION, COMEDY, CRIME, FAMILY, HORROR, MYSTERY, THRILLER, WAR,
};
use crate::services::reco::Catalog;
use crate::services::vocab;
use time::Weekday;

fn ctx(month: u8, weekday: Weekday, part: PartOfDay) -> Context {
    Context {
        month,
        weekday,
        part_of_day: part,
        in_progress: Vec::new(),
    }
}

fn theme(key: &str) -> &'static Theme {
    BANK.iter().find(|theme| theme.key == key).unwrap()
}

fn facts(id: &str, genres: &[u32]) -> TitleFacts {
    TitleFacts {
        id: id.into(),
        library: "lib".into(),
        genre_ids: genres.to_vec(),
        ..TitleFacts::default()
    }
}

fn engine(titles: &[(&str, &str, &str)]) -> SearchEngine {
    use crate::services::search::tests::{meta, movie};
    let movies: Vec<_> = titles
        .iter()
        .map(|(id, title, overview)| movie(id, title, Some(meta(title, overview, &[], &[]))))
        .collect();
    let engine = SearchEngine::new().unwrap();
    engine.rebuild(&movies, &[], &[]).unwrap();
    engine
}

fn member_ids(theme: &Theme, catalog: &Catalog, search: &SearchEngine) -> Vec<String> {
    let mut ids: Vec<String> = theme
        .members(&catalog.titles, search)
        .into_iter()
        .map(|(title, _)| title.facts.id.clone())
        .collect();
    ids.sort();
    ids
}

#[test]
fn a_christmas_slasher_is_not_a_christmas_film() {
    let catalog = Catalog::build(vec![
        facts("klaus", &[ANIMATION, FAMILY]),
        facts("black-christmas", &[HORROR, MYSTERY]),
        facts("violent-night", &[ACTION, THRILLER]),
        facts("heat", &[CRIME]),
    ]);
    let search = engine(&[
        ("klaus", "Klaus", "A postman and a toymaker invent Christmas."),
        ("black-christmas", "Black Christmas", "Sorority sisters are stalked over the holidays."),
        ("violent-night", "Violent Night", "Santa Claus fights mercenaries on Christmas Eve."),
        ("heat", "Heat", "A crew of thieves in Los Angeles."),
    ]);

    assert_eq!(member_ids(theme("christmas"), &catalog, &search), ["klaus"]);
}

#[test]
fn a_family_film_that_never_mentions_christmas_is_not_one_either() {
    let catalog = Catalog::build(vec![facts("up", &[ANIMATION, FAMILY])]);
    let search = engine(&[("up", "Up", "An old man ties balloons to his house.")]);

    assert!(member_ids(theme("christmas"), &catalog, &search).is_empty());
}

#[test]
fn a_theme_is_carried_in_whatever_language_the_synopsis_was_stored() {
    let catalog = Catalog::build(vec![facts("fr", &[COMEDY]), facts("en", &[CRIME])]);
    let search = engine(&[
        ("fr", "Le Père Noël est une ordure", "Une permanence téléphonique le soir de Noël."),
        ("en", "Inside Man", "A perfect bank heist turns into a hostage standoff."),
    ]);

    assert_eq!(member_ids(theme("christmas"), &catalog, &search), ["fr"]);
    assert_eq!(member_ids(theme("heist"), &catalog, &search), ["en"]);
}

#[test]
fn a_genre_theme_admits_by_genre_alone_and_refuses_what_it_excludes() {
    let catalog = Catalog::build(vec![
        facts("scream", &[HORROR]),
        facts("coco", &[ANIMATION, FAMILY]),
        facts("grave", &[ANIMATION, WAR]),
    ]);
    let search = engine(&[]);

    assert_eq!(member_ids(theme("halloween"), &catalog, &search), ["scream"]);
    assert_eq!(member_ids(theme("family"), &catalog, &search), ["coco"]);
}

#[test]
fn a_mood_is_one_only_an_embedder_can_tell() {
    assert!(theme("tearjerker").is_a_mood());
    assert!(theme("mind-bending").is_a_mood());
    assert!(!theme("christmas").is_a_mood());
    assert!(!theme("halloween").is_a_mood());
}

#[test]
fn a_theme_is_eligible_in_its_season_and_its_hours_and_seasonal_ones_lead() {
    let december = ctx(12, Weekday::Wednesday, PartOfDay::Afternoon);
    let keys: Vec<&str> = eligible(&december).iter().map(|t| t.key).collect();

    assert_eq!(keys[0], "christmas");
    assert!(keys.contains(&"action"));
    assert!(!keys.contains(&"halloween"));
    assert!(!keys.contains(&"family"), "weekends only");
    assert!(!keys.contains(&"thriller"), "evenings only");

    let saturday_night = ctx(7, Weekday::Saturday, PartOfDay::Evening);
    let keys: Vec<&str> = eligible(&saturday_night).iter().map(|t| t.key).collect();
    assert!(keys.contains(&"summer") && keys.contains(&"family") && keys.contains(&"thriller"));
    assert!(!keys.contains(&"christmas"));
}

#[test]
fn every_theme_has_a_rule_to_stand_on() {
    for theme in BANK {
        assert!(
            !theme.any.is_empty() || theme.evidence.is_some(),
            "{} admits everything",
            theme.key
        );
    }
}

#[test]
fn every_theme_that_asks_for_evidence_names_a_vocabulary_that_exists() {
    for theme in BANK {
        if let Some(key) = theme.evidence {
            assert!(!vocab::words(key).is_empty(), "{} reads {key}, which says nothing", theme.key);
        }
    }
}

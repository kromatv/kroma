use super::*;
use crate::db::Engagement;
use crate::services::reco::catalog::fixtures::film;
use crate::services::reco::catalog::Catalog;
use crate::services::reco::genre::{COMEDY, HORROR, SCIENCE_FICTION};

const NOW: i64 = 1_800_000_000;

fn taste_for(catalog: &Catalog, finished: &[&str]) -> Taste {
    let history = finished
        .iter()
        .map(|id| {
            (
                id.to_string(),
                Engagement { started: 1, finished: 1, plays: 1, last_at: NOW, ..Engagement::default() },
            )
        })
        .collect();
    Taste::read(catalog, &history, NOW)
}

fn ids(ranked: &[Scored]) -> Vec<String> {
    ranked.iter().map(|s| s.title.facts.id.clone()).collect()
}

fn signals<'a>(taste: &'a Taste, none: &'a HashMap<String, f32>) -> Signals<'a> {
    Signals { taste, vectors: none, social: none, now: NOW, salt: 7 }
}

#[test]
fn what_fits_the_taste_comes_before_what_does_not() {
    let catalog = Catalog::build(vec![
        film("seen", &[HORROR], &[], "Ari Aster"),
        film("kin", &[HORROR], &[], "Ari Aster"),
        film("far", &[COMEDY], &[], "Somebody"),
        film("far2", &[COMEDY], &[], ""),
    ]);
    let taste = taste_for(&catalog, &["seen"]);
    let none = HashMap::new();
    let pool = catalog.titles.iter().filter(|t| t.facts.id != "seen");

    let ranked = rank(&signals(&taste, &none), pool);

    assert_eq!(ids(&ranked)[0], "kin");
}

#[test]
fn with_no_history_the_better_rated_and_the_newer_lead() {
    let mut acclaimed = film("acclaimed", &[COMEDY], &[], "");
    acclaimed.rating = Some(8.8);
    let mut panned = film("panned", &[COMEDY], &[], "");
    panned.rating = Some(3.1);
    let catalog = Catalog::build(vec![acclaimed, panned]);
    let taste = taste_for(&catalog, &[]);
    let none = HashMap::new();

    let ranked = rank(&signals(&taste, &none), &catalog.titles);

    assert_eq!(ids(&ranked), ["acclaimed", "panned"]);
}

#[test]
fn a_saved_title_is_lifted_among_equals() {
    let catalog = Catalog::build(vec![film("a", &[COMEDY], &[], ""), film("b", &[COMEDY], &[], "")]);
    let history = HashMap::from([(
        "b".to_string(),
        Engagement { listed: true, last_at: NOW, ..Engagement::default() },
    )]);
    let taste = Taste::read(&catalog, &history, NOW);
    let none = HashMap::new();

    let ranked = rank(&signals(&taste, &none), &catalog.titles);

    assert_eq!(ids(&ranked)[0], "b");
}

#[test]
fn the_same_viewer_gets_the_same_order_all_day_and_another_tomorrow() {
    let titles: Vec<_> = (0..40).map(|n| film(&format!("t{n}"), &[COMEDY], &[], "")).collect();
    let catalog = Catalog::build(titles);
    let taste = taste_for(&catalog, &[]);
    let none = HashMap::new();
    let on = |salt| {
        ids(&rank(
            &Signals { taste: &taste, vectors: &none, social: &none, now: NOW, salt },
            &catalog.titles,
        ))
    };

    assert_eq!(on(salt("u1", 100)), on(salt("u1", 100)));
    assert_ne!(on(salt("u1", 100)), on(salt("u1", 101)));
    assert_ne!(on(salt("u1", 100)), on(salt("u2", 100)));
}

#[test]
fn a_row_alternates_genres_instead_of_running_one() {
    let catalog = Catalog::build(vec![
        film("h1", &[HORROR], &[], ""),
        film("h2", &[HORROR], &[], ""),
        film("h3", &[HORROR], &[], ""),
        film("c1", &[COMEDY], &[], ""),
        film("s1", &[SCIENCE_FICTION], &[], ""),
    ]);
    let score = |id: &str, score| Scored { title: catalog.get(id).unwrap(), score };
    let ranked = [
        score("h1", 0.90),
        score("h2", 0.89),
        score("h3", 0.88),
        score("c1", 0.84),
        score("s1", 0.83),
    ];

    let row: Vec<&str> = spread(&ranked, 4).iter().map(|t| t.facts.id.as_str()).collect();

    assert_eq!(row, ["h1", "c1", "s1", "h2"]);
}

#[test]
fn a_far_better_title_is_not_held_back_for_variety() {
    let catalog = Catalog::build(vec![
        film("h1", &[HORROR], &[], ""),
        film("h2", &[HORROR], &[], ""),
        film("c1", &[COMEDY], &[], ""),
    ]);
    let score = |id: &str, score| Scored { title: catalog.get(id).unwrap(), score };
    let ranked = [score("h1", 0.9), score("h2", 0.85), score("c1", 0.4)];

    let row: Vec<&str> = spread(&ranked, 3).iter().map(|t| t.facts.id.as_str()).collect();

    assert_eq!(row, ["h1", "h2", "c1"]);
}

#[test]
fn what_a_like_minded_viewer_watched_is_scored_and_a_stranger_s_is_not() {
    let play = |user: &str, title: &str| (user.to_string(), title.to_string());
    let plays = vec![
        play("me", "a"),
        play("me", "b"),
        play("twin", "a"),
        play("twin", "b"),
        play("twin", "c"),
        play("stranger", "z"),
    ];

    let scores = cowatched(&plays, "me");

    assert_eq!(scores.get("c").copied(), Some(1.0));
    assert!(!scores.contains_key("z"));
    assert!(!scores.contains_key("a"), "what I watched is not news to me");
    assert!(cowatched(&plays, "nobody").is_empty());
}

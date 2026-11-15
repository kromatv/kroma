use std::collections::HashMap;

use super::engine::{Asker, SearchEngine};
use super::tests::{episode, ids, meta, movie, show};
use crate::domain::metadata::CrewMember;
use crate::model::{MediaItem, Metadata};

fn released(mut item: MediaItem, year: u32) -> MediaItem {
    item.year = Some(year);
    item
}

fn numbered(mut item: MediaItem, season: u32, number: u32) -> MediaItem {
    item.season = Some(season);
    item.episode = Some(number);
    item
}

fn rated(title: &str, rating: f32) -> Metadata {
    let mut m = meta(title, "", &[], &[]);
    m.rating = Some(rating);
    m
}

fn directed_by(title: &str, director: &str) -> Metadata {
    let mut m = meta(title, "", &[], &[]);
    m.crew = vec![CrewMember {
        name: director.into(),
        tmdb_id: None,
        job: "Director".into(),
        profile_url: None,
    }];
    m
}

fn engine_of(movies: &[MediaItem], shows: &[crate::model::Show], episodes: &[MediaItem]) -> SearchEngine {
    let e = SearchEngine::new().unwrap();
    e.rebuild(movies, shows, episodes).unwrap();
    e
}

#[test]
fn a_year_picks_the_film_of_that_year_among_namesakes() {
    let e = engine_of(
        &[
            released(movie("dune-84", "Dune", None), 1984),
            released(movie("dune-21", "Dune", None), 2021),
        ],
        &[],
        &[],
    );

    assert_eq!(ids(&e, "dune 2021", 5), ["dune-21", "dune-84"]);
    assert_eq!(ids(&e, "dune 1984", 5), ["dune-84", "dune-21"]);
}

#[test]
fn a_year_that_is_part_of_the_title_still_finds_it() {
    let e = engine_of(
        &[movie("br", "Blade Runner 2049", None), movie("other", "Blade", None)],
        &[],
        &[],
    );

    assert_eq!(ids(&e, "blade runner 2049", 5), ["br"]);
}

#[test]
fn an_episode_named_by_its_number_comes_before_its_show() {
    let episodes: Vec<MediaItem> = (1..=8)
        .flat_map(|season| (1..=13).map(move |number| (season, number)))
        .map(|(season, number)| {
            numbered(
                episode(
                    &format!("s{season}e{number}"),
                    "bb",
                    "Breaking Bad",
                    &format!("Chapter {season}-{number}"),
                ),
                season,
                number,
            )
        })
        .collect();
    let e = engine_of(&[], &[show("bb", "Breaking Bad", None)], &episodes);

    assert_eq!(ids(&e, "breaking bad s02e05", 5), ["s2e5", "bb"]);
    assert_eq!(ids(&e, "breaking bad 3x11", 5), ["s3e11", "bb"]);
    assert_eq!(ids(&e, "breaking bad saison 4 episode 1", 5), ["s4e1", "bb"]);
}

#[test]
fn a_query_that_only_looks_like_an_episode_number_falls_back_to_its_words() {
    let e = engine_of(&[movie("m", "Apollo 2x4", None)], &[], &[]);

    assert_eq!(ids(&e, "apollo 2x4", 5), ["m"]);
}

#[test]
fn a_sequel_is_found_however_its_number_is_written() {
    let e = engine_of(
        &[
            movie("r1", "Rocky", None),
            movie("r2", "Rocky II", None),
            movie("r4", "Rocky IV", None),
        ],
        &[],
        &[],
    );

    assert_eq!(ids(&e, "rocky 2", 5)[0], "r2");
    assert_eq!(ids(&e, "rocky two", 5)[0], "r2");
    assert_eq!(ids(&e, "rocky 4", 5)[0], "r4");
}

#[test]
fn a_hyphenated_title_is_found_typed_as_one_word_and_the_reverse() {
    let e = engine_of(
        &[movie("sm", "Spider-Man", None), movie("bm", "Batman", None)],
        &[],
        &[],
    );

    assert_eq!(ids(&e, "spiderman", 5), ["sm"]);
    assert_eq!(ids(&e, "bat man", 5), ["bm"]);
}

#[test]
fn the_exact_title_comes_before_the_longer_ones_that_contain_it() {
    let e = engine_of(
        &[
            movie("children", "Children of Dune", None),
            movie("part-two", "Dune: Part Two", None),
            movie("dune", "Dune", None),
        ],
        &[],
        &[],
    );

    assert_eq!(ids(&e, "dune", 5), ["dune", "part-two", "children"]);
}

#[test]
fn between_two_namesakes_the_better_rated_comes_first() {
    let e = engine_of(
        &[
            movie("flop", "Heat", Some(rated("Heat", 4.1))),
            movie("classic", "Heat", Some(rated("Heat", 8.3))),
        ],
        &[],
        &[],
    );

    assert_eq!(ids(&e, "heat", 5), ["classic", "flop"]);
}

#[test]
fn a_director_finds_the_films_they_made() {
    let e = engine_of(
        &[
            movie("arrival", "Arrival", Some(directed_by("Arrival", "Denis Villeneuve"))),
            movie("heat", "Heat", Some(directed_by("Heat", "Michael Mann"))),
        ],
        &[],
        &[],
    );

    assert_eq!(ids(&e, "villeneuve", 5), ["arrival"]);
    assert_eq!(ids(&e, "denis villenueve", 5), ["arrival"]);
}

#[test]
fn a_word_naming_the_kind_favours_that_kind() {
    let e = engine_of(
        &[movie("film", "Fargo", None)],
        &[show("serie", "Fargo", None)],
        &[],
    );

    assert_eq!(ids(&e, "fargo", 5), ["film", "serie"]);
    assert_eq!(ids(&e, "fargo series", 5), ["serie", "film"]);
}

#[test]
fn a_query_nothing_answers_in_full_falls_back_to_most_of_its_words() {
    let e = engine_of(
        &[
            movie("lotr", "The Lord of the Rings", None),
            movie("flies", "Lord of the Flies", None),
        ],
        &[],
        &[],
    );

    assert_eq!(ids(&e, "lord rings extended cut", 5), ["lotr"]);
}

#[test]
fn a_title_the_asker_is_watching_comes_before_its_namesake() {
    let e = engine_of(
        &[movie("film", "Fargo", None)],
        &[show("serie", "Fargo", None)],
        &[],
    );
    let favoured = HashMap::from([("serie".to_string(), 1.6)]);
    let asker = Asker {
        visible: &|_| true,
        favoured: &favoured,
    };

    let answer = e.answer("fargo", 5, &asker);

    assert_eq!(answer.hits[0].id, "serie");
}

#[test]
fn a_title_in_a_library_the_asker_cannot_see_does_not_take_a_place() {
    let mut hidden = movie("hidden", "Fargo", None);
    hidden.library = "private".into();
    let e = engine_of(&[hidden, movie("seen", "Fargo North", None)], &[], &[]);
    let asker = Asker {
        visible: &|library| library == "lib",
        favoured: &HashMap::new(),
    };

    let answer = e.answer("fargo", 1, &asker);

    assert_eq!(answer.hits.len(), 1);
    assert_eq!(answer.hits[0].id, "seen");
}

#[test]
fn a_name_answers_with_the_person_as_well_as_their_titles() {
    let e = engine_of(
        &[
            movie("a", "Inception", Some(meta("Inception", "", &[], &["Tom Hardy"]))),
            movie("b", "Venom", Some(meta("Venom", "", &[], &["Tom Hardy"]))),
        ],
        &[],
        &[],
    );
    let asker = Asker {
        visible: &|_| true,
        favoured: &HashMap::new(),
    };

    let answer = e.answer("tom hardy", 5, &asker);

    assert_eq!(answer.hits.len(), 2);
    assert_eq!(answer.people.len(), 1);
    assert_eq!(answer.people[0].name, "Tom Hardy");
    assert_eq!(answer.people[0].titles, 2);
}

#[test]
fn a_full_name_ranks_the_films_of_that_person_above_a_film_that_merely_has_both_words() {
    let e = engine_of(
        &[
            movie(
                "two-people",
                "Bohemian Rhapsody",
                Some(meta("Bohemian Rhapsody", "", &[], &["Tom Hollander", "Ben Hardy"])),
            ),
            movie("one-person", "Venom", Some(meta("Venom", "", &[], &["Tom Hardy"]))),
        ],
        &[],
        &[],
    );

    assert_eq!(ids(&e, "tom hardy", 5), ["one-person", "two-people"]);
}

#[test]
fn a_theme_is_carried_by_a_title_or_a_synopsis_in_any_wording_given() {
    let e = engine_of(
        &[
            movie("title", "Last Christmas", None),
            movie(
                "synopsis",
                "Klaus",
                Some(meta("Klaus", "A postman befriends a toymaker; le Père Noël est né.", &[], &[])),
            ),
            movie("neither", "Heat", Some(meta("Heat", "A heist crew in Los Angeles.", &[], &[]))),
        ],
        &[show("show", "Noël en famille", None)],
        &[episode("ep", "s1", "Some Show", "The Christmas Special")],
    );

    let carried = e.carrying(&["christmas", "père noël", "noel"]);

    assert_eq!(carried.get("title").copied(), Some(1.0));
    assert!(carried["synopsis"] < 1.0);
    assert!(carried.contains_key("show"));
    assert!(!carried.contains_key("neither"));
    assert!(!carried.contains_key("ep"), "an episode is not a title a row offers");
}

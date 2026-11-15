use super::*;
use crate::services::reco::catalog::fixtures::{film, series};
use crate::services::reco::genre::{COMEDY, HORROR, SCIENCE_FICTION};

const NOW: i64 = 1_800_000_000;

fn finished(days_ago: i64) -> Engagement {
    Engagement {
        started: 1,
        finished: 1,
        plays: 1,
        last_at: NOW - days_ago * DAY,
        ..Engagement::default()
    }
}

fn sampled(ratio: f32, days_ago: i64) -> Engagement {
    Engagement {
        started: 1,
        furthest: ratio,
        plays: 1,
        last_at: NOW - days_ago * DAY,
        ..Engagement::default()
    }
}

#[test]
fn finishing_counts_for_a_film_and_replaying_it_counts_for_more() {
    let once = weight(&finished(0), false, NOW);
    let twice = weight(&Engagement { plays: 3, ..finished(0) }, false, NOW);

    assert_eq!(once, 1.0);
    assert!(twice > once);
}

#[test]
fn a_film_dropped_in_its_first_minutes_counts_against_once_it_is_left_alone() {
    assert_eq!(weight(&sampled(0.05, 0), false, NOW), 0.0, "still tonight's film");
    assert!(weight(&sampled(0.05, 5), false, NOW) < 0.0);
    assert!(weight(&sampled(0.6, 5), false, NOW) > 0.0, "most of it was watched");
}

#[test]
fn a_season_says_more_than_an_episode_and_never_more_than_the_ceiling() {
    let episodes = |n| weight(&Engagement { started: n, finished: n, last_at: NOW, ..Engagement::default() }, true, NOW);

    assert!(episodes(1) < episodes(3) && episodes(3) < episodes(10));
    assert!(episodes(100) <= SHOW_CEILING);
    assert!(weight(&sampled(0.3, 30), true, NOW) < 0.0, "one episode started, then nothing");
}

#[test]
fn an_old_favourite_fades_without_vanishing() {
    let fresh = weight(&finished(0), false, NOW);
    let old = weight(&finished(720), false, NOW);

    assert!(old < fresh * 0.5);
    assert!(old >= FADED_FLOOR - 1e-4);
}

#[test]
fn a_saved_title_counts_for_the_taste_and_stays_recommendable() {
    let catalog = Catalog::build(vec![film("a", &[HORROR], &[], "")]);
    let history = HashMap::from([(
        "a".to_string(),
        Engagement { listed: true, last_at: NOW, ..Engagement::default() },
    )]);

    let taste = Taste::read(&catalog, &history, NOW);

    assert!(!taste.is_blank());
    assert!(taste.saved.contains("a"));
    assert!(!taste.seen.contains("a"));
}

#[test]
fn the_taste_fits_what_resembles_what_was_finished() {
    let catalog = Catalog::build(vec![
        film("watched", &[SCIENCE_FICTION], &["Amy Adams"], "Denis Villeneuve"),
        film("kin", &[SCIENCE_FICTION], &[], "Denis Villeneuve"),
        film("stranger", &[COMEDY], &[], "Somebody"),
        film("filler", &[COMEDY], &[], ""),
        film("more-sf", &[SCIENCE_FICTION], &[], ""),
        film("yet-more-sf", &[SCIENCE_FICTION], &[], ""),
    ]);
    let history = HashMap::from([("watched".to_string(), finished(1))]);

    let taste = Taste::read(&catalog, &history, NOW);
    let fit = |id: &str| taste.affinity(catalog.get(id).unwrap());

    assert!(fit("kin") > fit("stranger"));
    assert!(taste.seen.contains("watched"));
    assert_eq!(
        taste.strongest(catalog.get("kin").unwrap()),
        Some(&Feature::Director("denis villeneuve".into()))
    );
}

#[test]
fn a_dropped_genre_pulls_its_titles_down() {
    let catalog = Catalog::build(vec![
        film("liked", &[COMEDY], &[], ""),
        film("dropped", &[HORROR], &[], ""),
        film("more-horror", &[HORROR], &[], ""),
        film("more-comedy", &[COMEDY], &[], ""),
    ]);
    let history = HashMap::from([
        ("liked".to_string(), finished(1)),
        ("dropped".to_string(), sampled(0.05, 10)),
    ]);

    let taste = Taste::read(&catalog, &history, NOW);
    let fit = |id: &str| taste.affinity(catalog.get(id).unwrap());

    assert!(fit("more-horror") < 0.0);
    assert!(fit("more-comedy") > 0.0);
}

#[test]
fn one_film_is_not_a_leaning_and_two_are() {
    let catalog = Catalog::build(vec![
        film("a", &[HORROR], &[], ""),
        film("b", &[HORROR], &[], ""),
        film("c", &[COMEDY], &[], ""),
        series("d", &[SCIENCE_FICTION]),
    ]);
    let history = HashMap::from([
        ("a".to_string(), finished(1)),
        ("b".to_string(), finished(2)),
        ("c".to_string(), finished(3)),
    ]);

    let taste = Taste::read(&catalog, &history, NOW);
    let genres = taste.leanings(&catalog, 2, |f| matches!(f, Feature::Genre(_)));

    assert_eq!(genres.len(), 1);
    assert_eq!(genres[0].0, Feature::Genre(HORROR));
}

use super::fixtures::{film, ids_of, row, seed, seed_many, viewer, Film};
use super::{build_home, trending_ids};
use crate::model::Layout;
use crate::services::reco::genre::COMEDY;
use crate::test_support::{self, now_secs};

#[test]
fn somebody_alone_on_a_server_is_shown_what_the_world_watches_among_their_titles() {
    let state = test_support::test_state();
    seed_many(&state, "m", 6, &[COMEDY]);
    for (n, tmdb) in [(0, 9001u64), (1, 9002), (2, 9003), (3, 9004), (4, 9005)] {
        let id = format!("w{n}");
        seed(&state, Film { tmdb: Some(tmdb), ..film(&id, &[COMEDY]) });
    }
    let user = viewer(&state, "alone");
    for id in ["m0", "m1", "m2", "m3", "m4"] {
        test_support::seed_play(&state, &user, id, now_secs());
    }
    state.home.world.hold(vec![
        (false, 9003),
        (false, 4242),
        (false, 9001),
        (true, 9002),
        (false, 9005),
        (false, 9004),
        (false, 9002),
    ]);

    let sections = build_home(&state, &state.db, "en", &user);

    let trending = row(&sections, "trending").expect("a trending row");
    assert_eq!(ids_of(trending), ["w2", "w0", "w4", "w3", "w1"]);
    assert_eq!(trending.layout, Layout::Ranked);
}

#[test]
fn a_household_of_several_leads_its_trending_with_what_it_played() {
    let state = test_support::test_state();
    seed_many(&state, "m", 6, &[COMEDY]);
    seed(&state, Film { tmdb: Some(9001), ..film("w0", &[COMEDY]) });
    let (ann, bob) = (viewer(&state, "ann"), viewer(&state, "bob"));
    for id in ["m0", "m1", "m2", "m3"] {
        test_support::seed_play(&state, &ann, id, now_secs());
    }
    test_support::seed_play(&state, &bob, "m0", now_secs());
    state.home.world.hold(vec![(false, 9001)]);

    let sections = build_home(&state, &state.db, "en", &ann);

    let trending = ids_of(row(&sections, "trending").expect("a trending row"));
    assert_eq!(trending[0], "m0");
    assert_eq!(trending.last(), Some(&"w0"));
    assert_eq!(trending.len(), 5);
}

#[test]
fn a_broken_trending_query_costs_the_row_and_nothing_else() {
    let state = test_support::test_state();
    seed_many(&state, "m", 8, &[COMEDY]);
    state.db.get().unwrap().execute("DROP TABLE play_history", []).unwrap();

    assert!(trending_ids(&state.db, 10).is_empty());
    let sections = build_home(&state, &state.db, "en", "u1");

    assert!(row(&sections, "trending").is_none());
    assert!(row(&sections, "recent").is_some());
}

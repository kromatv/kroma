use time::Weekday;

use super::board::Board;
use super::context::{Context, PartOfDay};
use super::fixtures::{film, finish, ids_of, row, seed, seed_many, stamp, viewer, Film};
use super::*;
use crate::model::Layout;
use crate::services::reco::genre::{ANIMATION, COMEDY, FAMILY, HORROR, SCIENCE_FICTION};
use crate::test_support::{self, now_secs};

#[test]
fn somebody_with_no_history_still_opens_on_a_full_page() {
    let state = test_support::test_state();
    seed_many(&state, "m", 14, &[COMEDY]);
    let user = viewer(&state, "new");

    let sections = build_home(&state, &state.db, "en", &user);

    let hero = row(&sections, "hero").expect("a hero");
    assert_eq!(hero.layout, Layout::Hero);
    assert!((1..=5).contains(&hero.items.len()));
    assert!(row(&sections, "for-you").is_some());
    assert_eq!(row(&sections, "recent").unwrap().items.len(), 14);
    assert!(row(&sections, "because").is_none() && sections.iter().all(|s| !s.id.starts_with("genre:")));
}

#[test]
fn what_was_finished_is_not_recommended_again_and_still_shows_as_recently_added() {
    let state = test_support::test_state();
    seed_many(&state, "m", 14, &[COMEDY]);
    let user = viewer(&state, "fin");
    finish(&state, &user, "m0");

    let sections = build_home(&state, &state.db, "en", &user);

    let recommended = sections
        .iter()
        .filter(|s| !matches!(s.id.as_str(), "recent" | "trending"))
        .flat_map(ids_of);
    assert!(recommended.into_iter().all(|id| id != "m0"));
    assert!(ids_of(row(&sections, "recent").unwrap()).contains(&"m0"));
}

#[test]
fn a_film_left_half_watched_is_not_offered_again_under_the_continue_rail() {
    let state = test_support::test_state();
    seed_many(&state, "m", 10, &[COMEDY]);
    let user = viewer(&state, "cw");
    crate::db::upsert_progress(&state.db, &user, "m0", 3_000_000, Some(6_000_000)).unwrap();

    let sections = build_home(&state, &state.db, "en", &user);

    let offered = sections.iter().filter(|s| s.id != "recent").flat_map(ids_of);
    assert!(offered.into_iter().all(|id| id != "m0"));
}

#[test]
fn no_recommendation_row_repeats_a_title_another_one_offered() {
    let state = test_support::test_state();
    seed_many(&state, "h", 16, &[HORROR]);
    seed_many(&state, "c", 16, &[COMEDY]);
    let user = viewer(&state, "dup");
    finish(&state, &user, "h0");
    finish(&state, &user, "h1");

    let sections = build_home(&state, &state.db, "en", &user);

    let mut offered = std::collections::HashSet::new();
    for section in sections.iter().filter(|s| !matches!(s.id.as_str(), "recent" | "trending")) {
        for id in ids_of(section) {
            assert!(offered.insert(id.to_string()), "{id} is in {} and in an earlier row", section.id);
        }
    }
}

#[test]
fn a_genre_somebody_keeps_finishing_gets_its_own_row_of_only_that_genre() {
    let state = test_support::test_state();
    let horror = seed_many(&state, "h", 30, &[HORROR]);
    seed_many(&state, "c", 30, &[COMEDY]);
    let user = viewer(&state, "fan");
    finish(&state, &user, "h0");
    finish(&state, &user, "h1");
    finish(&state, &user, "h2");

    let sections = build_home(&state, &state.db, "en", &user);

    let leaning = row(&sections, &format!("genre:{HORROR}")).expect("a horror row");
    assert_eq!(leaning.title, "Horror for you");
    assert!(ids_of(leaning).iter().all(|id| horror.iter().any(|h| h == id)));
    assert!(row(&sections, &format!("genre:{COMEDY}")).is_none());
}

#[test]
fn the_page_leads_with_what_fits_the_taste() {
    let state = test_support::test_state();
    seed_many(&state, "h", 12, &[HORROR]);
    seed_many(&state, "c", 12, &[COMEDY]);
    let user = viewer(&state, "lead");
    finish(&state, &user, "h0");
    finish(&state, &user, "h1");

    let sections = build_home(&state, &state.db, "en", &user);

    let picks = row(&sections, "for-you").unwrap();
    assert!(picks.items[0].id().starts_with('h'));
    let hero = row(&sections, "hero").unwrap();
    assert!(hero.items[0].id().starts_with('h'));
    assert_eq!(
        hero.notes.get(hero.items[0].id()).map(String::as_str),
        Some("For you · Horror")
    );
}

#[test]
fn a_director_somebody_follows_gets_a_row_named_after_them() {
    let state = test_support::test_state();
    for n in 0..12 {
        let id = format!("v{n}");
        seed(&state, Film { director: "Denis Villeneuve", ..film(&id, &[SCIENCE_FICTION]) });
    }
    seed_many(&state, "c", 12, &[COMEDY]);
    let user = viewer(&state, "aut");
    finish(&state, &user, "v0");
    finish(&state, &user, "v1");

    let sections = build_home(&state, &state.db, "en", &user);

    let by = sections.iter().find(|s| s.id.starts_with("person:")).expect("a person row");
    assert_eq!(by.title, "From Denis Villeneuve");
    assert!(ids_of(by).iter().all(|id| id.starts_with('v')));
}

#[test]
fn a_title_the_library_holds_twice_is_recommended_once() {
    let state = test_support::test_state();
    seed_many(&state, "m", 5, &[COMEDY]);
    seed(&state, Film { tmdb: Some(77), ..film("copy-a", &[COMEDY]) });
    seed(&state, Film { tmdb: Some(77), ..film("copy-b", &[COMEDY]) });
    let user = viewer(&state, "twice");

    let sections = build_home(&state, &state.db, "en", &user);

    let copies = sections
        .iter()
        .filter(|s| s.id != "recent")
        .flat_map(ids_of)
        .filter(|id| id.starts_with("copy-"))
        .count();
    assert_eq!(copies, 1);
}

#[test]
fn a_show_that_gained_episodes_says_what_is_new_in_it() {
    let state = test_support::test_state();
    seed_many(&state, "m", 6, &[COMEDY]);
    test_support::seed_show_episode(&state, "old-show", "old-e1");
    {
        let conn = state.db.get().unwrap();
        conn.execute(
            &format!("UPDATE items SET added_at = '{}' WHERE id = 'old-e1'", stamp(300)),
            [],
        )
        .unwrap();
        for (number, days) in [(2, 3), (3, 2)] {
            conn.execute(
                &format!(
                    "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at) \
                     VALUES ('old-e{number}','episode','E','mkv','lib-shows','old-show',2,{number},'{}')",
                    stamp(days)
                ),
                [],
            )
            .unwrap();
        }
    }
    let user = viewer(&state, "eps");

    let sections = build_home(&state, &state.db, "en", &user);

    let fed = row(&sections, "new-episodes").expect("a new episodes row");
    assert_eq!(fed.layout, Layout::Wide);
    assert_eq!(ids_of(fed), ["old-show"]);
    assert_eq!(fed.notes["old-show"], "2 new episodes");
}

#[test]
fn turning_recently_added_off_takes_both_of_its_rows_away() {
    let state = test_support::test_state();
    seed_many(&state, "m", 10, &[COMEDY]);
    state
        .settings
        .set_internal(&state.db, "showRecentHome", serde_json::json!(false))
        .unwrap();
    let user = viewer(&state, "off");

    let sections = build_home(&state, &state.db, "en", &user);

    assert!(row(&sections, "recent").is_none() && row(&sections, "recent-shows").is_none());
    assert!(row(&sections, "for-you").is_some());
}

fn december() -> Context {
    Context {
        month: 12,
        weekday: Weekday::Wednesday,
        part_of_day: PartOfDay::Afternoon,
        in_progress: Vec::new(),
    }
}

#[test]
fn the_christmas_row_holds_christmas_films_and_no_christmas_horror() {
    let state = test_support::test_state();
    for n in 0..7 {
        let id = format!("xmas{n}");
        seed(&state, Film { overview: "A family saves Christmas with Santa Claus.", ..film(&id, &[FAMILY, COMEDY]) });
    }
    for n in 0..4 {
        let id = format!("slasher{n}");
        seed(&state, Film { overview: "A killer stalks a town on Christmas Eve.", ..film(&id, &[HORROR]) });
    }
    seed_many(&state, "cartoon", 8, &[ANIMATION, FAMILY]);
    state.search.reindex_from_db(&state.db).unwrap();
    let user = viewer(&state, "noel");
    let catalog = state.home.catalog.get(&state, &state.db);
    let reader = Viewer::read(&state, &state.db, &catalog, &user, now_secs());
    let ctx = december();
    let board = Board::new(&state, &state.db, "en", &catalog, &reader, &ctx);

    let themed = board.themes();

    let christmas = themed.iter().find(|d| d.id == "themed:christmas").expect("a christmas row");
    assert_eq!(christmas.ids.len(), 7);
    assert!(christmas.ids.iter().all(|id| id.starts_with("xmas")));
    assert!(themed.iter().all(|d| d.id != "themed:tearjerker"), "a mood needs an embedder");
}

#[test]
fn a_client_that_draws_only_rails_is_served_rails() {
    let state = test_support::test_state();
    seed_many(&state, "m", 14, &[COMEDY]);
    let user = viewer(&state, "old");
    let other = viewer(&state, "other");
    for id in ["m0", "m1", "m2", "m3", "m4", "m5"] {
        test_support::seed_play(&state, &user, id, now_secs());
        test_support::seed_play(&state, &other, id, now_secs());
    }
    let sections = build_home(&state, &state.db, "en", &user);
    assert_eq!(row(&sections, "trending").unwrap().layout, Layout::Ranked);

    let legacy = adapt(&sections, Accepts::parse(None));
    let modern = adapt(&sections, Accepts::parse(Some("hero, spotlight,ranked,wide")));

    assert!(legacy.iter().all(|s| s.layout == Layout::Rail));
    assert!(row(&legacy, "hero").is_none() && row(&legacy, "spotlight").is_none());
    assert_eq!(row(&legacy, "trending").unwrap().items.len(), 6);
    assert_eq!(modern.len(), sections.len());
    assert_eq!(row(&modern, "hero").unwrap().layout, Layout::Hero);
}

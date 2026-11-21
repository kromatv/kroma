use super::*;
use crate::domain::{LibraryScope, MaturityLevel, Permission};
use crate::services::demo::demo_data;
use crate::test_support::test_user;

fn ratings(pairs: &[(&str, &str)]) -> CountryRatings {
    pairs
        .iter()
        .map(|(c, l)| (c.to_string(), l.to_string()))
        .collect()
}

fn metadata(rated: &[(&str, &str)]) -> Metadata {
    let mut meta: Metadata = serde_json::from_value(serde_json::json!({
        "tmdbId": 1,
        "title": null,
        "overview": null,
        "genres": [],
        "tmdbUrl": "",
    }))
    .unwrap();
    meta.ratings = ratings(rated);
    meta
}

fn viewer(level: MaturityLevel, permissions: Vec<Permission>) -> Viewer {
    Viewer {
        user: test_user("kid", permissions),
        ceiling: Ceiling {
            level,
            reader: "FR".into(),
            server: "FR".into(),
        },
    }
}

fn held(level: MaturityLevel) -> Viewer {
    viewer(level, vec![Permission::Playback])
}

fn film(rated: &[(&str, &str)]) -> MediaItem {
    let mut item = demo_data()
        .items
        .into_iter()
        .find(|i| i.show_id.is_none())
        .expect("a demo film");
    item.metadata = Some(metadata(rated));
    item
}

fn episode() -> MediaItem {
    demo_data()
        .items
        .into_iter()
        .find(|i| i.show_id.is_some())
        .expect("a demo episode")
}

fn show_rated(show_id: &str, rated: &[(&str, &str)]) -> ShowRatings {
    ShowRatings::from([(
        show_id.to_string(),
        TitleAccess {
            library: String::new(),
            ratings: ratings(rated),
            certification: None,
        },
    )])
}

#[test]
fn a_profile_at_eighteen_is_held_to_nothing() {
    let open = held(MaturityLevel::Adult);

    assert!(!open.is_held());
    assert!(open.keeps_nothing());
    assert!(open.sees_item(&film(&[]), &ShowRatings::new()));
}

#[test]
fn a_film_above_the_ceiling_is_kept_from_the_profile() {
    let kid = held(MaturityLevel::Ten);

    assert!(kid.is_held());
    assert!(!kid.sees_everything());
    assert!(kid.sees_item(&film(&[("FR", "TP")]), &ShowRatings::new()));
    assert!(!kid.sees_item(&film(&[("FR", "12")]), &ShowRatings::new()));
}

#[test]
fn an_episode_is_held_to_its_shows_rating_and_counts_as_unrated_without_it() {
    let kid = held(MaturityLevel::Ten);
    let ep = episode();
    let show_id = ep.show_id.clone().unwrap();

    assert!(kid.sees_item(&ep, &show_rated(&show_id, &[("FR", "TP")])));
    assert!(!kid.sees_item(&ep, &show_rated(&show_id, &[("FR", "16")])));
    assert!(!kid.sees_item(&ep, &ShowRatings::new()));
}

#[test]
fn an_account_that_runs_the_server_is_never_held_to_a_ceiling() {
    let admin = viewer(MaturityLevel::All, vec![Permission::RequestsManage]);

    assert!(!admin.is_held());
    assert!(viewer(MaturityLevel::All, vec![Permission::UsersManage]).sees_everything());
    assert!(admin.sees_item(&film(&[("FR", "18")]), &ShowRatings::new()));
}

#[test]
fn the_ceiling_and_the_grant_both_have_to_pass() {
    let mut kid = held(MaturityLevel::Ten);
    kid.user.libraries = LibraryScope::Only(vec!["elsewhere".into()]);
    kid.ceiling.level = MaturityLevel::Adult;
    assert!(!kid.keeps_nothing());
    kid.ceiling.level = MaturityLevel::Ten;

    assert!(!kid.sees_item(&film(&[("FR", "TP")]), &ShowRatings::new()));
}

#[test]
fn a_show_and_an_entry_answer_by_their_own_metadata() {
    let kid = held(MaturityLevel::Seven);
    let mut show = demo_data().shows.remove(0);
    show.metadata = Some(metadata(&[("FR", "TP")]));
    let entry = SectionItem::Movie {
        item: Box::new(film(&[("FR", "16")])),
    };

    assert!(kid.sees_show(&show));
    assert!(kid.sees_entry(&SectionItem::Show {
        show: Box::new(show)
    }));
    assert!(!kid.sees_entry(&entry));
}

#[test]
fn the_ids_seen_are_the_titles_that_pass_both_rules() {
    let kid = held(MaturityLevel::Ten);
    let titles = HashMap::from([
        (
            "young".to_string(),
            TitleAccess {
                library: "films".into(),
                ratings: ratings(&[("FR", "TP")]),
                certification: None,
            },
        ),
        (
            "old".to_string(),
            TitleAccess {
                library: "films".into(),
                ratings: ratings(&[("FR", "16")]),
                certification: None,
            },
        ),
    ]);

    assert_eq!(kid.seen_ids(&titles), HashSet::from(["young".to_string()]));
}

#[test]
fn a_reader_of_another_country_is_shown_their_label_and_a_household_reader_keeps_the_stored_one() {
    let mut american = held(MaturityLevel::Adult);
    american.ceiling.reader = "US".into();
    let mut item = film(&[("FR", "12"), ("US", "PG-13")]);
    let household = held(MaturityLevel::Adult);
    let mut untouched = item.metadata.clone();

    american.relabel(item.metadata.as_mut());
    household.relabel(untouched.as_mut());

    assert_eq!(
        item.metadata.and_then(|m| m.certification).as_deref(),
        Some("PG-13")
    );
    assert!(untouched.and_then(|m| m.certification).is_none());
}

#[test]
fn a_viewer_reads_its_row_against_the_households_metadata_country() {
    let state = crate::test_support::test_state();
    let user = test_user("u1", vec![Permission::Playback]);

    let viewer = Viewer::load(&state, user).unwrap();

    assert_eq!(viewer.ceiling.level, MaturityLevel::Adult);
    assert_eq!(viewer.ceiling.reader, viewer.ceiling.server);
}

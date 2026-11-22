use super::*;
use crate::domain::{LibraryScope, MaturityLevel, Permission, TitleRule};
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
    meta.tmdb_genre_ids = vec![16];
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
        rules: HashMap::new(),
    }
}

fn ruling(mut viewer: Viewer, title: &str, rule: TitleRule) -> Viewer {
    viewer.rules.insert(title.to_string(), rule);
    viewer
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

fn film_called(id: &str, rated: &[(&str, &str)]) -> MediaItem {
    MediaItem {
        id: id.into(),
        ..film(rated)
    }
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
            title: show_id.to_string(),
            library: String::new(),
            ratings: ratings(rated),
            certification: None,
            genres: vec![16],
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
                title: "young".into(),
                library: "films".into(),
                ratings: ratings(&[("FR", "TP")]),
                certification: None,
                genres: vec![16],
            },
        ),
        (
            "old".to_string(),
            TitleAccess {
                title: "old".into(),
                library: "films".into(),
                ratings: ratings(&[("FR", "16")]),
                certification: None,
                genres: Vec::new(),
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

#[test]
fn a_blocked_title_is_kept_from_the_profile_even_at_eighteen() {
    let rated_for_all = film(&[("FR", "TP")]);
    let open = ruling(
        held(MaturityLevel::Adult),
        &rated_for_all.id,
        TitleRule::Block,
    );

    assert!(open.is_held());
    assert!(!open.sees_item(&rated_for_all, &ShowRatings::new()));
}

#[test]
fn an_allowed_title_passes_the_ceiling_rated_or_not() {
    let unrated = film_called("home-video", &[]);
    let mature = film_called("mature", &[("FR", "18")]);
    let kid = ruling(held(MaturityLevel::Seven), "home-video", TitleRule::Allow);
    let kid = ruling(kid, "mature", TitleRule::Allow);

    assert!(kid.sees_item(&unrated, &ShowRatings::new()));
    assert!(kid.sees_item(&mature, &ShowRatings::new()));
    assert!(!kid.sees_item(&film_called("other", &[]), &ShowRatings::new()));
}

#[test]
fn a_rule_on_a_show_covers_every_episode_of_it() {
    let ep = episode();
    let show_id = ep.show_id.clone().unwrap();
    let shows = show_rated(&show_id, &[("FR", "TP")]);
    let blocked = ruling(held(MaturityLevel::Adult), &show_id, TitleRule::Block);
    let allowed = ruling(held(MaturityLevel::All), &show_id, TitleRule::Allow);

    assert!(!blocked.sees_item(&ep, &shows));
    assert!(allowed.sees_item(&ep, &show_rated(&show_id, &[("FR", "16")])));
}

#[test]
fn an_allow_alone_at_eighteen_keeps_nothing_from_the_profile() {
    let open = ruling(held(MaturityLevel::Adult), "anything", TitleRule::Allow);

    assert!(!open.is_held());
}

#[test]
fn a_rule_on_an_account_that_runs_the_server_binds_nothing() {
    let admin = viewer(MaturityLevel::Adult, vec![Permission::UsersManage]);
    let movie = film(&[]);
    let admin = ruling(admin, &movie.id, TitleRule::Block);

    assert!(admin.sees_item(&movie, &ShowRatings::new()));
}

#[test]
fn a_profile_with_no_country_of_its_own_reads_the_households_ratings_country() {
    let state = crate::test_support::test_state();
    let swiss =
        std::collections::BTreeMap::from([("ratingsCountry".to_string(), serde_json::json!("CH"))]);
    state.settings.set_patch(&state.db, swiss);

    let viewer = Viewer::load(&state, test_user("u1", vec![Permission::Playback])).unwrap();

    assert_eq!(viewer.ceiling.reader, "CH");
}

#[test]
fn a_kids_profile_in_a_swiss_household_does_not_see_a_film_switzerland_rates_twelve() {
    let meg_2 = film(&[
        ("FR", "TP"),
        ("CH", "12"),
        ("DE", "12"),
        ("GB", "12A"),
        ("US", "PG-13"),
    ]);
    let mut kid = held(MaturityLevel::Ten);
    kid.ceiling.reader = "CH".into();

    assert!(!kid.sees_item(&meg_2, &ShowRatings::new()));
    assert!(held(MaturityLevel::Ten).sees_item(&meg_2, &ShowRatings::new()));
}

const ACTION: u32 = 28;
const ANIMATION: u32 = 16;
const FAMILY: u32 = 10751;
const HORROR: u32 = 27;

fn film_of(genres: &[u32]) -> MediaItem {
    let mut item = film(&[("FR", "TP")]);
    if let Some(meta) = item.metadata.as_mut() {
        meta.tmdb_genre_ids = genres.to_vec();
    }
    item
}

#[test]
fn a_profile_at_a_kids_level_sees_only_titles_made_for_children() {
    let kid = held(MaturityLevel::All);

    assert!(!kid.sees_item(&film_of(&[ACTION]), &ShowRatings::new()));
    assert!(kid.sees_item(&film_of(&[FAMILY]), &ShowRatings::new()));
    assert!(kid.sees_item(&film_of(&[ANIMATION, ACTION]), &ShowRatings::new()));
}

#[test]
fn a_title_with_a_genre_kept_from_children_never_passes_a_kids_level() {
    let kid = held(MaturityLevel::Ten);

    assert!(!kid.sees_item(&film_of(&[ANIMATION, HORROR]), &ShowRatings::new()));
}

#[test]
fn a_title_with_no_genre_kept_is_not_one_made_for_children() {
    assert!(!held(MaturityLevel::Seven).sees_item(&film_of(&[]), &ShowRatings::new()));
}

#[test]
fn levels_from_thirteen_up_weigh_the_rating_alone() {
    assert!(held(MaturityLevel::Thirteen).sees_item(&film_of(&[ACTION]), &ShowRatings::new()));
    assert!(held(MaturityLevel::Sixteen).sees_item(&film_of(&[HORROR]), &ShowRatings::new()));
}

#[test]
fn a_title_allowed_for_the_profile_passes_a_kids_level_whatever_its_genres() {
    let horror = MediaItem {
        id: "allowed".into(),
        ..film_of(&[HORROR])
    };
    let kid = ruling(held(MaturityLevel::All), "allowed", TitleRule::Allow);

    assert!(kid.sees_item(&horror, &ShowRatings::new()));
}

#[test]
fn a_show_and_its_episodes_answer_by_the_shows_genres() {
    let kid = held(MaturityLevel::Ten);
    let mut show = demo_data().shows.remove(0);
    let mut drama = metadata(&[("FR", "TP")]);
    drama.tmdb_genre_ids = vec![18];
    show.metadata = Some(drama);
    let ep = episode();
    let show_id = ep.show_id.clone().unwrap_or_default();
    let mut crime = show_rated(&show_id, &[("FR", "TP")]);
    if let Some(access) = crime.get_mut(&show_id) {
        access.genres = vec![10762, 80];
    }

    assert!(!kid.sees_show(&show));
    assert!(!kid.sees_item(&ep, &crime));
    assert!(kid.sees_item(&ep, &show_rated(&show_id, &[("FR", "TP")])));
}

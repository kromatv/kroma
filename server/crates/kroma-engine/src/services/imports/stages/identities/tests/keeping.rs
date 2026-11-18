use super::*;

fn brought() -> Outcome {
    Outcome::Brought { target: None }
}

#[test]
fn a_film_s_identity_is_kept_under_the_path_the_scan_gives_its_file() {
    let household = household();
    let heat = heat_filed_as_ronin(json!({ "tmdb": "949", "imdb": "tt0113277" }));

    let outcomes = household.offer(&[heat]);

    let file = household.here(&format!("movies/{FILED_AS_RONIN}"));
    assert_eq!(outcomes, vec![brought()]);
    assert_eq!(
        household.kept(),
        vec![format!("{file}|movie|949|tt0113277|")]
    );
}

#[test]
fn an_episode_s_file_is_kept_with_the_identity_of_its_show() {
    let household = household();
    let episode = the_wire_filed_as_the_shield(json!({ "tvdb": "79126" }));

    let outcomes = household.offer(&[episode]);

    let file = household.here(&format!("shows/{FILED_AS_THE_SHIELD}"));
    assert_eq!(outcomes, vec![brought()]);
    assert_eq!(household.kept(), vec![format!("{file}|show|||79126")]);
}

#[test]
fn a_title_kept_already_with_the_same_identity_is_already_here_and_kept_once() {
    let household = household();
    let heat = heat_filed_as_ronin(json!({ "tmdb": "949" }));
    household.offer(std::slice::from_ref(&heat));
    let kept = household.kept();

    let outcomes = household.offer(&[heat]);

    assert_eq!(outcomes, vec![Outcome::AlreadyHere]);
    assert_eq!(household.kept(), kept);
    assert_eq!(kept.len(), 1);
}

#[test]
fn a_title_the_other_server_matched_again_takes_the_newer_identity() {
    let household = household();
    household.offer(&[heat_filed_as_ronin(json!({ "tmdb": "8195" }))]);

    let outcomes = household.offer(&[heat_filed_as_ronin(json!({ "tmdb": "949" }))]);

    let file = household.here(&format!("movies/{FILED_AS_RONIN}"));
    assert_eq!(outcomes, vec![brought()]);
    assert_eq!(household.kept(), vec![format!("{file}|movie|949||")]);
}

#[test]
fn a_title_kept_in_two_versions_has_an_identity_for_each_file() {
    let household = household();
    let heat = title(json!({
        "id": "t1",
        "kind": "movie",
        "paths": ["/data/movies/Heat/Heat.mkv", "/data/movies/Heat/Heat 4K.mkv"],
        "ids": { "tmdb": "949" },
    }));

    let outcomes = household.offer(&[heat]);

    assert_eq!(outcomes, vec![brought()]);
    assert_eq!(
        household.kept(),
        vec![
            format!("{}|movie|949||", household.here("movies/Heat/Heat 4K.mkv")),
            format!("{}|movie|949||", household.here("movies/Heat/Heat.mkv")),
        ]
    );
}

#[test]
fn a_title_with_no_file_no_id_or_no_confirmed_folder_is_left_and_keeps_nothing() {
    let household = household();
    let no_file = title(json!({ "id": "t1", "kind": "movie", "ids": { "tmdb": "949" } }));
    let no_id = heat_filed_as_ronin(json!({}));
    let elsewhere = title(json!({
        "id": "t3",
        "kind": "movie",
        "paths": ["/data/concerts/Stop Making Sense.mkv"],
        "ids": { "tmdb": "24128" },
    }));

    let outcomes = household.offer(&[no_file, no_id, elsewhere]);

    assert_eq!(outcomes, vec![Outcome::Untouched; 3]);
    assert_eq!(household.kept(), Vec::<String>::new());
}

#[test]
fn each_title_of_a_page_is_answered_in_the_order_given() {
    let household = household();
    household.offer(&[heat_filed_as_ronin(json!({ "tmdb": "949" }))]);
    let page = [
        heat_filed_as_ronin(json!({})),
        heat_filed_as_ronin(json!({ "tmdb": "949" })),
        the_wire_filed_as_the_shield(json!({ "tmdb": "1438" })),
    ];

    let outcomes = household.offer(&page);

    assert_eq!(
        outcomes,
        vec![Outcome::Untouched, Outcome::AlreadyHere, brought()]
    );
}

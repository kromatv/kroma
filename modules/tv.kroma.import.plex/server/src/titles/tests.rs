use serde_json::json;

use super::*;

use crate::test_support::{get, Household, LOCAL, MACHINE};

fn ask(sign_in: &str, library: &str) -> TitlesAsk {
    TitlesAsk {
        sign_in: sign_in.to_string(),
        server: MACHINE.to_string(),
        library: library.to_string(),
        cursor: None,
        limit: Some(500),
    }
}

fn ids(page: &TitlePage) -> Vec<&str> {
    page.titles.iter().map(|title| title.id.as_str()).collect()
}

#[test]
fn a_page_of_films_is_this_json() {
    let (home, sign_in) = Household::signed_in();

    let page = home.plex.titles(&ask(&sign_in, "1")).unwrap();

    assert_eq!(
        serde_json::to_value(&page).unwrap(),
        json!({
            "titles": [
                { "id": "101", "kind": "movie", "paths": ["/data/movies/Heat (1995)/Heat.mkv"],
                  "title": "Heat", "year": 1995, "ids": { "tmdb": "949", "imdb": "tt0113277" } },
                { "id": "102", "kind": "movie",
                  "paths": ["/data/movies/Alien (1979)/Alien.mkv", "/data/films-4k/Alien (1979)/Alien.2160p.mkv"],
                  "title": "Alien", "year": 1979, "ids": { "tmdb": "348", "imdb": "tt0078748", "tvdb": "166" } },
                { "id": "103", "kind": "movie", "paths": ["/data/movies/Dune (2021)/Dune.mkv"],
                  "title": "Dune", "year": 2021 },
            ],
        })
    );
}

#[test]
fn a_page_of_episodes_is_this_json() {
    let (home, sign_in) = Household::signed_in();

    let page = home.plex.titles(&ask(&sign_in, "2")).unwrap();

    let the_wire = json!({
        "title": "The Wire", "year": 2002,
        "ids": { "tmdb": "1438", "imdb": "tt0306414", "tvdb": "79126" },
    });
    assert_eq!(
        serde_json::to_value(&page).unwrap(),
        json!({
            "titles": [
                { "id": "211", "kind": "episode",
                  "paths": ["/data/shows/The Wire/Season 01/The Wire - S01E01.mkv"],
                  "title": "The Target", "year": 2002, "ids": { "tvdb": "127394" },
                  "series": the_wire, "season": 1, "episode": 1 },
                { "id": "212", "kind": "episode",
                  "paths": ["/data/shows/The Wire/Season 01/The Wire - S01E03.mkv"],
                  "title": "The Buys", "ids": { "imdb": "tt0749423", "tvdb": "127396" },
                  "series": the_wire, "season": 1, "episode": 3 },
            ],
        })
    );
}

#[test]
fn the_shows_of_a_page_of_episodes_are_asked_for_once() {
    let (home, sign_in) = Household::signed_in();

    home.plex.titles(&ask(&sign_in, "2")).unwrap();

    let asked = home.web.asked(&format!("{LOCAL}/library/metadata/200"));
    assert_eq!(asked.len(), 1);
    assert_eq!(asked[0].value("includeGuids"), Some("1"));
}

#[test]
fn an_episode_whose_show_the_server_does_not_give_keeps_the_shows_name() {
    let (home, sign_in) = Household::signed_in();
    home.web.answers(
        get(&format!("{LOCAL}/library/metadata/200")).with("X-Plex-Token", &home.owner_token),
        200,
        r#"<MediaContainer size="0"/>"#,
    );

    let page = home.plex.titles(&ask(&sign_in, "2")).unwrap();

    let series = page.titles[0].series.as_ref().unwrap();
    assert_eq!(series.title.as_deref(), Some("The Wire"));
    assert_eq!(series.year, None);
    assert!(series.ids.is_empty());
}

#[test]
fn a_library_of_a_kind_kroma_does_not_play_has_no_title() {
    let (home, sign_in) = Household::signed_in();

    let page = home.plex.titles(&ask(&sign_in, "3")).unwrap();

    assert_eq!(page, TitlePage::default());
}

#[test]
fn a_library_the_server_does_not_have_is_an_error() {
    let (home, sign_in) = Household::signed_in();

    let page = home.plex.titles(&ask(&sign_in, "9"));

    assert!(page.is_err());
}

#[test]
fn a_library_id_that_is_not_one_of_plex_is_refused_before_any_call() {
    let (home, sign_in) = Household::signed_in();

    let page = home.plex.titles(&ask(&sign_in, "1/../../identity"));

    assert!(page.is_err());
    assert!(home.web.seen().is_empty());
}

#[test]
fn a_page_holds_what_was_asked_for_and_leads_to_the_next_one() {
    let (home, sign_in) = Household::signed_in();
    let films = get(&format!("{LOCAL}/library/sections/1/all"))
        .with("X-Plex-Token", &home.owner_token)
        .with("X-Plex-Container-Size", "2");
    home.web.answers(
        films.with("X-Plex-Container-Start", "0"),
        200,
        r#"<MediaContainer size="2" totalSize="3"><Video ratingKey="101" type="movie"/><Video ratingKey="102" type="movie"/></MediaContainer>"#,
    );
    let first_ask = TitlesAsk {
        limit: Some(2),
        ..ask(&sign_in, "1")
    };

    let first = home.plex.titles(&first_ask).unwrap();

    assert_eq!(ids(&first), ["101", "102"]);
    assert_eq!(first.next.as_deref(), Some("2"));
}

#[test]
fn the_cursor_of_a_page_asks_the_server_for_what_follows_it() {
    let (home, sign_in) = Household::signed_in();
    home.web.answers(
        get(&format!("{LOCAL}/library/sections/1/all"))
            .with("X-Plex-Token", &home.owner_token)
            .with("X-Plex-Container-Start", "2")
            .with("X-Plex-Container-Size", "2"),
        200,
        r#"<MediaContainer size="1" totalSize="3"><Video ratingKey="103" type="movie"/></MediaContainer>"#,
    );
    let second_ask = TitlesAsk {
        cursor: Some("2".to_string()),
        limit: Some(2),
        ..ask(&sign_in, "1")
    };

    let second = home.plex.titles(&second_ask).unwrap();

    assert_eq!(ids(&second), ["103"]);
    assert_eq!(second.next, None);
}

#[test]
fn what_is_neither_a_film_nor_an_episode_is_left_out_and_still_counted_for_the_cursor() {
    let (home, sign_in) = Household::signed_in();
    home.web.answers(
        get(&format!("{LOCAL}/library/sections/1/all"))
            .with("X-Plex-Token", &home.owner_token)
            .with("type", "1"),
        200,
        r#"<MediaContainer size="3" totalSize="9">
             <Video ratingKey="101" type="movie"/>
             <Video ratingKey="104" type="clip"/>
             <Video type="movie" title="A film with no key"/>
           </MediaContainer>"#,
    );

    let page = home.plex.titles(&ask(&sign_in, "1")).unwrap();

    assert_eq!(ids(&page), ["101"]);
    assert_eq!(page.next.as_deref(), Some("3"));
}

#[test]
fn an_id_plex_writes_in_a_form_the_importer_does_not_know_is_not_passed_on() {
    let (home, sign_in) = Household::signed_in();
    home.web.answers(
        get(&format!("{LOCAL}/library/sections/1/all"))
            .with("X-Plex-Token", &home.owner_token)
            .with("type", "1"),
        200,
        r#"<MediaContainer size="1" totalSize="1">
             <Video ratingKey="101" type="movie" guid="com.plexapp.agents.imdb://tt0113277?lang=en">
               <Guid id="plex://movie/example"/><Guid id="mbid://x"/><Guid id="tmdb://"/><Guid id="imdb://tt 01"/>
             </Video>
           </MediaContainer>"#,
    );

    let page = home.plex.titles(&ask(&sign_in, "1")).unwrap();

    assert!(page.titles[0].ids.is_empty());
}

use super::*;

use crate::shape::check_shape;

fn season_pack(season: u32) -> ParsedRelease {
    ParsedRelease {
        full_season: true,
        season: Some(season),
        ..ParsedRelease::default()
    }
}

#[test]
fn a_movie_search_refuses_a_season_pack() {
    let parsed = season_pack(1);

    let reject = check_shape(&parsed, &movie()).unwrap_err();

    assert_eq!(reject.rule, "wrong-shape");
    assert_eq!(reject.params["found"], "season");
}

#[test]
fn a_movie_search_refuses_an_episode() {
    let parsed = p("Show.S01E02.1080p.WEB-DL.x264");

    let reject = check_shape(&parsed, &movie()).unwrap_err();

    assert_eq!(reject.params["found"], "episode");
}

#[test]
fn a_movie_from_the_wrong_year_is_refused() {
    let parsed = p("Movie.1990.1080p.WEB-DL.x264");

    let reject = check_shape(&parsed, &movie()).unwrap_err();

    assert_eq!(reject.rule, "wrong-year");
    assert_eq!(reject.params["wantedYear"], 2020);
}

#[test]
fn a_movie_a_year_off_is_accepted() {
    let parsed = p("Movie.2021.1080p.WEB-DL.x264");

    assert!(check_shape(&parsed, &movie()).is_ok());
}

#[test]
fn an_episode_search_refuses_a_season_pack() {
    let target = Target::Episode {
        season: 1,
        episode: 2,
    };

    let reject = check_shape(&season_pack(1), &target).unwrap_err();

    assert_eq!(reject.rule, "wrong-shape");
}

#[test]
fn an_episode_search_refuses_a_name_with_no_marker() {
    let target = Target::Episode {
        season: 1,
        episode: 2,
    };

    let reject = check_shape(&p("Show.1080p.WEB-DL.x264"), &target).unwrap_err();

    assert_eq!(reject.params["found"], "none");
}

#[test]
fn an_episode_search_refuses_another_episode() {
    let target = Target::Episode {
        season: 1,
        episode: 2,
    };

    let reject = check_shape(&p("Show.S01E05.1080p.WEB-DL.x264"), &target).unwrap_err();

    assert_eq!(reject.rule, "wrong-episode");
    assert_eq!(reject.params["wantedEpisode"], 2);
}

#[test]
fn an_episode_search_accepts_a_span_that_holds_the_episode() {
    let target = Target::Episode {
        season: 1,
        episode: 2,
    };
    let parsed = ParsedRelease {
        season: Some(1),
        episode: Some(1),
        episode_end: Some(3),
        ..ParsedRelease::default()
    };

    assert!(check_shape(&parsed, &target).is_ok());
}

#[test]
fn a_season_search_refuses_a_single_episode() {
    let target = Target::Season {
        season: 1,
        episodes: 8,
    };

    let reject = check_shape(&p("Show.S01E02.1080p.WEB-DL.x264"), &target).unwrap_err();

    assert_eq!(reject.rule, "wrong-shape");
    assert_eq!(reject.params["found"], "episode");
}

#[test]
fn a_season_search_refuses_a_name_with_no_marker() {
    let target = Target::Season {
        season: 1,
        episodes: 8,
    };

    let reject = check_shape(&p("Show.1080p.WEB-DL.x264"), &target).unwrap_err();

    assert_eq!(reject.params["found"], "none");
}

#[test]
fn a_season_search_refuses_another_season_pack() {
    let target = Target::Season {
        season: 1,
        episodes: 8,
    };

    let reject = check_shape(&season_pack(2), &target).unwrap_err();

    assert_eq!(reject.rule, "wrong-season");
    assert_eq!(reject.params["wantedSeason"], 1);
}

#[test]
fn a_season_search_accepts_its_own_pack() {
    let target = Target::Season {
        season: 1,
        episodes: 8,
    };

    assert!(check_shape(&season_pack(1), &target).is_ok());
}

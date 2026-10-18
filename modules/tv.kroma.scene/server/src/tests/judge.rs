use super::*;

fn rule(result: Result<Judged, Reject>) -> String {
    result.unwrap_err().rule
}

#[test]
fn a_forbidden_term_refuses_the_release() {
    let f = fixture();

    let result = f.judge("Movie.2020.1080p.HDCAM.x264", 2, 50, movie());

    assert_eq!(rule(result), "forbidden-keyword");
}

#[test]
fn too_few_seeders_refuse_the_release() {
    let f = fixture();

    let result = f.judge("Movie.2020.1080p.WEB-DL.x265", 2, 1, movie());

    assert_eq!(rule(result), "seeders");
}

#[test]
fn a_film_over_its_size_limit_is_refused() {
    let f = fixture();

    let result = f.judge("Movie.2020.1080p.BluRay.x265", 40, 50, movie());

    assert_eq!(rule(result), "too-big");
}

#[test]
fn a_film_under_its_minimum_size_is_refused() {
    let mut f = fixture();
    for limit in &mut f.sizes.movie {
        limit.min = 20.0;
    }

    let result = f.judge("Movie.2020.1080p.BluRay.x265", 1, 50, movie());

    assert_eq!(rule(result), "too-small");
}

#[test]
fn a_known_runtime_scales_the_size_limit() {
    let f = fixture();
    let name = "Movie.2020.1080p.BluRay.x265";
    let parsed = p(name);
    let candidate = cand(20, 50);
    let facts = Facts::from_release(name, &parsed, candidate.size_bytes);
    let query = Query {
        target: movie(),
        runtime_minutes: Some(200),
        original: None,
    };

    let result = judge(&parsed, &facts, &candidate, &query, &f.rules());

    assert!(result.is_ok());
}

#[test]
fn a_release_a_year_off_by_more_than_one_is_another_film() {
    let f = fixture();

    let result = f.judge("Movie.2011.1080p.BluRay.x265", 8, 50, movie());

    assert_eq!(rule(result), "wrong-year");
}

#[test]
fn an_episode_is_refused_for_a_film() {
    let f = fixture();

    let result = f.judge("Movie.S01E01.1080p.WEB.x265", 2, 50, movie());

    assert_eq!(rule(result), "wrong-shape");
}

#[test]
fn xvid_scores_below_the_minimum_format_score() {
    let f = fixture();

    let result = f.judge("Movie.2020.720p.BluRay.XviD", 1, 50, movie());

    assert_eq!(rule(result), "format-score");
}

#[test]
fn a_cam_is_refused_as_a_quality_the_default_profile_does_not_allow() {
    let mut f = fixture();
    f.profile.must_not_contain.clear();

    let result = f.judge("Movie.2020.1080p.TELESYNC.x264", 2, 50, movie());

    assert_eq!(rule(result), "quality");
}

#[test]
fn a_release_with_no_resolution_is_an_sd_quality_the_default_refuses() {
    let f = fixture();

    let result = f.judge("Movie.2020.WEB-DL.x265", 2, 50, movie());

    assert_eq!(rule(result), "quality");
}

#[test]
fn a_2160p_release_is_refused_by_a_1080p_profile() {
    let f = fixture();

    let result = f.judge("Movie.2020.2160p.WEB-DL.x265", 10, 50, movie());

    assert_eq!(rule(result), "quality");
}

#[test]
fn an_episode_span_answers_for_each_episode_in_it() {
    let f = fixture();
    let target = Target::Episode {
        season: 1,
        episode: 2,
    };

    let result = f.judge("Show.S01E01-E03.1080p.WEB.x265", 2, 10, target);

    assert!(result.is_ok());
}

#[test]
fn a_neighbouring_episode_is_refused() {
    let f = fixture();
    let target = Target::Episode {
        season: 1,
        episode: 2,
    };

    let result = f.judge("Show.S01E05.1080p.WEB.x265", 2, 10, target);

    assert_eq!(rule(result), "wrong-episode");
}

#[test]
fn a_pack_is_refused_for_one_episode() {
    let f = fixture();
    let target = Target::Episode {
        season: 1,
        episode: 2,
    };

    let result = f.judge("Show.S01.COMPLETE.1080p.WEB.x265", 2, 10, target);

    assert_eq!(rule(result), "wrong-shape");
}

#[test]
fn an_episode_target_needs_an_episode_marker() {
    let f = fixture();
    let target = Target::Episode {
        season: 1,
        episode: 2,
    };

    let err = f.judge("Show.1080p.WEB.x265", 2, 10, target).unwrap_err();

    assert_eq!(err.rule, "wrong-shape");
    assert!(err.note.contains("SxxEyy"), "{}", err.note);
}

#[test]
fn a_season_pack_size_limit_covers_every_episode() {
    let f = fixture();
    let target = Target::Season {
        season: 1,
        episodes: 10,
    };

    let judged = f
        .judge("Show.S01.COMPLETE.1080p.WEB-DL.x265-GRP", 22, 30, target)
        .unwrap();

    assert_eq!(judged.episode_count, 10);
    assert!(judged.breakdown.iter().any(|l| l.rule == "season-pack"));
}

#[test]
fn a_pack_of_another_season_is_refused() {
    let f = fixture();
    let target = Target::Season {
        season: 1,
        episodes: 10,
    };

    let result = f.judge("Show.S02.COMPLETE.1080p.WEB.x265", 5, 10, target);

    assert_eq!(rule(result), "wrong-season");
}

#[test]
fn a_required_term_must_be_in_the_name() {
    let mut f = fixture();
    f.profile.must_contain = vec!["VOSTFR".into()];

    let missing = f.judge("Movie.2020.1080p.WEB.x265", 2, 10, movie());
    let present = f.judge("Movie.2020.VOSTFR.1080p.WEB.x265", 2, 10, movie());

    assert_eq!(rule(missing), "missing-required-keyword");
    assert!(present.is_ok());
}

#[test]
fn one_required_term_out_of_several_is_enough() {
    let mut f = fixture();
    f.profile.must_contain = vec!["VOSTFR".into(), "MULTi".into()];

    let one = f.judge("Movie.2020.MULTi.1080p.WEB.x265", 2, 10, movie());
    let neither = f.judge("Movie.2020.1080p.WEB.x265", 2, 10, movie());

    assert!(one.is_ok());
    assert_eq!(rule(neither), "missing-required-keyword");
}

#[test]
fn a_term_is_found_wherever_it_sits_in_the_name() {
    let mut f = fixture();
    f.profile.must_not_contain = vec!["WEB-DL".into()];

    let result = f.judge("Movie.2020.1080p.WEB-DL.x265", 2, 10, movie());

    assert_eq!(rule(result), "forbidden-keyword");
}

#[test]
fn a_term_between_slashes_is_a_regular_expression() {
    let mut f = fixture();
    f.profile.must_contain = vec!["/x26[45]$/".into()];

    let present = f.judge("Movie.2020.1080p.WEB-DL.x265", 2, 10, movie());
    let missing = f.judge("Movie.2020.1080p.WEB-DL.AV1", 2, 10, movie());

    assert!(present.is_ok());
    assert_eq!(rule(missing), "missing-required-keyword");
}

#[test]
fn a_term_that_cannot_be_read_is_skipped_rather_than_refusing_everything() {
    let mut f = fixture();
    f.profile.must_contain = vec!["/(/".into(), "  ".into()];
    f.profile.must_not_contain = vec!["/(/".into()];

    let result = f.judge("Movie.2020.1080p.WEB-DL.x265", 2, 10, movie());

    assert!(result.is_ok());
}

#[test]
fn a_release_with_no_reported_size_is_still_judged() {
    let f = fixture();
    let sizeless = Candidate {
        size_bytes: None,
        seeders: Some(10),
        indexer_priority: 0,
    };

    let judged = f
        .judge_with("Movie.2020.1080p.BluRay.x265", sizeless, movie())
        .unwrap();

    assert_eq!(judged.size_bytes, None);
    assert!(judged.preferred_bytes.is_some());
}

#[test]
fn the_breakdown_names_the_quality_and_each_matched_format() {
    let f = fixture();

    let judged = f
        .judge("Movie.2020.1080p.BluRay.HDR10.x265-GRP", 8, 40, movie())
        .unwrap();

    let notes: Vec<(&str, &str, i32)> = judged
        .breakdown
        .iter()
        .map(|l| (l.rule.as_str(), l.note.as_str(), l.delta))
        .collect();
    assert_eq!(notes[0].0, "quality");
    assert_eq!(notes[0].1, "bluray-1080p");
    assert!(notes.contains(&("format", "HEVC", 400)));
    assert!(notes.contains(&("format", "HDR10", 100)));
    assert_eq!(judged.score(), 500);
}

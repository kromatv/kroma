use super::*;

const DEFAULT_FORBIDDEN_WORDS: [&str; 8] = [
    "cam",
    "hdcam",
    "ts",
    "telesync",
    "telecine",
    "screener",
    "dvdscr",
    "workprint",
];

fn owned(terms: &[&str]) -> Vec<String> {
    terms.iter().map(|term| term.to_string()).collect()
}

fn with_the_default_forbidden_words() -> Fixture {
    fixture_with(LegacySettings {
        forbidden_keywords: owned(&DEFAULT_FORBIDDEN_WORDS),
        ..legacy()
    })
}

fn forbidding(terms: &[&str]) -> Fixture {
    let mut f = fixture();
    f.profile.must_not_contain = owned(terms);
    f
}

fn requiring(terms: &[&str]) -> Fixture {
    let mut f = fixture();
    f.profile.must_contain = owned(terms);
    f
}

#[test]
fn a_forbidden_ts_lets_a_release_with_dts_audio_through() {
    let f = with_the_default_forbidden_words();
    let target = Target::Episode {
        season: 2,
        episode: 2,
    };

    let result = f.judge(
        "Dexter.Resurrection.S02E02.MULTi.1080p.WEB-DL.DTS-HD.MA.5.1.H264-GRP",
        2,
        50,
        target,
    );

    assert!(result.is_ok(), "{result:?}");
}

#[test]
fn a_forbidden_ts_lets_a_film_with_those_letters_in_its_title_through() {
    let f = with_the_default_forbidden_words();
    let target = Target::Movie { year: Some(2003) };

    let result = f.judge(
        "Jeux.d.Enfants.2003.FRENCH.1080p.BluRay.x264-GRP",
        8,
        50,
        target,
    );

    assert!(result.is_ok(), "{result:?}");
}

#[test]
fn a_forbidden_cam_lets_a_title_that_starts_with_those_letters_through() {
    let f = with_the_default_forbidden_words();
    let target = Target::Movie { year: Some(2012) };

    let result = f.judge(
        "Camille.Redouble.2012.FRENCH.1080p.BluRay.x264-GRP",
        8,
        50,
        target,
    );

    assert!(result.is_ok(), "{result:?}");
}

#[test]
fn a_forbidden_ts_refuses_a_telesync_that_says_ts() {
    let f = with_the_default_forbidden_words();

    let refusal = f
        .judge("Movie.2020.TS.x264-GRP", 2, 50, movie())
        .unwrap_err();

    assert_eq!(refusal.rule, "forbidden-keyword");
    assert_eq!(refusal.params["term"], "ts");
}

#[test]
fn a_forbidden_ts_refuses_a_telesync_that_says_hd_ts() {
    let f = with_the_default_forbidden_words();

    let refusal = f
        .judge("Movie.2020.HD-TS.x264-GRP", 2, 50, movie())
        .unwrap_err();

    assert_eq!(refusal.rule, "forbidden-keyword");
    assert_eq!(refusal.params["term"], "ts");
}

#[test]
fn an_hdts_release_is_refused_as_a_cam_when_no_forbidden_word_matches_it() {
    let f = with_the_default_forbidden_words();

    let refusal = f
        .judge("Movie.2020.1080p.HDTS.x264-GRP", 2, 50, movie())
        .unwrap_err();

    assert_eq!(refusal.rule, "quality");
    assert_eq!(refusal.params["quality"], "cam");
}

#[test]
fn a_cam_tag_glued_to_another_word_is_refused_as_a_cam() {
    let f = with_the_default_forbidden_words();
    let tags = [
        "HQCAM",
        "HDCAMRip",
        "TSRip",
        "HDTS-Rip",
        "HDTELESYNC",
        "DVDSCREENER",
    ];

    let refusals: Vec<String> = tags
        .iter()
        .map(|tag| format!("Movie.2020.1080p.{tag}.x264-GRP"))
        .map(|name| rule(f.judge(&name, 2, 50, movie())))
        .collect();

    assert_eq!(refusals, ["quality"; 6]);
}

#[test]
fn a_term_of_several_words_matches_them_whatever_separates_them() {
    let f = forbidding(&["web dl"]);

    let dashed = f.judge("Movie.2020.1080p.WEB-DL.x265", 2, 10, movie());
    let dotted = f.judge("Movie.2020.1080p.WEB.DL.x265", 2, 10, movie());

    assert_eq!(rule(dashed), "forbidden-keyword");
    assert_eq!(rule(dotted), "forbidden-keyword");
}

#[test]
fn a_term_written_with_a_dash_matches_the_same_words() {
    let f = forbidding(&["WEB-DL"]);

    let result = f.judge("Movie.2020.1080p.WEB.DL.x265", 2, 10, movie());

    assert_eq!(rule(result), "forbidden-keyword");
}

#[test]
fn a_term_of_several_words_needs_them_side_by_side() {
    let f = requiring(&["final cut"]);
    let target = Target::Movie { year: Some(2001) };

    let side_by_side = f.judge("Movie.2001.Final.Cut.1080p.BluRay.x265", 8, 10, target);
    let apart = f.judge(
        "Final.Fantasy.2001.Directors.Cut.1080p.BluRay.x265",
        8,
        10,
        target,
    );

    assert!(side_by_side.is_ok(), "{side_by_side:?}");
    assert_eq!(rule(apart), "missing-required-keyword");
}

#[test]
fn a_required_term_must_be_in_the_name() {
    let f = requiring(&["VOSTFR"]);

    let missing = f.judge("Movie.2020.1080p.WEB.x265", 2, 10, movie());
    let present = f.judge("Movie.2020.VOSTFR.1080p.WEB.x265", 2, 10, movie());

    assert_eq!(rule(missing), "missing-required-keyword");
    assert!(present.is_ok());
}

#[test]
fn a_required_term_must_be_a_whole_word_of_the_name() {
    let f = requiring(&["VF"]);

    let whole = f.judge("Movie.2020.VF.1080p.WEB.x265", 2, 10, movie());
    let inside = f.judge("Movie.2020.VFQ.1080p.WEB.x265", 2, 10, movie());

    assert!(whole.is_ok(), "{whole:?}");
    assert_eq!(rule(inside), "missing-required-keyword");
}

#[test]
fn one_required_term_out_of_several_is_enough() {
    let f = requiring(&["VOSTFR", "MULTi"]);

    let one = f.judge("Movie.2020.MULTi.1080p.WEB.x265", 2, 10, movie());
    let neither = f.judge("Movie.2020.1080p.WEB.x265", 2, 10, movie());

    assert!(one.is_ok());
    assert_eq!(rule(neither), "missing-required-keyword");
}

#[test]
fn a_term_between_slashes_is_a_regular_expression() {
    let f = requiring(&["/x26[45]$/"]);

    let present = f.judge("Movie.2020.1080p.WEB-DL.x265", 2, 10, movie());
    let missing = f.judge("Movie.2020.1080p.WEB-DL.AV1", 2, 10, movie());

    assert!(present.is_ok());
    assert_eq!(rule(missing), "missing-required-keyword");
}

#[test]
fn a_regular_expression_is_still_searched_inside_words() {
    let f = forbidding(&["/ts/"]);

    let result = f.judge("Movie.2020.1080p.WEB-DL.DTS.x265", 2, 10, movie());

    assert_eq!(rule(result), "forbidden-keyword");
}

#[test]
fn a_term_that_cannot_be_read_is_skipped_rather_than_refusing_everything() {
    let mut f = requiring(&["/(/", "  ", "-"]);
    f.profile.must_not_contain = owned(&["/(/", "..."]);

    let result = f.judge("Movie.2020.1080p.WEB-DL.x265", 2, 10, movie());

    assert!(result.is_ok());
}

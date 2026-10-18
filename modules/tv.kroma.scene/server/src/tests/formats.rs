use super::*;

#[test]
fn a_multi_vff_release_matches_vo_vff_and_multi() {
    let set = defaults();

    let matched = names(
        &set,
        "Show.S01E01.MULTi.VFF.1080p.WEB.x265-GRP",
        Some(&english()),
    );

    assert!(matched.contains(&"vo-vff".to_string()));
    assert!(matched.contains(&"vff".to_string()));
    assert!(matched.contains(&"multi".to_string()));
    assert!(!matched.contains(&"vfq".to_string()));
}

#[test]
fn a_truefrench_release_is_vff_without_the_original() {
    let set = defaults();

    let matched = names(
        &set,
        "Movie.2020.TRUEFRENCH.1080p.BluRay.x264",
        Some(&english()),
    );

    assert!(matched.contains(&"vff".to_string()));
    assert!(matched.contains(&"french".to_string()));
    assert!(!matched.contains(&"vo".to_string()));
    assert!(!matched.contains(&"vo-vff".to_string()));
}

#[test]
fn a_bare_multi_release_is_french_without_being_a_named_dub() {
    let set = defaults();

    let matched = names(&set, "Movie.2020.MULTi.1080p.BluRay.x264", Some(&english()));

    assert!(matched.contains(&"vo".to_string()));
    assert!(matched.contains(&"french".to_string()));
    assert!(!matched.contains(&"vff".to_string()));
    assert!(!matched.contains(&"vfq".to_string()));
}

#[test]
fn a_vfq_release_is_not_vff() {
    let set = defaults();

    let matched = names(
        &set,
        "Movie.2020.MULTi.VFQ.1080p.WEB.x264",
        Some(&english()),
    );

    assert!(matched.contains(&"vfq".to_string()));
    assert!(!matched.contains(&"vff".to_string()));
}

#[test]
fn a_vf2_release_carries_both_french_dubs() {
    let set = defaults();

    let matched = names(
        &set,
        "Movie.2020.MULTi.VF2.1080p.WEB.x264",
        Some(&english()),
    );

    assert!(matched.contains(&"vf2".to_string()));
    assert!(matched.contains(&"vff".to_string()));
    assert!(matched.contains(&"vfq".to_string()));
}

#[test]
fn a_vostfr_release_is_the_original_with_french_subtitles() {
    let set = defaults();

    let matched = names(&set, "Show.S01E01.VOSTFR.1080p.WEB.x264", Some(&english()));

    assert!(matched.contains(&"vostfr".to_string()));
    assert!(matched.contains(&"vo".to_string()));
    assert!(!matched.contains(&"french".to_string()));
}

#[test]
fn a_french_film_with_no_language_tag_is_french() {
    let set = defaults();
    let french = Language::new("fr", Some("FR"));

    let matched = names(&set, "Movie.2020.1080p.WEB.x264", Some(&french));

    assert!(matched.contains(&"vff".to_string()));
    assert!(matched.contains(&"vo".to_string()));
}

#[test]
fn an_english_release_of_an_english_title_is_the_original() {
    let set = defaults();

    let matched = names(&set, "Movie.2020.ENGLISH.1080p.WEB.x264", Some(&english()));

    assert!(matched.contains(&"vo".to_string()));
}

#[test]
fn every_required_condition_must_hold() {
    let set = FormatSet::compile(&[CustomFormat {
        id: "x".into(),
        name: "X".into(),
        conditions: vec![
            Condition {
                required: true,
                ..spec(Spec::VideoCodec { value: Codec::Hevc })
            },
            Condition {
                required: true,
                ..spec(Spec::Resolution { value: Res::R2160 })
            },
        ],
    }])
    .unwrap();

    let hd = names(&set, "Movie.2020.1080p.WEB.x265", None);
    let uhd = names(&set, "Movie.2020.2160p.WEB.x265", None);

    assert!(hd.is_empty());
    assert_eq!(uhd, ["x"]);
}

#[test]
fn one_optional_condition_of_each_kind_is_enough() {
    let set = FormatSet::compile(&[CustomFormat {
        id: "x".into(),
        name: "X".into(),
        conditions: vec![
            spec(Spec::VideoCodec { value: Codec::Hevc }),
            spec(Spec::VideoCodec { value: Codec::Av1 }),
            spec(Spec::Source {
                value: Source::WebDl,
            }),
        ],
    }])
    .unwrap();

    let av1_web = names(&set, "Movie.2020.1080p.WEB-DL.AV1", None);
    let av1_bluray = names(&set, "Movie.2020.1080p.BluRay.AV1", None);

    assert_eq!(av1_web, ["x"]);
    assert!(av1_bluray.is_empty());
}

#[test]
fn a_negated_condition_holds_when_its_test_fails() {
    let set = FormatSet::compile(&[CustomFormat {
        id: "x".into(),
        name: "X".into(),
        conditions: vec![Condition {
            negate: true,
            ..spec(Spec::VideoCodec { value: Codec::H264 })
        }],
    }])
    .unwrap();

    assert_eq!(names(&set, "Movie.2020.1080p.WEB.x265", None), ["x"]);
    assert!(names(&set, "Movie.2020.1080p.WEB.x264", None).is_empty());
}

#[test]
fn an_invalid_pattern_refuses_the_format_by_name() {
    let formats = [CustomFormat {
        id: "x".into(),
        name: "Broken".into(),
        conditions: vec![spec(Spec::ReleaseTitle {
            pattern: "(".into(),
        })],
    }];

    let err = FormatSet::compile(&formats).unwrap_err();

    assert_eq!(err.format, "Broken");
}

#[test]
fn a_format_with_no_condition_is_refused() {
    let formats = [CustomFormat {
        id: "x".into(),
        name: "Empty".into(),
        conditions: vec![],
    }];

    assert!(FormatSet::compile(&formats).is_err());
}

#[test]
fn a_lenient_set_skips_the_broken_format_and_keeps_the_rest() {
    let mut formats = default_formats();
    formats.push(CustomFormat {
        id: "broken".into(),
        name: "Broken".into(),
        conditions: vec![spec(Spec::Language {
            value: "not a tag".into(),
        })],
    });

    let set = FormatSet::compile_lenient(&formats);

    assert_eq!(
        names(&set, "Movie.2020.1080p.WEB.x265", None),
        ["hevc", "vo"]
    );
}

#[test]
fn a_format_round_trips_through_its_json() {
    let formats = default_formats();

    let json = serde_json::to_string(&formats).unwrap();
    let back: Vec<CustomFormat> = serde_json::from_str(&json).unwrap();

    assert_eq!(back, formats);
    assert!(json.contains(r#""type":"language","value":"fr-FR""#));
}

use super::*;

#[test]
fn a_title_pattern_ignores_case() {
    let set = single(Spec::ReleaseTitle {
        pattern: r"\bamzn\b".into(),
    });

    assert_eq!(names(&set, "Show.S01E01.1080p.AMZN.WEB-DL", None), ["x"]);
}

#[test]
fn a_group_pattern_reads_the_group_alone() {
    let set = single(Spec::ReleaseGroup {
        pattern: "^ntb$".into(),
    });

    assert_eq!(names(&set, "Show.S01E01.1080p.WEB-DL-NTb", None), ["x"]);
    assert!(names(&set, "NTb.Show.S01E01.1080p.WEB-DL-GRP", None).is_empty());
}

#[test]
fn an_edition_pattern_reads_the_cut() {
    let set = single(Spec::Edition {
        pattern: "director".into(),
    });

    assert_eq!(
        names(&set, "Movie.2020.Directors.Cut.1080p.BluRay", None),
        ["x"]
    );
}

#[test]
fn a_size_range_bounds_the_release() {
    let set = single(Spec::Size {
        min_gb: Some(3.0),
        max_gb: Some(5.0),
    });

    assert_eq!(names(&set, "Movie.2020.1080p.WEB", None), ["x"]);
}

#[test]
fn an_inverted_size_range_is_refused() {
    let formats = [CustomFormat {
        id: "x".into(),
        name: "Size".into(),
        conditions: vec![spec(Spec::Size {
            min_gb: Some(5.0),
            max_gb: Some(1.0),
        })],
    }];

    assert!(FormatSet::compile(&formats).is_err());
}

#[test]
fn an_audio_condition_reads_codec_and_channels() {
    let set = single(Spec::Audio {
        codec: Some(AudioCodec::TrueHd),
        min_channels: Some(8),
    });

    assert_eq!(
        names(&set, "Movie.2020.2160p.BluRay.TrueHD.7.1.Atmos", None),
        ["x"]
    );
    assert!(names(&set, "Movie.2020.2160p.BluRay.TrueHD.5.1", None).is_empty());
}

#[test]
fn any_hdr_matches_every_hdr_format() {
    let set = single(Spec::Hdr { value: None });

    assert_eq!(names(&set, "Movie.2020.2160p.WEB.HLG", None), ["x"]);
    assert!(names(&set, "Movie.2020.2160p.WEB", None).is_empty());
}

#[test]
fn an_indexer_flag_is_read_from_the_facts() {
    let set = single(Spec::IndexerFlag {
        value: IndexerFlag::Freeleech,
    });
    let mut facts = Facts::from_release("Movie.2020.1080p.WEB", &p("Movie.2020.1080p.WEB"), None);
    facts.flags.push(IndexerFlag::Freeleech);

    let matched = set.matching(&facts, None);

    assert_eq!(matched.len(), 1);
}

#[test]
fn the_flags_the_indexer_reported_travel_with_the_release() {
    let set = single(Spec::IndexerFlag {
        value: IndexerFlag::Internal,
    });
    let name = "Movie.2020.1080p.WEB";
    let facts = Facts::from_release(name, &p(name), None)
        .with_flags([IndexerFlag::Freeleech, IndexerFlag::Internal]);

    let matched = set.matching(&facts, None);

    assert_eq!(matched.len(), 1);
}

#[test]
fn a_release_type_condition_tells_a_pack_from_one_episode() {
    let set = single(Spec::ReleaseType {
        value: ReleaseType::SeasonPack,
    });

    assert_eq!(names(&set, "Show.S03.COMPLETE.1080p.WEB.x265", None), ["x"]);
    assert_eq!(
        names(&set, "Show.S01-S03.COMPLETE.1080p.WEB.x265", None),
        ["x"]
    );
    assert!(names(&set, "Show.S03E04.1080p.WEB.x265", None).is_empty());
    assert!(names(&set, "Movie.2020.1080p.WEB.x265", None).is_empty());
}

#[test]
fn a_span_of_episodes_is_not_a_single_episode() {
    let one = single(Spec::ReleaseType {
        value: ReleaseType::SingleEpisode,
    });
    let several = single(Spec::ReleaseType {
        value: ReleaseType::MultiEpisode,
    });

    assert_eq!(
        names(&several, "Show.S01E01-E03.1080p.WEB.x265", None),
        ["x"]
    );
    assert!(names(&one, "Show.S01E01-E03.1080p.WEB.x265", None).is_empty());
    assert_eq!(names(&one, "Show.S01E01.1080p.WEB.x265", None), ["x"]);
}

#[test]
fn a_year_condition_bounds_the_year_the_name_carries() {
    let set = single(Spec::Year {
        min: Some(2000),
        max: Some(2009),
    });

    assert_eq!(names(&set, "Movie.2005.1080p.WEB.x265", None), ["x"]);
    assert!(names(&set, "Movie.2015.1080p.WEB.x265", None).is_empty());
    assert!(names(&set, "Show.S01E01.1080p.WEB.x265", None).is_empty());
}

#[test]
fn an_open_year_range_bounds_one_end_only() {
    let set = single(Spec::Year {
        min: Some(2010),
        max: None,
    });

    assert_eq!(names(&set, "Movie.2015.1080p.WEB.x265", None), ["x"]);
    assert!(names(&set, "Movie.2005.1080p.WEB.x265", None).is_empty());
}

#[test]
fn an_inverted_year_range_is_refused() {
    let formats = [CustomFormat {
        id: "x".into(),
        name: "Year".into(),
        conditions: vec![spec(Spec::Year {
            min: Some(2020),
            max: Some(2010),
        })],
    }];

    assert!(FormatSet::compile(&formats).is_err());
}

#[test]
fn a_release_type_condition_travels_as_its_camel_case_spelling() {
    let condition = Spec::ReleaseType {
        value: ReleaseType::SeasonPack,
    };

    let json = serde_json::to_string(&condition).unwrap();

    assert_eq!(json, r#"{"type":"releaseType","value":"seasonPack"}"#);
    assert_eq!(serde_json::from_str::<Spec>(&json).unwrap(), condition);
}

#[test]
fn a_year_condition_travels_as_its_bounds() {
    let condition = Spec::Year {
        min: Some(1990),
        max: None,
    };

    let json = serde_json::to_string(&condition).unwrap();

    assert_eq!(json, r#"{"type":"year","min":1990,"max":null}"#);
    assert_eq!(serde_json::from_str::<Spec>(&json).unwrap(), condition);
}

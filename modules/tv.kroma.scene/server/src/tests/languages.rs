use super::*;

#[test]
fn a_tag_reads_its_language_and_region() {
    let lang = Language::parse("fr_ca").unwrap();

    assert_eq!(lang, Language::new("fr", Some("CA")));
    assert_eq!(lang.to_string(), "fr-CA");
}

#[test]
fn a_bare_code_has_no_region() {
    assert_eq!(Language::parse("en").unwrap().region, None);
}

#[test]
fn a_numeric_region_is_a_region() {
    assert_eq!(Language::parse("es-419").unwrap().to_string(), "es-419");
}

#[test]
fn words_are_not_language_tags() {
    assert_eq!(Language::parse("french"), None);
    assert_eq!(Language::parse("fr-Canada"), None);
    assert_eq!(Language::parse(""), None);
}

#[test]
fn a_regional_track_answers_for_its_bare_language() {
    let vfq = Language::new("fr", Some("CA"));

    assert!(vfq.satisfies(&Language::new("fr", None)));
    assert!(!vfq.satisfies(&Language::new("fr", Some("FR"))));
}

#[test]
fn a_track_of_unknown_region_does_not_answer_for_a_region() {
    let french = Language::new("fr", None);

    assert!(!french.satisfies(&Language::new("fr", Some("FR"))));
}

#[test]
fn a_language_travels_as_its_tag() {
    let json = serde_json::to_string(&Language::new("fr", Some("FR"))).unwrap();
    let back: Language = serde_json::from_str(&json).unwrap();

    assert_eq!(json, r#""fr-FR""#);
    assert_eq!(back, Language::new("fr", Some("FR")));
    assert!(serde_json::from_str::<Language>(r#""nope nope""#).is_err());
}

#[test]
fn a_probed_file_speaks_the_languages_of_its_tracks() {
    let name = "Movie.2020.MULTi.1080p.WEB.x264";
    let facts = Facts::from_release(name, &p(name), None).overlay_probe(Probe {
        width: Some(1920),
        height: Some(1080),
        audio: vec![
            AudioFact {
                language: Some(Language::new("en", None)),
                ..AudioFact::default()
            },
            AudioFact {
                language: Some(Language::new("fr", Some("CA"))),
                ..AudioFact::default()
            },
        ],
        ..Probe::default()
    });

    assert!(!facts.languages.original);
    assert!(facts.languages.has_original(Some(&english())));
    assert!(facts.languages.has(&Language::new("fr", Some("CA")), None));
    assert!(!facts.languages.has(&Language::new("fr", Some("FR")), None));
}

#[test]
fn a_probe_with_untagged_audio_keeps_what_the_name_said() {
    let name = "Movie.2020.TRUEFRENCH.1080p.WEB.x264";
    let facts = Facts::from_release(name, &p(name), None).overlay_probe(Probe {
        audio: vec![AudioFact::default()],
        ..Probe::default()
    });

    assert_eq!(facts.languages.explicit, [Language::new("fr", Some("FR"))]);
}

#[test]
fn the_probe_resolution_wins_over_the_name() {
    let name = "Movie.2020.2160p.WEB.x264";
    let facts = Facts::from_release(name, &p(name), None).overlay_probe(Probe {
        width: Some(1920),
        height: Some(800),
        video_codec: Some("hevc".into()),
        ..Probe::default()
    });

    assert_eq!(facts.quality(), Quality::WebDl1080);
    assert_eq!(facts.codec, Some(Codec::Hevc));
    assert!(facts.hdr.is_empty());
}

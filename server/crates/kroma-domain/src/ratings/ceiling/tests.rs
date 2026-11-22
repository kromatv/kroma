use super::*;

fn ratings(pairs: &[(&str, &str)]) -> CountryRatings {
    pairs
        .iter()
        .map(|(c, l)| (c.to_string(), l.to_string()))
        .collect()
}

fn ceiling(level: MaturityLevel, reader: &str) -> Ceiling {
    Ceiling {
        level,
        reader: reader.into(),
        server: "FR".into(),
    }
}

fn blank() -> Metadata {
    serde_json::from_value(serde_json::json!({
        "tmdbId": 1,
        "title": null,
        "overview": null,
        "genres": [],
        "tmdbUrl": "",
    }))
    .unwrap()
}

fn rated(ratings: CountryRatings) -> Metadata {
    Metadata { ratings, ..blank() }
}

fn labelled(certification: &str) -> Metadata {
    Metadata {
        certification: Some(certification.into()),
        ..blank()
    }
}

#[test]
fn a_level_reads_and_writes_as_the_oldest_age_it_admits() {
    let levels: Vec<MaturityLevel> = serde_json::from_str("[0, 7, 10, 13, 16, 18]").unwrap();

    assert_eq!(levels, MaturityLevel::ALL.to_vec());
    assert_eq!(serde_json::to_string(&MaturityLevel::Ten).unwrap(), "10");
    assert!(serde_json::from_str::<MaturityLevel>("12").is_err());
}

#[test]
fn every_profile_starts_at_eighteen_and_eighteen_hides_nothing() {
    let open = ceiling(MaturityLevel::default(), "FR");

    assert_eq!(open.level, MaturityLevel::Adult);
    assert!(open.hides_nothing());
    assert!(open.admits_metadata(None));
}

#[test]
fn a_title_passes_when_the_age_its_badge_shows_is_at_or_below_the_level() {
    let film = ratings(&[("FR", "12"), ("US", "PG-13")]);

    assert!(ceiling(MaturityLevel::Thirteen, "FR").admits(&film, None));
    assert!(!ceiling(MaturityLevel::Ten, "FR").admits(&film, None));
}

#[test]
fn the_ceiling_compares_the_label_of_the_readers_own_country() {
    let film = ratings(&[("DE", "12"), ("US", "PG")]);

    assert!(ceiling(MaturityLevel::Ten, "US").admits(&film, None));
    assert!(!ceiling(MaturityLevel::Ten, "DE").admits(&film, None));
}

#[test]
fn a_title_the_readers_country_never_rated_is_held_to_the_borrowed_label() {
    let film = ratings(&[("US", "R")]);

    assert!(!ceiling(MaturityLevel::Sixteen, "FR").admits(&film, None));
    assert_eq!(
        ceiling(MaturityLevel::Sixteen, "FR")
            .shown(&film)
            .map(|r| r.country),
        Some("US".to_string())
    );
}

#[test]
fn all_is_age_zero_and_admits_a_title_rated_for_everyone() {
    let cartoon = ratings(&[("FR", "TP")]);
    let family = ratings(&[("FR", "10")]);

    assert!(ceiling(MaturityLevel::All, "FR").admits(&cartoon, None));
    assert!(!ceiling(MaturityLevel::All, "FR").admits(&family, None));
}

#[test]
fn under_a_ceiling_a_title_nobody_rated_does_not_pass() {
    let under = ceiling(MaturityLevel::Sixteen, "FR");

    assert!(!under.admits(&CountryRatings::new(), None));
    assert!(!under.admits_metadata(None));
    assert!(!under.admits_metadata(Some(&blank())));
}

#[test]
fn a_label_the_table_does_not_know_does_not_pass() {
    let film = ratings(&[("FR", "Interdit aux moins de 11 ans")]);

    assert!(!ceiling(MaturityLevel::Sixteen, "FR").admits(&film, None));
}

#[test]
fn a_title_enriched_before_every_country_was_kept_is_read_under_the_servers_country() {
    let old = labelled("12");

    assert!(ceiling(MaturityLevel::Thirteen, "US").admits_metadata(Some(&old)));
    assert!(!ceiling(MaturityLevel::Ten, "US").admits_metadata(Some(&old)));
}

#[test]
fn a_kept_rating_wins_over_the_bare_label_beside_it() {
    let meta = Metadata {
        certification: Some("TP".into()),
        ..rated(ratings(&[("FR", "16")]))
    };

    assert!(!ceiling(MaturityLevel::Ten, "FR").admits_metadata(Some(&meta)));
}

#[test]
fn the_kids_levels_are_all_seven_and_ten() {
    let kids: Vec<MaturityLevel> = MaturityLevel::ALL
        .into_iter()
        .filter(|level| level.is_kids())
        .collect();

    assert_eq!(
        kids,
        [MaturityLevel::All, MaturityLevel::Seven, MaturityLevel::Ten]
    );
}

#[test]
fn a_reader_is_shown_the_label_of_their_own_country_and_the_bare_label_follows() {
    let mut meta = rated(ratings(&[("FR", "12"), ("US", "PG-13")]));
    meta.certification = Some("PG-13".into());

    ceiling(MaturityLevel::Adult, "FR").relabel(&mut meta);

    let shown = meta.age_rating.expect("a rating");
    assert_eq!((shown.label.as_str(), shown.borrowed), ("12", false));
    assert_eq!(meta.certification.as_deref(), Some("12"));
}

#[test]
fn a_title_enriched_before_every_country_was_kept_keeps_what_it_carries() {
    let mut meta = labelled("12");

    ceiling(MaturityLevel::Adult, "US").relabel(&mut meta);

    assert_eq!(meta.certification.as_deref(), Some("12"));
    assert!(meta.age_rating.is_none());
}

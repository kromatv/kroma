use super::*;

use crate::profile::{QualityTier, SizeLimit, Sizes};

fn tier(qualities: &[Quality], allowed: bool) -> QualityTier {
    QualityTier {
        name: None,
        qualities: qualities.to_vec(),
        allowed,
    }
}

fn profile(tiers: Vec<QualityTier>, cutoff: Quality) -> QualityProfile {
    QualityProfile {
        tiers,
        cutoff,
        ..fixture().profile
    }
}

#[test]
fn a_profile_that_names_a_quality_twice_is_refused() {
    let profile = profile(
        vec![
            tier(&[Quality::WebDl1080], true),
            tier(&[Quality::WebDl1080], true),
        ],
        Quality::WebDl1080,
    );

    let error = profile.validate().unwrap_err();

    assert_eq!(error, "webdl-1080p is listed twice");
}

#[test]
fn a_profile_that_allows_nothing_is_refused() {
    let profile = profile(vec![tier(&[Quality::WebDl1080], false)], Quality::WebDl1080);

    let error = profile.validate().unwrap_err();

    assert_eq!(error, "the profile allows no quality");
}

#[test]
fn a_profile_that_cuts_off_at_a_quality_it_does_not_allow_is_refused() {
    let profile = profile(
        vec![
            tier(&[Quality::WebDl1080], true),
            tier(&[Quality::Dvd], false),
        ],
        Quality::Dvd,
    );

    let error = profile.validate().unwrap_err();

    assert_eq!(error, "the cutoff dvd is not allowed");
}

#[test]
fn a_profile_with_a_blank_name_is_refused() {
    let mut profile = fixture().profile;
    profile.name = "  ".into();

    let error = profile.validate().unwrap_err();

    assert_eq!(error, "the profile has no name");
}

#[test]
fn a_sound_profile_validates() {
    assert!(fixture().profile.validate().is_ok());
}

#[test]
fn a_tier_ranks_above_the_ones_listed_after_it() {
    let profile = profile(
        vec![
            tier(&[Quality::Bluray1080], true),
            tier(&[Quality::WebDl1080, Quality::WebRip1080], true),
            tier(&[Quality::Dvd], false),
        ],
        Quality::WebDl1080,
    );

    assert_eq!(profile.rank(Quality::Bluray1080), Some(3));
    assert_eq!(
        profile.rank(Quality::WebDl1080),
        profile.rank(Quality::WebRip1080)
    );
    assert_eq!(profile.rank(Quality::Dvd), None);
    assert_eq!(profile.rank(Quality::Cam), None);
    assert_eq!(profile.cutoff_rank(), 2);
}

#[test]
fn a_cutoff_the_profile_does_not_list_is_never_reached() {
    let profile = profile(vec![tier(&[Quality::WebDl1080], true)], Quality::Remux2160);

    assert_eq!(profile.cutoff_rank(), u32::MAX);
}

#[test]
fn a_format_the_profile_does_not_score_is_worth_nothing() {
    let mut profile = fixture().profile;
    profile.format_scores.insert("hevc".into(), 40);

    assert_eq!(profile.score_of("hevc"), 40);
    assert_eq!(profile.score_of("other"), 0);
}

#[test]
fn size_limits_are_looked_up_by_quality_for_films_and_episodes() {
    let limit = |quality| SizeLimit {
        quality,
        min: 1.0,
        preferred: None,
        max: Some(9.0),
    };
    let sizes = Sizes {
        movie: vec![limit(Quality::WebDl1080)],
        episode: vec![limit(Quality::Dvd)],
        movie_runtime: 110,
        episode_runtime: 45,
    };

    assert!(sizes.limit(Quality::WebDl1080, true).is_some());
    assert!(sizes.limit(Quality::WebDl1080, false).is_none());
    assert!(sizes.limit(Quality::Dvd, false).is_some());
}

#[test]
fn a_stored_profile_without_an_upgrade_increment_asks_for_one_point() {
    let stored = serde_json::json!({
        "id": "p",
        "name": "P",
        "tiers": [{ "qualities": ["webdl-1080p"], "allowed": true }],
        "cutoff": "webdl-1080p",
        "upgradesAllowed": true,
    });

    let profile: QualityProfile = serde_json::from_value(stored).unwrap();

    assert_eq!(profile.min_upgrade_increment, 1);
}

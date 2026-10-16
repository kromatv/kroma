use super::*;

fn verdict(f: &Fixture, candidate: &str, on_disk: &[&str]) -> Verdict {
    let held: Vec<Evaluation> = on_disk.iter().map(|name| f.evaluate(name)).collect();
    upgrade_verdict(&f.evaluate(candidate), &held, &f.profile)
}

fn unmet(f: &Fixture, on_disk: &[&str]) -> bool {
    let held: Vec<Evaluation> = on_disk.iter().map(|name| f.evaluate(name)).collect();
    cutoff_unmet(&held, &f.profile)
}

fn languages_profile() -> Fixture {
    let mut f = fixture_with(LegacySettings {
        resolution: Res::R2160,
        ..legacy()
    });
    f.profile.format_scores.insert("vo-vff".into(), 1000);
    f.profile.upgrade_until_score = 1000;
    f
}

#[test]
fn a_release_for_an_empty_slot_is_a_fill() {
    let f = fixture();

    assert_eq!(
        verdict(&f, "Movie.2020.1080p.WEB-DL.x264", &[]),
        Verdict::Fill
    );
}

#[test]
fn a_better_quality_below_the_cutoff_is_an_upgrade() {
    let f = fixture();

    let v = verdict(
        &f,
        "Movie.2020.1080p.WEB-DL.x264",
        &["Movie.2020.720p.WEB-DL.x264"],
    );

    assert_eq!(v, Verdict::Upgrade(Reason::Quality));
}

#[test]
fn a_better_quality_past_the_cutoff_is_not_wanted() {
    let f = fixture();

    let v = verdict(
        &f,
        "Movie.2020.1080p.Remux.x264",
        &["Movie.2020.1080p.BluRay.x264"],
    );

    assert_eq!(v, Verdict::NotBetter(Reason::CutoffReached));
}

#[test]
fn the_same_quality_with_no_better_formats_is_not_wanted() {
    let f = fixture();

    let v = verdict(
        &f,
        "Movie.2020.1080p.WEB-DL.x264",
        &["Movie.2020.1080p.BluRay.x264"],
    );

    assert_eq!(v, Verdict::NotBetter(Reason::NoBetterFormats));
}

#[test]
fn a_proper_of_the_same_quality_is_an_upgrade() {
    let f = fixture();

    let v = verdict(
        &f,
        "Movie.2020.PROPER.1080p.WEB-DL.x264",
        &["Movie.2020.1080p.WEB-DL.x264"],
    );

    assert_eq!(v, Verdict::Upgrade(Reason::Revision));
}

#[test]
fn a_lower_quality_is_never_an_upgrade() {
    let f = fixture();

    let v = verdict(
        &f,
        "Movie.2020.720p.WEB-DL.x265",
        &["Movie.2020.1080p.WEB-DL.x264"],
    );

    assert_eq!(v, Verdict::NotBetter(Reason::LowerQuality));
}

#[test]
fn turning_upgrades_off_refuses_every_upgrade() {
    let mut f = fixture();
    f.profile.upgrades_allowed = false;

    let v = verdict(
        &f,
        "Movie.2020.1080p.WEB-DL.x264",
        &["Movie.2020.720p.WEB-DL.x264"],
    );

    assert_eq!(v, Verdict::NotBetter(Reason::UpgradesOff));
}

#[test]
fn a_quality_the_profile_refuses_is_not_allowed() {
    let f = fixture();

    let v = verdict(
        &f,
        "Movie.2020.2160p.WEB-DL.x264",
        &["Movie.2020.720p.WEB-DL.x264"],
    );

    assert_eq!(v, Verdict::NotBetter(Reason::NotAllowed));
}

#[test]
fn a_vo_only_file_is_cutoff_unmet_until_it_has_vff() {
    let f = languages_profile();

    assert!(unmet(&f, &["Show.S01E01.2160p.WEB-DL.ENGLISH.x265"]));
    assert!(!unmet(&f, &["Show.S01E01.MULTi.VFF.2160p.WEB-DL.x265"]));
}

#[test]
fn the_same_quality_with_vff_upgrades_a_vo_only_file() {
    let f = languages_profile();

    let v = verdict(
        &f,
        "Show.S01E01.MULTi.VFF.2160p.WEB-DL.x265",
        &["Show.S01E01.2160p.WEB-DL.x265"],
    );

    assert_eq!(v, Verdict::Upgrade(Reason::Formats));
}

#[test]
fn a_vfq_release_does_not_upgrade_a_vo_only_file() {
    let f = languages_profile();

    let v = verdict(
        &f,
        "Show.S01E01.MULTi.VFQ.2160p.WEB-DL.x265",
        &["Show.S01E01.2160p.WEB-DL.x265"],
    );

    assert_eq!(v, Verdict::NotBetter(Reason::NoBetterFormats));
}

#[test]
fn a_lower_quality_vff_release_is_refused_unless_it_may_sit_beside() {
    let mut f = languages_profile();
    let candidate = "Show.S01E01.MULTi.VFF.1080p.WEB-DL.x265";
    let held = ["Show.S01E01.2160p.WEB-DL.HDR.x265"];

    let refused = verdict(&f, candidate, &held);
    f.profile.add_beside = true;
    let beside = verdict(&f, candidate, &held);

    assert_eq!(refused, Verdict::NotBetter(Reason::LowerQuality));
    assert_eq!(beside, Verdict::Beside(Reason::Formats));
}

#[test]
fn a_file_beside_that_holds_vff_meets_the_cutoff() {
    let mut f = languages_profile();
    f.profile.add_beside = true;
    let held = [
        "Show.S01E01.2160p.WEB-DL.HDR.x265",
        "Show.S01E01.MULTi.VFF.1080p.WEB-DL.x265",
    ];

    let another = verdict(&f, "Show.S01E01.MULTi.VFF.1080p.BluRay.x265", &held);

    assert!(!unmet(&f, &held));
    assert_eq!(another, Verdict::NotBetter(Reason::LowerQuality));
}

#[test]
fn a_file_whose_quality_is_no_longer_allowed_is_cutoff_unmet() {
    let f = fixture();

    assert!(unmet(&f, &["Movie.2020.DVDRip.x264"]));
}

#[test]
fn nothing_on_disk_is_missing_rather_than_cutoff_unmet() {
    assert!(!unmet(&fixture(), &[]));
}

#[test]
fn a_verdict_travels_with_its_reason() {
    let json = serde_json::to_string(&Verdict::Upgrade(Reason::Formats)).unwrap();

    assert_eq!(json, r#"{"kind":"upgrade","reason":"formats"}"#);
    assert_eq!(
        serde_json::to_string(&Verdict::Fill).unwrap(),
        r#"{"kind":"fill"}"#
    );
}

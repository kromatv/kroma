//! What a refusal and a breakdown line hand a screen to translate.

use super::*;

#[test]
fn a_refusal_names_the_quality_the_profile_turned_down() {
    let f = fixture();

    let refusal = f
        .judge("Movie.2020.2160p.WEB-DL.x265", 2, 50, movie())
        .unwrap_err();

    assert_eq!(refusal.rule, "quality");
    assert_eq!(refusal.params["quality"], "webdl-2160p");
}

#[test]
fn a_refusal_on_seeders_names_what_there_was_and_what_was_wanted() {
    let f = fixture();

    let refusal = f
        .judge("Movie.2020.1080p.WEB-DL.x265", 2, 1, movie())
        .unwrap_err();

    assert_eq!(refusal.params["have"], 1);
    assert_eq!(refusal.params["need"], 2);
}

#[test]
fn a_refusal_on_a_forbidden_term_names_the_term_the_admin_wrote() {
    let f = fixture();

    let refusal = f
        .judge("Movie.2020.1080p.HDCAM.x264", 2, 50, movie())
        .unwrap_err();

    assert_eq!(refusal.params["term"], "cam");
}

#[test]
fn a_refusal_on_size_names_the_size_and_the_limit_it_broke() {
    let f = fixture();

    let refusal = f
        .judge("Movie.2020.1080p.BluRay.x265", 40, 50, movie())
        .unwrap_err();

    assert_eq!(refusal.rule, "too-big");
    assert!(refusal.params["sizeBytes"].as_u64().unwrap() > 0);
    assert!(refusal.params["limitBytes"].as_u64().unwrap() > 0);
}

#[test]
fn a_breakdown_line_carries_what_the_sentence_needs() {
    let f = fixture();

    let judged = f
        .judge("Movie.2020.1080p.WEB-DL.x265", 2, 50, movie())
        .unwrap();

    let quality = judged
        .breakdown
        .iter()
        .find(|l| l.rule == "quality")
        .unwrap();
    assert_eq!(quality.params["quality"], "webdl-1080p");
}

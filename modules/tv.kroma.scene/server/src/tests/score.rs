//! Golden checks on [`score`]: which candidate wins, and which rule refuses
//! the ones that do not.

use super::*;

#[test]
fn golden_movie_score_prefers_hevc_bluray() {
    let name = "The.Matrix.1999.1080p.BluRay.x265-GRP";
    let parsed = p(name);
    let s = score(
        &parsed,
        &cand(8, 40),
        &Target::Movie { year: Some(1999) },
        &profile(),
        name,
    )
    .unwrap();
    // 1000 res + 400 hevc + 200 bluray + 400 seeders + 100 sweet spot = 2100.
    assert_eq!(s.score, 2100);

    let h264 = "The.Matrix.1999.1080p.BluRay.x264-GRP";
    let s264 = score(
        &p(h264),
        &cand(8, 40),
        &Target::Movie { year: Some(1999) },
        &profile(),
        h264,
    )
    .unwrap();
    assert!(
        s.score > s264.score,
        "HEVC must outrank H264 at equal quality"
    );
}

#[test]
fn rejects_carry_the_rule_that_fired() {
    let t = Target::Movie { year: Some(2020) };
    let pr = profile();

    let cam = "Movie.2020.1080p.HDCAM.x264";
    assert_eq!(
        score(&p(cam), &cand(2, 50), &t, &pr, cam).unwrap_err().rule,
        "forbidden-keyword"
    );

    let low = "Movie.2020.1080p.WEB-DL.x265";
    assert_eq!(
        score(&p(low), &cand(2, 1), &t, &pr, low).unwrap_err().rule,
        "seeders"
    );

    let big = "Movie.2020.2160p.BluRay.x265";
    assert_eq!(
        score(&p(big), &cand(80, 50), &t, &pr, big)
            .unwrap_err()
            .rule,
        "too-big"
    );

    let wrong_year = "Movie.2011.1080p.BluRay.x265";
    assert_eq!(
        score(&p(wrong_year), &cand(8, 50), &t, &pr, wrong_year)
            .unwrap_err()
            .rule,
        "wrong-year"
    );

    let tv = "Movie.S01E01.1080p.WEB.x265";
    assert_eq!(
        score(&p(tv), &cand(2, 50), &t, &pr, tv).unwrap_err().rule,
        "wrong-shape"
    );

    let xvid = "Movie.2020.1080p.DVDRip.XviD";
    assert_eq!(
        score(&p(xvid), &cand(1, 50), &t, &pr, xvid)
            .unwrap_err()
            .rule,
        "legacy-codec"
    );
}

#[test]
fn episode_target_matches_spans_and_rejects_neighbors() {
    let t = Target::Episode {
        season: 1,
        episode: 2,
    };
    let pr = profile();

    let span = "Show.S01E01-E03.1080p.WEB.x265";
    assert!(
        score(&p(span), &cand(2, 10), &t, &pr, span).is_ok(),
        "span covering E02 accepted"
    );

    let other = "Show.S01E05.1080p.WEB.x265";
    assert_eq!(
        score(&p(other), &cand(2, 10), &t, &pr, other)
            .unwrap_err()
            .rule,
        "wrong-episode"
    );

    let pack = "Show.S01.COMPLETE.1080p.WEB.x265";
    assert_eq!(
        score(&p(pack), &cand(2, 10), &t, &pr, pack)
            .unwrap_err()
            .rule,
        "wrong-shape"
    );
}

#[test]
fn season_pack_gets_pack_bonus_and_scaled_size_budget() {
    let t = Target::Season {
        season: 1,
        episodes: 10,
    };
    let pr = profile();
    let pack = "Show.S01.COMPLETE.1080p.WEB-DL.x265-GRP";
    // 22 GB pack would exceed one episode's 3 GB budget, but 10 episodes scale
    // the budget to 30 GB.
    let s = score(&p(pack), &cand(22, 30), &t, &pr, pack).unwrap();
    assert!(s
        .breakdown
        .iter()
        .any(|l| l.rule == "season-pack" && l.delta == 300));

    let ep = "Show.S01E01.1080p.WEB.x265";
    assert_eq!(
        score(&p(ep), &cand(2, 30), &t, &pr, ep).unwrap_err().rule,
        "wrong-shape"
    );
}

#[test]
fn required_keywords_and_priority_tiebreak() {
    let mut pr = profile();
    pr.required_keywords = vec!["VOSTFR".into()];
    let t = Target::Movie { year: None };

    let plain = "Movie.2020.1080p.WEB.x265";
    assert_eq!(
        score(&p(plain), &cand(2, 10), &t, &pr, plain)
            .unwrap_err()
            .rule,
        "missing-required-keyword"
    );

    let vostfr = "Movie.2020.VOSTFR.1080p.WEB.x265";
    let base = score(&p(vostfr), &cand(2, 10), &t, &pr, vostfr).unwrap();
    let boosted = score(
        &p(vostfr),
        &Candidate {
            indexer_priority: 25,
            ..cand(2, 10)
        },
        &t,
        &pr,
        vostfr,
    )
    .unwrap();
    assert_eq!(boosted.score, base.score + 25);
}

#[test]
fn a_cam_release_is_refused_even_when_no_keyword_rule_names_it() {
    let mut pr = profile();
    pr.forbidden_keywords = vec![];
    let t = Target::Movie { year: Some(2020) };
    let ts = "Movie.2020.1080p.TELESYNC.x264";
    assert_eq!(
        score(&p(ts), &cand(2, 50), &t, &pr, ts).unwrap_err().rule,
        "cam-source"
    );
}

#[test]
fn a_release_with_no_recognizable_resolution_is_refused() {
    let t = Target::Movie { year: Some(2020) };
    let name = "Movie.2020.WEB-DL.x265";
    let err = score(&p(name), &cand(2, 50), &t, &profile(), name).unwrap_err();
    assert_eq!(err.rule, "resolution");
}

#[test]
fn an_episode_target_refuses_a_release_carrying_no_episode_marker() {
    let t = Target::Episode {
        season: 1,
        episode: 2,
    };
    let name = "Show.1080p.WEB.x265";
    let err = score(&p(name), &cand(2, 10), &t, &profile(), name).unwrap_err();
    assert_eq!(err.rule, "wrong-shape");
    assert!(err.note.contains("SxxEyy"), "{}", err.note);
}

#[test]
fn a_season_target_refuses_a_pack_of_the_wrong_season() {
    let t = Target::Season {
        season: 1,
        episodes: 10,
    };
    let name = "Show.S02.COMPLETE.1080p.WEB.x265";
    let err = score(&p(name), &cand(5, 10), &t, &profile(), name).unwrap_err();
    assert_eq!(err.rule, "wrong-season");
}

#[test]
fn a_webrip_source_scores_below_a_web_dl() {
    let t = Target::Movie { year: None };
    let pr = profile();
    let rip = "Movie.2020.1080p.WEBRip.x264";
    let dl = "Movie.2020.1080p.WEB-DL.x264";
    assert_eq!(
        line(
            &score(&p(rip), &cand(6, 10), &t, &pr, rip).unwrap(),
            "source"
        ),
        Some(100)
    );
    assert_eq!(
        line(&score(&p(dl), &cand(6, 10), &t, &pr, dl).unwrap(), "source"),
        Some(200)
    );
}

#[test]
fn a_candidate_whose_indexer_reported_no_size_is_still_scored() {
    let t = Target::Movie { year: None };
    let name = "Movie.2020.1080p.BluRay.x265";
    let sizeless = Candidate {
        size_bytes: None,
        seeders: Some(10),
        indexer_priority: 0,
    };
    let s = score(&p(name), &sizeless, &t, &profile(), name).unwrap();
    assert_eq!(
        line(&s, "size"),
        None,
        "an unknown size must not earn the sweet-spot bonus"
    );
    assert_eq!(res_delta(&s), 1000);
}

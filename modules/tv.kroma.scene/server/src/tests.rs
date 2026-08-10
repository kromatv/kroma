//! Scene-name corpus for the parser + golden checks for the decision engine.

use crate::*;

fn p(name: &str) -> ParsedRelease {
    parse_release_name(name)
}

#[test]
fn parses_classic_movie_names() {
    let r = p("The.Matrix.1999.1080p.BluRay.x265-KROMASCENE");
    assert_eq!(r.title, "The Matrix");
    assert_eq!(r.year, Some(1999));
    assert_eq!(r.resolution, Some(Res::R1080));
    assert_eq!(r.codec, Some(Codec::Hevc));
    assert_eq!(r.source, Some(Source::BluRay));
    assert_eq!(r.group.as_deref(), Some("KROMASCENE"));
    assert!(!r.full_season && r.season.is_none());
}

#[test]
fn parses_modern_web_names_with_hdr_and_dv() {
    let r = p("Dune Part Two 2024 2160p WEB-DL DV HDR10 HEVC DDP5.1-GRP");
    assert_eq!(r.title, "Dune Part Two");
    assert_eq!(r.year, Some(2024));
    assert_eq!(r.resolution, Some(Res::R2160));
    assert_eq!(r.source, Some(Source::WebDl));
    assert_eq!(r.codec, Some(Codec::Hevc));
    assert!(r.hdr && r.dolby_vision);
}

#[test]
fn keeps_the_last_year_for_year_titles() {
    let r = p("2001.A.Space.Odyssey.1968.2160p.UHD.BluRay.x265");
    assert_eq!(r.title, "2001 A Space Odyssey");
    assert_eq!(r.year, Some(1968));
    assert_eq!(r.resolution, Some(Res::R2160));
}

#[test]
fn parses_episodes_spans_and_alt_notation() {
    let r = p("Show.Name.S02E05.720p.HDTV.x264-ABC");
    assert_eq!((r.season, r.episode), (Some(2), Some(5)));
    assert_eq!(r.source, Some(Source::Hdtv));
    assert!(!r.full_season);

    let r = p("Show.Name.S01E01-E03.1080p.WEBRip.x265");
    assert_eq!((r.season, r.episode, r.episode_end), (Some(1), Some(1), Some(3)));

    let r = p("Show Name 1x02 1080p WEB");
    assert_eq!((r.season, r.episode), (Some(1), Some(2)));
    assert_eq!(r.source, Some(Source::WebDl));
}

#[test]
fn dimension_tokens_are_resolutions_not_episodes() {
    // The classic trap: 1920x1080 must not parse as season 1920 episode 1080.
    let r = p("Some.Movie.2020.1920x1080.WEBRip.x264");
    assert_eq!(r.resolution, Some(Res::R1080));
    assert_eq!(r.season, None);
    assert_eq!(r.episode, None);
}

#[test]
fn detects_season_packs() {
    let r = p("Show.Name.S03.COMPLETE.1080p.BluRay.x265-PACK");
    assert_eq!(r.season, Some(3));
    assert!(r.full_season);
    assert_eq!(r.episode, None);

    let r = p("Show Name Season 2 1080p WEB-DL");
    assert_eq!(r.season, Some(2));
    assert!(r.full_season);

    // French pack vocabulary.
    let r = p("Serie.Integrale.S01.1080p.WEB");
    assert!(r.full_season);
}

#[test]
fn proper_repack_flags_and_group_edge_cases() {
    let r = p("Movie.2021.PROPER.1080p.WEB-DL.x264");
    assert!(r.proper);
    // Trailing token is "x264": known, so no group is invented.
    assert_eq!(r.group, None);

    let r = p("Spider-Man.2002.REPACK.1080p.BluRay.x264");
    assert!(r.repack);
    assert_eq!(r.title, "Spider-Man");
}

fn profile() -> Profile {
    Profile {
        resolution: Res::R1080,
        prefer_hevc: true,
        min_seeders: 2,
        max_size_bytes_movie: 15 * GB,
        max_size_bytes_episode: 3 * GB,
        required_keywords: vec![],
        forbidden_keywords: vec!["cam".into(), "hdcam".into(), "screener".into()],
    }
}

const GB: u64 = 1_073_741_824;

fn cand(size_gb: u64, seeders: u32) -> Candidate {
    Candidate { size_bytes: Some(size_gb * GB), seeders: Some(seeders), indexer_priority: 0 }
}

#[test]
fn golden_movie_score_prefers_hevc_bluray() {
    let name = "The.Matrix.1999.1080p.BluRay.x265-GRP";
    let parsed = p(name);
    let s = score(&parsed, &cand(8, 40), &Target::Movie { year: Some(1999) }, &profile(), name).unwrap();
    // 1000 res + 400 hevc + 200 bluray + 400 seeders + 100 sweet spot = 2100.
    assert_eq!(s.score, 2100);

    let h264 = "The.Matrix.1999.1080p.BluRay.x264-GRP";
    let s264 = score(&p(h264), &cand(8, 40), &Target::Movie { year: Some(1999) }, &profile(), h264).unwrap();
    assert!(s.score > s264.score, "HEVC must outrank H264 at equal quality");
}

#[test]
fn rejects_carry_the_rule_that_fired() {
    let t = Target::Movie { year: Some(2020) };
    let pr = profile();

    let cam = "Movie.2020.1080p.HDCAM.x264";
    assert_eq!(score(&p(cam), &cand(2, 50), &t, &pr, cam).unwrap_err().rule, "forbidden-keyword");

    let low = "Movie.2020.1080p.WEB-DL.x265";
    assert_eq!(score(&p(low), &cand(2, 1), &t, &pr, low).unwrap_err().rule, "seeders");

    let big = "Movie.2020.2160p.BluRay.x265";
    assert_eq!(score(&p(big), &cand(80, 50), &t, &pr, big).unwrap_err().rule, "too-big");

    let wrong_year = "Movie.2011.1080p.BluRay.x265";
    assert_eq!(score(&p(wrong_year), &cand(8, 50), &t, &pr, wrong_year).unwrap_err().rule, "wrong-year");

    let tv = "Movie.S01E01.1080p.WEB.x265";
    assert_eq!(score(&p(tv), &cand(2, 50), &t, &pr, tv).unwrap_err().rule, "wrong-shape");

    let xvid = "Movie.2020.1080p.DVDRip.XviD";
    assert_eq!(score(&p(xvid), &cand(1, 50), &t, &pr, xvid).unwrap_err().rule, "legacy-codec");
}

#[test]
fn episode_target_matches_spans_and_rejects_neighbors() {
    let t = Target::Episode { season: 1, episode: 2 };
    let pr = profile();

    let span = "Show.S01E01-E03.1080p.WEB.x265";
    assert!(score(&p(span), &cand(2, 10), &t, &pr, span).is_ok(), "span covering E02 accepted");

    let other = "Show.S01E05.1080p.WEB.x265";
    assert_eq!(score(&p(other), &cand(2, 10), &t, &pr, other).unwrap_err().rule, "wrong-episode");

    let pack = "Show.S01.COMPLETE.1080p.WEB.x265";
    assert_eq!(score(&p(pack), &cand(2, 10), &t, &pr, pack).unwrap_err().rule, "wrong-shape");
}

#[test]
fn season_pack_gets_pack_bonus_and_scaled_size_budget() {
    let t = Target::Season { season: 1, episodes: 10 };
    let pr = profile();
    let pack = "Show.S01.COMPLETE.1080p.WEB-DL.x265-GRP";
    // 22 GB pack would exceed one episode's 3 GB budget, but 10 episodes scale
    // the budget to 30 GB.
    let s = score(&p(pack), &cand(22, 30), &t, &pr, pack).unwrap();
    assert!(s.breakdown.iter().any(|l| l.rule == "season-pack" && l.delta == 300));

    let ep = "Show.S01E01.1080p.WEB.x265";
    assert_eq!(score(&p(ep), &cand(2, 30), &t, &pr, ep).unwrap_err().rule, "wrong-shape");
}

#[test]
fn required_keywords_and_priority_tiebreak() {
    let mut pr = profile();
    pr.required_keywords = vec!["VOSTFR".into()];
    let t = Target::Movie { year: None };

    let plain = "Movie.2020.1080p.WEB.x265";
    assert_eq!(score(&p(plain), &cand(2, 10), &t, &pr, plain).unwrap_err().rule, "missing-required-keyword");

    let vostfr = "Movie.2020.VOSTFR.1080p.WEB.x265";
    let base = score(&p(vostfr), &cand(2, 10), &t, &pr, vostfr).unwrap();
    let boosted = score(
        &p(vostfr),
        &Candidate { indexer_priority: 25, ..cand(2, 10) },
        &t,
        &pr,
        vostfr,
    )
    .unwrap();
    assert_eq!(boosted.score, base.score + 25);
}

#[test]
fn source_codec_and_group_edge_branches() {
    // "WEB" then "RIP" split across tokens resolves to WEBRip.
    assert_eq!(p("Show.S01E01.WEB.RIP.x264").source, Some(Source::WebRip));
    // A bare "WEB" (weaker) must not downgrade an explicit WEBRip already seen.
    assert_eq!(p("Movie.2020.WEBRip.WEB.1080p.x264").source, Some(Source::WebRip));
    // Remux overrides a co-present BluRay tag.
    assert_eq!(p("Movie.2019.2160p.BluRay.REMUX.HEVC").source, Some(Source::Remux));
    // AV1 codec + single-token WEB-DL + a real -GROUP tag.
    let r = p("Movie.2020.1080p.WEB-DL.AV1-GRP");
    assert_eq!(r.codec, Some(Codec::Av1));
    assert_eq!(r.source, Some(Source::WebDl));
    assert_eq!(r.group.as_deref(), Some("GRP"));
    // The known trailing token "DL" of WEB-DL is not mistaken for a group.
    assert_eq!(p("Movie.2021.1080p.WEB-DL").group, None);
    // Concatenated multi-episode span ("S01E01E02").
    let e = p("Show.S01E01E02.1080p.WEB.x265");
    assert_eq!((e.season, e.episode, e.episode_end), (Some(1), Some(1), Some(2)));
    // A spelled-out season over 100 is ignored.
    assert_eq!(p("Show Season 200 1080p WEB").season, None);
    // A 3-digit "SxxxEyy" code is not a valid episode marker.
    let x = p("Thing.S100E01.1080p.WEB");
    assert_eq!((x.season, x.episode), (None, None));
    // Dimensions stay a resolution, never an episode.
    let d = p("Film.2020.1920x1080.WEBRip.x264");
    assert_eq!(d.resolution, Some(Res::R1080));
    assert_eq!((d.season, d.episode), (None, None));
}

#[test]
fn dolby_vision_spelled_out_across_two_tokens_is_still_dolby_vision() {
    let r = p("Movie.2024.2160p.WEB-DL.Dolby.Vision.HEVC");
    assert!(r.dolby_vision);
    assert!(!p("Movie.2024.2160p.WEB-DL.Vision.HEVC").dolby_vision);
}

#[test]
fn a_season_word_with_nothing_countable_after_it_is_not_a_season() {
    let r = p("Show Season Finale 1080p WEB");
    assert_eq!(r.season, None);
    assert!(!r.full_season);
}

#[test]
fn malformed_episode_codes_are_refused_rather_than_half_read() {
    let bad_episode = p("Show.S01Exx.1080p.WEB");
    assert_eq!((bad_episode.season, bad_episode.episode), (None, None));

    let no_episode_digits = p("Show.S01E.1080p.WEB");
    assert_eq!((no_episode_digits.season, no_episode_digits.episode), (None, None));

    let dash_instead_of_e = p("Show.S01-02.1080p.WEB");
    assert_eq!((dash_instead_of_e.season, dash_instead_of_e.episode), (None, None));

    let season_too_high_for_nxmm = p("Show 60x02 1080p WEB");
    assert_eq!((season_too_high_for_nxmm.season, season_too_high_for_nxmm.episode), (None, None));
}

#[test]
fn a_cam_release_is_refused_even_when_no_keyword_rule_names_it() {
    let mut pr = profile();
    pr.forbidden_keywords = vec![];
    let t = Target::Movie { year: Some(2020) };
    let ts = "Movie.2020.1080p.TELESYNC.x264";
    assert_eq!(score(&p(ts), &cand(2, 50), &t, &pr, ts).unwrap_err().rule, "cam-source");
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
    let t = Target::Episode { season: 1, episode: 2 };
    let name = "Show.1080p.WEB.x265";
    let err = score(&p(name), &cand(2, 10), &t, &profile(), name).unwrap_err();
    assert_eq!(err.rule, "wrong-shape");
    assert!(err.note.contains("SxxEyy"), "{}", err.note);
}

#[test]
fn a_season_target_refuses_a_pack_of_the_wrong_season() {
    let t = Target::Season { season: 1, episodes: 10 };
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
    assert_eq!(line(&score(&p(rip), &cand(6, 10), &t, &pr, rip).unwrap(), "source"), Some(100));
    assert_eq!(line(&score(&p(dl), &cand(6, 10), &t, &pr, dl).unwrap(), "source"), Some(200));
}

#[test]
fn a_candidate_whose_indexer_reported_no_size_is_still_scored() {
    let t = Target::Movie { year: None };
    let name = "Movie.2020.1080p.BluRay.x265";
    let sizeless = Candidate { size_bytes: None, seeders: Some(10), indexer_priority: 0 };
    let s = score(&p(name), &sizeless, &t, &profile(), name).unwrap();
    assert_eq!(line(&s, "size"), None, "an unknown size must not earn the sweet-spot bonus");
    assert_eq!(res_delta(&s), 1000);
}

fn res_delta(s: &Scored) -> i32 {
    s.breakdown.iter().find(|l| l.rule == "resolution").unwrap().delta
}

fn line(s: &Scored, rule: &str) -> Option<i32> {
    s.breakdown.iter().find(|l| l.rule == rule).map(|l| l.delta)
}

#[test]
fn resolution_delta_matrix() {
    let t = Target::Movie { year: None };
    let mut pr = profile();

    // Preference 1080, got 2160: above preference, +100.
    pr.resolution = Res::R1080;
    let up = "Movie.2020.2160p.WEB-DL.x264";
    assert_eq!(res_delta(&score(&p(up), &cand(2, 10), &t, &pr, up).unwrap()), 100);

    // Preference 2160, got 1080: the upgrade path, +400.
    pr.resolution = Res::R2160;
    let mid = "Movie.2020.1080p.WEB-DL.x264";
    assert_eq!(res_delta(&score(&p(mid), &cand(2, 10), &t, &pr, mid).unwrap()), 400);

    // Preference 2160, got 720: +50.
    let low = "Movie.2020.720p.WEB-DL.x264";
    assert_eq!(res_delta(&score(&p(low), &cand(2, 10), &t, &pr, low).unwrap()), 50);

    // Preference 720, got 1080: fallthrough above-preference, +100.
    pr.resolution = Res::R720;
    assert_eq!(res_delta(&score(&p(mid), &cand(2, 10), &t, &pr, mid).unwrap()), 100);

    // Exact match: +1000.
    assert_eq!(res_delta(&score(&p(low), &cand(2, 10), &t, &pr, low).unwrap()), 1000);
}

#[test]
fn codec_and_source_score_lines() {
    let t = Target::Movie { year: None };
    let mut pr = profile();

    // HEVC without the HEVC-first preference: +100, not +400.
    pr.prefer_hevc = false;
    let hevc = "Movie.2020.1080p.WEB-DL.x265";
    assert_eq!(line(&score(&p(hevc), &cand(2, 10), &t, &pr, hevc).unwrap(), "codec"), Some(100));

    // AV1: +150 regardless of prefer_hevc.
    let av1 = "Movie.2020.1080p.WEB-DL.AV1";
    assert_eq!(line(&score(&p(av1), &cand(2, 10), &t, &pr, av1).unwrap(), "codec"), Some(150));

    // H264: no codec line at all.
    let h264 = "Movie.2020.1080p.WEB-DL.x264";
    assert_eq!(line(&score(&p(h264), &cand(2, 10), &t, &pr, h264).unwrap(), "codec"), None);

    // Remux source: +250.
    let remux = "Movie.2020.1080p.BluRay.REMUX.x265";
    assert_eq!(line(&score(&p(remux), &cand(2, 10), &t, &pr, remux).unwrap(), "source"), Some(250));

    // HDTV source: +25.
    let hdtv = "Movie.2020.1080p.HDTV.x264";
    assert_eq!(line(&score(&p(hdtv), &cand(2, 10), &t, &pr, hdtv).unwrap(), "source"), Some(25));
}

#[test]
fn size_sweet_spot_and_proper_lines() {
    let t = Target::Movie { year: None };
    let pr = profile();
    // 8 GB sits in [15/4, 15*3/4] GB, earning the sweet-spot bonus; PROPER too.
    let name = "Movie.2020.PROPER.1080p.BluRay.x265";
    let s = score(&p(name), &cand(8, 10), &t, &pr, name).unwrap();
    assert_eq!(line(&s, "size"), Some(100));
    assert_eq!(line(&s, "proper"), Some(50));
    // A tiny release is below the sweet-spot floor: no size line.
    let tiny = score(&p(name), &cand(1, 10), &t, &pr, name).unwrap();
    assert_eq!(line(&tiny, "size"), None);
}

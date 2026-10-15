//! The scene-name corpus: what [`parse_release_name`] reads out of a release
//! name, and what it refuses to read.

use super::*;

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
fn a_language_or_completeness_tag_trailing_the_title_is_not_part_of_it() {
    assert_eq!(
        p("Stargate Atlantis iNTEGRALE MULTi").title,
        "Stargate Atlantis"
    );
    assert_eq!(
        p("Stargate.Atlantis.INTEGRALE.MULTi.1080p.BluRay.x265").title,
        "Stargate Atlantis"
    );
    assert_eq!(
        p("Stargate Atlantis COMPLETE SERIES MULTI").title,
        "Stargate Atlantis"
    );
    assert_eq!(p("Kaamelott.Integrale.FRENCH.1080p").title, "Kaamelott");
    assert_eq!(
        p("Le.Bureau.des.Legendes.S01.MULTi.1080p").title,
        "Le Bureau des Legendes"
    );
}

#[test]
fn the_same_words_inside_a_title_are_left_alone() {
    assert_eq!(
        p("A.Complete.Unknown.2024.1080p.WEB-DL").title,
        "A Complete Unknown"
    );
    assert_eq!(
        p("The.French.Dispatch.2021.1080p.BluRay").title,
        "The French Dispatch"
    );
    assert_eq!(
        p("The French Connection 1971 1080p").title,
        "The French Connection"
    );
    assert_eq!(p("The.Complete.Unknown").title, "The Complete Unknown");
}

#[test]
fn a_name_that_is_nothing_but_tags_keeps_a_title_rather_than_matching_everything() {
    assert_eq!(p("MULTi.FRENCH.1080p").title, "MULTi");
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
    assert_eq!(
        (r.season, r.episode, r.episode_end),
        (Some(1), Some(1), Some(3))
    );

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

#[test]
fn source_codec_and_group_edge_branches() {
    // "WEB" then "RIP" split across tokens resolves to WEBRip.
    assert_eq!(p("Show.S01E01.WEB.RIP.x264").source, Some(Source::WebRip));
    // A bare "WEB" (weaker) must not downgrade an explicit WEBRip already seen.
    assert_eq!(
        p("Movie.2020.WEBRip.WEB.1080p.x264").source,
        Some(Source::WebRip)
    );
    // Remux overrides a co-present BluRay tag.
    assert_eq!(
        p("Movie.2019.2160p.BluRay.REMUX.HEVC").source,
        Some(Source::Remux)
    );
    // AV1 codec + single-token WEB-DL + a real -GROUP tag.
    let r = p("Movie.2020.1080p.WEB-DL.AV1-GRP");
    assert_eq!(r.codec, Some(Codec::Av1));
    assert_eq!(r.source, Some(Source::WebDl));
    assert_eq!(r.group.as_deref(), Some("GRP"));
    // The known trailing token "DL" of WEB-DL is not mistaken for a group.
    assert_eq!(p("Movie.2021.1080p.WEB-DL").group, None);
    // Concatenated multi-episode span ("S01E01E02").
    let e = p("Show.S01E01E02.1080p.WEB.x265");
    assert_eq!(
        (e.season, e.episode, e.episode_end),
        (Some(1), Some(1), Some(2))
    );
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
    assert_eq!(
        (no_episode_digits.season, no_episode_digits.episode),
        (None, None)
    );

    let dash_instead_of_e = p("Show.S01-02.1080p.WEB");
    assert_eq!(
        (dash_instead_of_e.season, dash_instead_of_e.episode),
        (None, None)
    );

    let season_too_high_for_nxmm = p("Show 60x02 1080p WEB");
    assert_eq!(
        (
            season_too_high_for_nxmm.season,
            season_too_high_for_nxmm.episode
        ),
        (None, None)
    );
}

use super::*;

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
fn an_episode_written_apart_from_its_season_is_still_that_episode() {
    let r = p("FEAR THE WALKING DEAD S07 E01 - Le Phare");
    assert_eq!(r.title, "FEAR THE WALKING DEAD");
    assert_eq!((r.season, r.episode), (Some(7), Some(1)));
    assert!(!r.full_season);

    let accented = p("FEAR THE WALKING DEAD S07 E05 - Jusqu'à la mort");
    assert_eq!((accented.season, accented.episode), (Some(7), Some(5)));

    let span = p("Show.Name.S02.E03-E04.1080p.WEB");
    assert_eq!(
        (span.season, span.episode, span.episode_end),
        (Some(2), Some(3), Some(4))
    );
}

#[test]
fn a_word_after_a_season_that_merely_starts_with_e_is_not_an_episode() {
    let r = p("Show.Name.S01.English.1080p.WEB");
    assert_eq!((r.season, r.episode), (Some(1), None));
    assert!(r.full_season);
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
fn a_multi_season_pack_says_which_seasons_it_covers() {
    let r = p("Show.Name.S01-S03.COMPLETE.1080p.BluRay.x265-PACK");

    assert_eq!((r.season, r.season_end), (Some(1), Some(3)));
    assert!(r.full_season);
    assert_eq!(r.title, "Show Name");
}

#[test]
fn a_spelled_out_season_range_is_read_in_both_languages() {
    let french = p("Serie.Saison.1.a.3.FRENCH.1080p.WEB");
    let accented = p("Serie Saisons 1 à 3 MULTi 1080p WEB");
    let english = p("Show Seasons 1 to 3 1080p WEB-DL");
    let hyphenated = p("Show.Season.1-3.1080p.WEB-DL");

    for r in [french, accented, english, hyphenated] {
        assert_eq!((r.season, r.season_end), (Some(1), Some(3)));
        assert!(r.full_season);
    }
}

#[test]
fn a_complete_series_pack_covers_every_season_and_names_none() {
    let r = p("Show.Name.COMPLETE.SERIES.1080p.BluRay.x265");

    assert!(r.full_season);
    assert_eq!((r.season, r.season_end), (None, None));
}

#[test]
fn one_season_has_no_range() {
    let r = p("Show.Name.S03.COMPLETE.1080p.BluRay.x265-PACK");

    assert_eq!((r.season, r.season_end), (Some(3), None));
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

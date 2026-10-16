use super::*;

fn fr(region: Option<&str>) -> Language {
    Language::new("fr", region)
}

#[test]
fn multi_with_a_dub_tag_names_the_dub() {
    let r = p("Show.S01E01.MULTi.VFF.1080p.WEB.x265-GRP");

    assert!(r.multi);
    assert_eq!(r.languages, [fr(Some("FR"))]);
    assert_eq!(r.title, "Show");
}

#[test]
fn truefrench_is_the_france_dub() {
    assert_eq!(
        p("Movie.2020.TRUEFRENCH.1080p.BluRay").languages,
        [fr(Some("FR"))]
    );
}

#[test]
fn vfq_and_quebec_are_the_quebec_dub() {
    assert_eq!(p("Movie.2020.VFQ.1080p.WEB").languages, [fr(Some("CA"))]);
    assert_eq!(p("Movie.2020.QUEBEC.1080p.WEB").languages, [fr(Some("CA"))]);
}

#[test]
fn vf2_is_both_dubs() {
    assert_eq!(
        p("Movie.2020.MULTi.VF2.1080p.WEB").languages,
        [fr(Some("FR")), fr(Some("CA"))]
    );
}

#[test]
fn french_alone_is_a_french_dub_of_unstated_origin() {
    assert_eq!(p("Movie.2020.FRENCH.1080p.WEB").languages, [fr(None)]);
}

#[test]
fn a_named_dub_replaces_the_vague_french_tag() {
    assert_eq!(
        p("Movie.2020.MULTi.FRENCH.TRUEFRENCH.1080p.WEB").languages,
        [fr(Some("FR"))]
    );
    assert_eq!(
        p("Movie.2020.MULTi.TRUEFRENCH.FRENCH.1080p.WEB").languages,
        [fr(Some("FR"))]
    );
}

#[test]
fn vostfr_is_french_subtitles_not_a_french_dub() {
    let r = p("Show.S02E03.VOSTFR.1080p.WEB.x264");

    assert!(r.languages.is_empty());
    assert_eq!(r.subtitles, [fr(None)]);
}

#[test]
fn dual_audio_counts_as_multi() {
    assert!(p("Movie.2020.DUAL.1080p.BluRay").multi);
    assert!(p("Movie.2020.MULTi3.1080p.BluRay").multi);
}

#[test]
fn a_language_word_inside_the_title_is_not_a_tag() {
    let r = p("The.French.Dispatch.2021.1080p.BluRay");

    assert!(r.languages.is_empty());
    assert_eq!(r.title, "The French Dispatch");
}

#[test]
fn other_languages_are_read_too() {
    assert_eq!(
        p("Film.2019.GERMAN.DL.1080p.BluRay").languages,
        [Language::new("de", None)]
    );
    assert_eq!(
        p("Film.2019.iTA.ENG.1080p.BluRay").languages,
        [Language::new("it", None), Language::new("en", None)]
    );
}

#[test]
fn an_edition_after_the_title_is_read_and_kept_out_of_it() {
    let r = p("Movie.Extended.2010.1080p.BluRay.x264");

    assert_eq!(r.title, "Movie");
    assert_eq!(r.edition.as_deref(), Some("Extended"));
}

#[test]
fn a_two_word_cut_is_one_edition() {
    let r = p("Movie.2010.Directors.Cut.1080p.BluRay.x264");

    assert_eq!(r.edition.as_deref(), Some("Director's Cut"));
}

#[test]
fn several_edition_words_are_joined() {
    assert_eq!(
        p("Movie.2010.IMAX.Remastered.2160p.WEB").edition.as_deref(),
        Some("IMAX Remastered")
    );
}

#[test]
fn a_cut_named_in_the_title_is_not_an_edition() {
    let r = p("The.Final.Cut.2004.1080p.BluRay");

    assert_eq!(r.title, "The Final Cut");
    assert_eq!(r.edition, None);
}

#[test]
fn ddp_with_channels_reads_as_eac3() {
    let r = p("Show.S01E01.1080p.WEB-DL.DDP5.1.H.264-GRP");

    assert_eq!(r.audio_codec, Some(AudioCodec::Eac3));
    assert_eq!(r.audio_channels, Some(6));
}

#[test]
fn dts_hd_ma_with_split_channels_is_read_whole() {
    let r = p("Movie.2020.1080p.BluRay.DTS-HD.MA.7.1.x264");

    assert_eq!(r.audio_codec, Some(AudioCodec::DtsHdMa));
    assert_eq!(r.audio_channels, Some(8));
}

#[test]
fn truehd_atmos_reads_its_channels() {
    let r = p("Movie.2020.2160p.BluRay.REMUX.TrueHD.7.1.Atmos-GRP");

    assert_eq!(r.audio_codec, Some(AudioCodec::TrueHd));
    assert_eq!(r.audio_channels, Some(8));
}

#[test]
fn stereo_aac_is_two_channels() {
    let r = p("Show.S01E01.720p.WEB.AAC2.0.x264");

    assert_eq!(r.audio_codec, Some(AudioCodec::Aac));
    assert_eq!(r.audio_channels, Some(2));
}

#[test]
fn a_bare_ac3_has_no_channel_count() {
    let r = p("Movie.2005.DVDRip.AC3.XviD");

    assert_eq!(r.audio_codec, Some(AudioCodec::Ac3));
    assert_eq!(r.audio_channels, None);
    assert_eq!(r.source, Some(Source::Dvd));
}

#[test]
fn hdr10_plus_is_its_own_format() {
    let r = p("Movie.2023.2160p.WEB-DL.HDR10+.HEVC");
    let facts = Facts::from_release("x", &r, None);

    assert!(r.hdr10_plus);
    assert_eq!(facts.hdr, [HdrFormat::Hdr10Plus]);
}

#[test]
fn hlg_is_read() {
    assert!(p("Event.2024.2160p.HLG.HEVC").hlg);
}

#[test]
fn sd_resolutions_are_read() {
    assert_eq!(p("Show.S01E01.480p.WEB.x264").resolution, Some(Res::Sd));
    assert_eq!(p("Movie.1999.720x576.DVDRip").resolution, Some(Res::Sd));
}

#[test]
fn vp9_is_read() {
    assert_eq!(p("Clip.2020.1080p.WEB.VP9").codec, Some(Codec::Vp9));
}

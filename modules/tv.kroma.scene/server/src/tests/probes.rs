use super::*;

use crate::facts::{AudioCodec, AudioFact, HdrFormat, Probe};

fn facts() -> Facts {
    Facts::from_release(
        "Movie.2020.2160p.WEB-DL.x265",
        &p("Movie.2020.2160p.WEB-DL.x265"),
        None,
    )
}

#[test]
fn the_probe_spells_each_hdr_format() {
    assert_eq!(HdrFormat::from_probe("hdr10"), Some(HdrFormat::Hdr10));
    assert_eq!(
        HdrFormat::from_probe("hdr10Plus"),
        Some(HdrFormat::Hdr10Plus)
    );
    assert_eq!(
        HdrFormat::from_probe("dolbyVision"),
        Some(HdrFormat::DolbyVision)
    );
    assert_eq!(HdrFormat::from_probe("hlg"), Some(HdrFormat::Hlg));
    assert_eq!(HdrFormat::from_probe("sdr"), None);
}

#[test]
fn the_probe_names_each_audio_codec() {
    let cases = [
        ("truehd", AudioCodec::TrueHd),
        ("MLP", AudioCodec::TrueHd),
        ("dts", AudioCodec::Dts),
        ("dca", AudioCodec::Dts),
        ("eac3", AudioCodec::Eac3),
        ("ac3", AudioCodec::Ac3),
        ("aac", AudioCodec::Aac),
        ("flac", AudioCodec::Flac),
        ("opus", AudioCodec::Opus),
        ("mp3", AudioCodec::Mp3),
        ("pcm_s24le", AudioCodec::Pcm),
    ];

    for (name, codec) in cases {
        assert_eq!(AudioCodec::from_probe(name), Some(codec));
    }
    assert_eq!(AudioCodec::from_probe("vorbis"), None);
}

#[test]
fn the_probe_names_each_video_codec() {
    assert_eq!(Codec::from_probe("HEVC"), Some(Codec::Hevc));
    assert_eq!(Codec::from_probe("h265"), Some(Codec::Hevc));
    assert_eq!(Codec::from_probe("h264"), Some(Codec::H264));
    assert_eq!(Codec::from_probe("avc1"), Some(Codec::H264));
    assert_eq!(Codec::from_probe("av1"), Some(Codec::Av1));
    assert_eq!(Codec::from_probe("vp9"), Some(Codec::Vp9));
    assert_eq!(Codec::from_probe("divx"), Some(Codec::Xvid));
    assert_eq!(Codec::from_probe("theora"), None);
}

#[test]
fn what_the_probe_measured_wins_over_the_name() {
    let probe = Probe {
        width: Some(1920),
        height: Some(800),
        video_codec: Some("h264".into()),
        hdr: vec![HdrFormat::Hdr10],
        size_bytes: Some(GB),
        ..Probe::default()
    };

    let facts = facts().overlay_probe(probe);

    assert_eq!(facts.resolution, Some(Res::R1080));
    assert_eq!(facts.codec, Some(Codec::H264));
    assert_eq!(facts.hdr, vec![HdrFormat::Hdr10]);
    assert_eq!(facts.size_bytes, Some(GB));
}

#[test]
fn an_empty_probe_leaves_the_name_as_it_was() {
    let before = facts();

    let after = before.clone().overlay_probe(Probe::default());

    assert_eq!(after, before);
}

#[test]
fn the_audio_a_probe_hears_replaces_the_languages_the_name_claimed() {
    let probe = Probe {
        audio: vec![AudioFact {
            language: Some(Language::new("fr", None)),
            codec: Some(AudioCodec::Eac3),
            channels: Some(6),
        }],
        subtitles: vec![Language::new("en", None), Language::new("en", None)],
        ..Probe::default()
    };

    let facts = facts().overlay_probe(probe);

    assert!(!facts.languages.original);
    assert_eq!(facts.languages.explicit, vec![Language::new("fr", None)]);
    assert_eq!(facts.audio.len(), 1);
    assert_eq!(facts.subtitles, vec![Language::new("en", None)]);
}

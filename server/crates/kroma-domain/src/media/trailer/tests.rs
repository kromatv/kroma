use super::*;

fn video(key: &str, lang: &str, kind: &str, name: &str, published: &str) -> TmdbVideo {
    TmdbVideo {
        key: key.into(),
        site: "YouTube".into(),
        kind: kind.into(),
        iso_639_1: lang.into(),
        name: name.into(),
        official: true,
        published_at: Some(published.into()),
    }
}

fn superman() -> Vec<TmdbVideo> {
    vec![
        video(
            "asl",
            "en",
            "Trailer",
            "Official American Sign Language Trailer",
            "2025-09-16",
        ),
        video(
            "tickets-en",
            "en",
            "Trailer",
            "Tickets on Sale Now",
            "2025-06-11",
        ),
        video(
            "vost",
            "fr",
            "Trailer",
            "Superman | Réservez vos places VOST",
            "2025-06-14",
        ),
        video(
            "tickets-vf",
            "fr",
            "Trailer",
            "Superman | Réservez vos places (VF)",
            "2025-06-14",
        ),
        video(
            "vf",
            "fr",
            "Trailer",
            "Superman | Bande-annonce (VF)",
            "2025-05-14",
        ),
        video(
            "vostfr",
            "fr",
            "Trailer",
            "Superman | Bande-annonce (VOST)",
            "2025-05-14",
        ),
        video("en", "en", "Trailer", "Official Trailer", "2025-05-14"),
        video(
            "teaser-vf",
            "fr",
            "Teaser",
            "Teaser officiel (VF)",
            "2024-12-19",
        ),
        video(
            "krypto",
            "en",
            "Teaser",
            "Krypto is one of a kind.",
            "2025-07-11",
        ),
    ]
}

fn keys(trailers: &[Trailer]) -> Vec<&str> {
    trailers.iter().map(|t| t.video.as_str()).collect()
}

#[test]
fn the_dubbed_main_trailer_comes_first_for_a_french_viewer() {
    let ranked = rank_trailers(&superman(), "fr-FR", Some("en"));

    assert_eq!(ranked[0].video, "vf");
    assert_eq!(ranked[0].version, TrailerVersion::Localized);
}

#[test]
fn a_subtitled_trailer_follows_every_dubbed_one() {
    let ranked = rank_trailers(&superman(), "fr", Some("en"));

    let versions: Vec<TrailerVersion> = ranked.iter().map(|t| t.version).collect();
    assert_eq!(&keys(&ranked)[..3], &["vf", "tickets-vf", "teaser-vf"]);
    assert!(versions.windows(2).all(|pair| pair[0] <= pair[1]));
}

#[test]
fn the_original_main_trailer_beats_its_promotions_for_an_english_viewer() {
    let ranked = rank_trailers(&superman(), "en", Some("en"));

    assert_eq!(&keys(&ranked)[..2], &["en", "asl"]);
}

#[test]
fn a_viewer_with_no_trailer_in_their_language_gets_the_original_one() {
    let ranked = rank_trailers(&superman(), "de", Some("en"));

    assert_eq!(ranked[0].video, "en");
    assert_eq!(ranked[0].version, TrailerVersion::Original);
}

#[test]
fn the_original_language_beats_english_for_a_foreign_title() {
    let videos = vec![
        video("en", "en", "Trailer", "Official Trailer", "2024-01-01"),
        video("ko", "ko", "Trailer", "공식 예고편 Trailer", "2023-01-01"),
    ];

    let ranked = rank_trailers(&videos, "fr", Some("ko"));

    assert_eq!(keys(&ranked), vec!["ko", "en"]);
}

#[test]
fn clips_and_videos_off_youtube_are_left_out() {
    let mut vimeo = video("v", "fr", "Trailer", "Bande-annonce", "2024-01-01");
    vimeo.site = "Vimeo".into();
    let videos = vec![vimeo, video("c", "fr", "Clip", "Extrait", "2024-01-01")];

    let ranked = rank_trailers(&videos, "fr", None);

    assert!(ranked.is_empty());
}

#[test]
fn a_trailer_named_in_a_script_without_spaces_is_still_a_main_trailer() {
    let chinese = mentions("《超人》官方預告片", TRAILER_WORDS);
    let japanese = mentions("映画『スーパーマン』本予告", TRAILER_WORDS);
    let korean = mentions("슈퍼맨 메인 예고편", TRAILER_WORDS);
    let russian = mentions("Супермен — официальный трейлер", TRAILER_WORDS);

    assert!(chinese && japanese && korean && russian);
}

#[test]
fn subtitles_are_recognised_in_a_name_written_without_spaces() {
    let chinese = mentions("超人 預告片 中文字幕版", SUBTITLED);
    let korean = mentions("슈퍼맨 예고편 한글자막", SUBTITLED);
    let russian = mentions("Супермен трейлер с субтитрами", SUBTITLED);
    let dubbed = mentions("超人 國語配音版", SUBTITLED);

    assert!(chinese && korean && russian);
    assert!(!dubbed);
}

#[test]
fn vost_is_found_inside_vostfr_but_not_inside_another_word() {
    let subtitled = mentions("Bande-annonce VOSTFR", SUBTITLED);
    let unrelated = mentions("La Comunidad", &["omu"]);

    assert!(subtitled);
    assert!(!unrelated);
}

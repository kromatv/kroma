use std::cmp::Reverse;

use serde::{Deserialize, Serialize};

const MAX_TRAILERS: usize = 12;

const SUBTITLED: &[&str] = &[
    "vost",
    "vostfr",
    "sous-titr",
    "subtitled",
    "subtitulado",
    "subtitulada",
    "sottotitolato",
    "legendado",
    "untertitel",
    "omu",
];

const TRAILER_WORDS: &[&str] = &[
    "trailer",
    "bande-annonce",
    "bande annonce",
    "tráiler",
    "avance",
    "fragman",
    "trailer oficial",
];

const PROMOTION_WORDS: &[&str] = &[
    "ticket",
    "réserv",
    "billet",
    "sign language",
    "asl",
    "tv spot",
    "spot tv",
    "now playing",
    "in cinemas",
    "au cinéma",
    "featurette",
    "behind",
    "review",
    "reaction",
    "early screening",
    "imax",
    "prime video",
    "own it",
    "on digital",
    "blu-ray",
    "tomorrow",
    "demain",
];

/// One video TMDB lists for a title, as its `videos` endpoint answers it.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct TmdbVideo {
    pub key: String,
    pub site: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub iso_639_1: String,
    pub name: String,
    pub official: bool,
    pub published_at: Option<String>,
}

/// How a trailer reaches a viewer: spoken in their language (`localized`),
/// with subtitles in it burned into the picture (`subtitled`), or in neither
/// (`original`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TrailerVersion {
    Localized,
    Subtitled,
    Original,
}

/// A trailer or a teaser.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TrailerKind {
    Trailer,
    Teaser,
}

/// A trailer a viewer can be offered, best first in the list it comes in.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Trailer {
    /// The YouTube video id.
    pub video: String,
    pub name: String,
    /// The ISO 639-1 language TMDB files the video under.
    pub language: String,
    pub version: TrailerVersion,
    pub kind: TrailerKind,
    pub official: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_at: Option<String>,
}

type Rank = (TrailerVersion, bool, TrailerKind, bool, bool);

fn base(tag: &str) -> String {
    tag.split(['-', '_'])
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
}

fn mentions(name: &str, words: &[&str]) -> bool {
    let name = name.to_lowercase();
    words.iter().any(|word| {
        (word.chars().count() > 4 && name.contains(word))
            || name.match_indices(word).any(|(at, _)| {
                let before = name[..at].chars().next_back();
                let after = name[at + word.len()..].chars().next();
                !before.is_some_and(char::is_alphanumeric)
                    && !after.is_some_and(char::is_alphanumeric)
            })
    })
}

fn version(video: &TmdbVideo, viewer: &str) -> TrailerVersion {
    if base(&video.iso_639_1) != viewer {
        TrailerVersion::Original
    } else if mentions(&video.name, SUBTITLED) {
        TrailerVersion::Subtitled
    } else {
        TrailerVersion::Localized
    }
}

/// The YouTube trailers and teasers in `videos`, best first for a viewer who
/// speaks `viewer`. In their language beats subtitled in it, which beats the
/// title's `original` language, which beats any other. Then a trailer beats a
/// teaser, a main trailer beats a ticket promotion, official beats fan-made,
/// and the newest wins what is left.
pub fn rank_trailers(videos: &[TmdbVideo], viewer: &str, original: Option<&str>) -> Vec<Trailer> {
    let viewer = base(viewer);
    let original = original.map(base);
    let mut ranked: Vec<(Trailer, Rank)> = videos
        .iter()
        .filter(|v| v.site.eq_ignore_ascii_case("YouTube") && !v.key.is_empty())
        .filter_map(|v| {
            let kind = match v.kind.as_str() {
                "Trailer" => TrailerKind::Trailer,
                "Teaser" => TrailerKind::Teaser,
                _ => return None,
            };
            let version = version(v, &viewer);
            let foreign_language = version == TrailerVersion::Original
                && original.as_deref() != Some(&base(&v.iso_639_1));
            let main = mentions(&v.name, TRAILER_WORDS) && !mentions(&v.name, PROMOTION_WORDS);
            let trailer = Trailer {
                video: v.key.clone(),
                name: v.name.clone(),
                language: base(&v.iso_639_1),
                version,
                kind,
                official: v.official,
                published_at: v.published_at.clone(),
            };
            Some((
                trailer,
                (version, foreign_language, kind, !main, !v.official),
            ))
        })
        .collect();
    ranked.sort_by(|(a, a_rank), (b, b_rank)| {
        a_rank
            .cmp(b_rank)
            .then_with(|| Reverse(&a.published_at).cmp(&Reverse(&b.published_at)))
    });
    let mut seen = std::collections::HashSet::new();
    ranked
        .into_iter()
        .map(|(trailer, _)| trailer)
        .filter(|t| seen.insert(t.video.clone()))
        .take(MAX_TRAILERS)
        .collect()
}

#[cfg(test)]
mod tests {
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
    fn vost_is_found_inside_vostfr_but_not_inside_another_word() {
        let subtitled = mentions("Bande-annonce VOSTFR", SUBTITLED);
        let unrelated = mentions("La Comunidad", &["omu"]);

        assert!(subtitled);
        assert!(!unrelated);
    }
}

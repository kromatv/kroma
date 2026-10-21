use super::builders::{audio, episode, movie, show_id, sub, video};
use crate::model::{HdrFormat, Library, LibraryKind, Show};
use crate::services::scan::{now_iso8601, short_hash, ScanData};

/// Build the demo data: a Movies library and a Shows library (2 shows, 4 episodes).
pub fn demo_data() -> ScanData {
    let added = now_iso8601();
    let movies_lib = short_hash("demo://movies");
    let shows_lib = short_hash("demo://shows");

    let planet_earth = show_id(&shows_lib, "Planet Earth II");
    let the_office = show_id(&shows_lib, "The Office");

    let items = vec![
        movie(
            "demo://blade-runner-2049",
            "Blade Runner 2049",
            Some(2017),
            Some(9_780_000),
            "mkv",
            video("hevc", 3840, 2160, Some(HdrFormat::Hdr10), 10),
            vec![
                audio("truehd", 8, Some("eng")),
                audio("eac3", 6, Some("fra")),
                audio("aac", 2, Some("eng")),
            ],
            vec![sub(Some("eng"), "subrip"), sub(Some("fra"), "subrip")],
            &movies_lib,
            &added,
        ),
        movie(
            "demo://dune-part-two",
            "Dune Part Two",
            Some(2024),
            Some(9_960_000),
            "mkv",
            video("hevc", 3840, 2160, Some(HdrFormat::Hdr10), 10),
            vec![audio("eac3", 6, Some("eng")), audio("ac3", 6, Some("fra"))],
            vec![sub(Some("eng"), "subrip")],
            &movies_lib,
            &added,
        ),
        movie(
            "demo://the-matrix",
            "The Matrix",
            Some(1999),
            Some(8_160_000),
            "mp4",
            video("h264", 1920, 1080, None, 8),
            vec![audio("ac3", 6, Some("eng")), audio("aac", 2, Some("fra"))],
            vec![sub(Some("eng"), "mov_text")],
            &movies_lib,
            &added,
        ),
        movie(
            "demo://spirited-away",
            "Spirited Away",
            Some(2001),
            Some(7_500_000),
            "mkv",
            video("h264", 1920, 1040, None, 8),
            vec![audio("flac", 2, Some("jpn")), audio("aac", 2, Some("eng"))],
            vec![sub(Some("eng"), "ass"), sub(Some("jpn"), "ass")],
            &movies_lib,
            &added,
        ),
        movie(
            "demo://big-buck-bunny",
            "Big Buck Bunny",
            Some(2008),
            Some(596_000),
            "webm",
            video("vp9", 1280, 720, None, 8),
            vec![audio("opus", 2, None)],
            vec![],
            &movies_lib,
            &added,
        ),
        movie(
            "demo://sintel-av1",
            "Sintel",
            Some(2010),
            Some(888_000),
            "mp4",
            video("av1", 4096, 1744, None, 10),
            vec![audio("aac", 2, Some("eng"))],
            vec![sub(Some("eng"), "subrip")],
            &movies_lib,
            &added,
        ),
        episode(
            "demo://pe2-s01e01",
            &planet_earth,
            "Planet Earth II",
            1,
            1,
            "Islands",
            Some(2016),
            Some(2_940_000),
            "mkv",
            video("hevc", 3840, 2160, Some(HdrFormat::Hdr10), 10),
            vec![audio("eac3", 6, Some("eng")), audio("aac", 2, Some("fra"))],
            &shows_lib,
            &added,
        ),
        episode(
            "demo://pe2-s01e02",
            &planet_earth,
            "Planet Earth II",
            1,
            2,
            "Mountains",
            Some(2016),
            Some(2_940_000),
            "mkv",
            video("hevc", 3840, 2160, Some(HdrFormat::Hdr10), 10),
            vec![audio("eac3", 6, Some("eng"))],
            &shows_lib,
            &added,
        ),
        episode(
            "demo://office-s02e01",
            &the_office,
            "The Office",
            2,
            1,
            "The Dundies",
            Some(2005),
            Some(1_320_000),
            "mp4",
            video("h264", 1280, 720, None, 8),
            vec![audio("aac", 2, Some("eng"))],
            &shows_lib,
            &added,
        ),
        episode(
            "demo://office-s02e02",
            &the_office,
            "The Office",
            2,
            2,
            "Sexual Harassment",
            Some(2005),
            Some(1_320_000),
            "mp4",
            video("h264", 1280, 720, None, 8),
            vec![audio("aac", 2, Some("eng"))],
            &shows_lib,
            &added,
        ),
    ];

    let movies_count = items.iter().filter(|i| i.library == movies_lib).count();
    let shows_count = items.iter().filter(|i| i.library == shows_lib).count();

    let shows = vec![
        Show {
            id: planet_earth,
            title: "Planet Earth II".into(),
            year: Some(2016),
            library: shows_lib.clone(),
            season_count: 1,
            episode_count: 2,
            video: None,
            added_at: added.clone(),
            metadata: None,
            progress: None,
        },
        Show {
            id: the_office,
            title: "The Office".into(),
            year: Some(2005),
            library: shows_lib.clone(),
            season_count: 1,
            episode_count: 2,
            video: None,
            added_at: added.clone(),
            metadata: None,
            progress: None,
        },
    ];

    let libraries = vec![
        Library {
            id: movies_lib,
            name: "Films (Démo)".into(),
            kind: LibraryKind::Movies,
            path: "<demo>".into(),
            item_count: movies_count,
        },
        Library {
            id: shows_lib,
            name: "Séries (Démo)".into(),
            kind: LibraryKind::Shows,
            path: "<demo>".into(),
            item_count: shows_count,
        },
    ];

    // Demo files are synthetic, so there are no real mtimes to carry.
    ScanData {
        libraries,
        shows,
        items,
        ..Default::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Kind;

    #[test]
    fn demo_data_has_expected_shape() {
        let data = demo_data();
        assert_eq!(data.libraries.len(), 2);
        assert_eq!(data.shows.len(), 2);
        assert_eq!(data.items.len(), 10);
        let movies = data.items.iter().filter(|i| i.kind == Kind::Movie).count();
        let episodes = data
            .items
            .iter()
            .filter(|i| i.kind == Kind::Episode)
            .count();
        assert_eq!(movies, 6);
        assert_eq!(episodes, 4);
    }

    #[test]
    fn libraries_are_typed_with_item_counts() {
        let data = demo_data();
        let films = data
            .libraries
            .iter()
            .find(|l| l.name == "Films (Démo)")
            .unwrap();
        let series = data
            .libraries
            .iter()
            .find(|l| l.name == "Séries (Démo)")
            .unwrap();
        assert_eq!(films.kind, LibraryKind::Movies);
        assert_eq!(films.item_count, 6);
        assert_eq!(series.kind, LibraryKind::Shows);
        assert_eq!(series.item_count, 4);
    }

    #[test]
    fn shows_carry_season_and_episode_counts() {
        let data = demo_data();
        for s in &data.shows {
            assert_eq!(s.season_count, 1);
            assert_eq!(s.episode_count, 2);
        }
        assert!(data.shows.iter().any(|s| s.title == "Planet Earth II"));
        assert!(data.shows.iter().any(|s| s.title == "The Office"));
    }

    #[test]
    fn every_item_has_one_synthetic_file() {
        let data = demo_data();
        for it in &data.items {
            assert!(it.default_file_id.is_some());
            assert_eq!(it.files.len(), 1);
            let f = &it.files[0];
            assert_eq!(it.default_file_id.as_deref(), Some(f.id.as_str()));
            assert!(f.abs_path.as_deref().unwrap().starts_with("demo://"));
            assert!(f.probed);
        }
    }

    #[test]
    fn movie_audio_tracks_are_indexed_with_first_default() {
        let data = demo_data();
        let br = data
            .items
            .iter()
            .find(|i| i.title == "Blade Runner 2049")
            .unwrap();
        assert_eq!(br.audio_tracks.len(), 3);
        for (i, a) in br.audio_tracks.iter().enumerate() {
            assert_eq!(a.index, i as u32);
            assert_eq!(a.default, i == 0);
        }
        // Representative audio mirrors the first track.
        assert_eq!(br.audio.as_ref().unwrap().codec, br.audio_tracks[0].codec);
    }

    #[test]
    fn episodes_carry_show_grouping_and_default_sub() {
        let data = demo_data();
        let ep = data
            .items
            .iter()
            .find(|i| i.episode_title.as_deref() == Some("Islands"))
            .unwrap();
        assert_eq!(ep.kind, Kind::Episode);
        assert_eq!(ep.season, Some(1));
        assert_eq!(ep.episode, Some(1));
        assert_eq!(ep.show_title.as_deref(), Some("Planet Earth II"));
        assert!(ep.show_id.is_some());
        assert!(ep
            .subtitles
            .iter()
            .any(|s| s.language.as_deref() == Some("eng")));
    }
}

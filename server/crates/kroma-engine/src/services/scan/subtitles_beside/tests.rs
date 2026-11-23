use std::path::Path;

use super::super::{scan_all, ScanData};
use crate::services::settings::LibraryDef;

fn write(root: &Path, files: &[&str]) {
    for file in files {
        let path = root.join(file);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, b"x").unwrap();
    }
}

fn scanned(tag: &str, files: &[&str]) -> ScanData {
    let root = kroma_testing::temp_dir(&format!("beside-{tag}"));
    write(root.path(), files);
    scan_all(&[LibraryDef {
        id: "lib".into(),
        name: "Library".into(),
        kind: String::new(),
        folders: vec![root.path().to_string_lossy().into_owned()],
        auto_scan: true,
    }])
}

fn languages(data: &ScanData, video: &str) -> Vec<String> {
    let file = data
        .items
        .iter()
        .flat_map(|item| &item.files)
        .find(|file| file.rel_path.as_deref() == Some(video))
        .unwrap();
    data.external_subtitle_languages[&file.id].clone()
}

#[test]
fn a_film_reads_in_every_language_of_the_subtitle_files_beside_it() {
    let data = scanned(
        "film",
        &[
            "Film (2019)/Film (2019).mkv",
            "Film (2019)/Film (2019).en.srt",
            "Film (2019)/Film (2019).fr.forced.ass",
            "Film (2019)/Subs/Film (2019).de.vtt",
            "Film (2019)/Film (2019).it.sup",
            "Film (2019)/poster.jpg",
        ],
    );

    assert_eq!(
        languages(&data, "Film (2019)/Film (2019).mkv"),
        ["de", "en", "fr"]
    );
}

#[test]
fn a_film_in_a_shared_folder_keeps_its_own_subtitles_and_one_without_any_has_none() {
    let data = scanned(
        "shared",
        &[
            "Alien (1979).mkv",
            "Alien (1979).en.srt",
            "Heat (1995).mkv",
            "Heat (1995).fr.srt",
            "Dune (2021).mkv",
        ],
    );

    assert_eq!(languages(&data, "Alien (1979).mkv"), ["en"]);
    assert_eq!(languages(&data, "Heat (1995).mkv"), ["fr"]);
    assert!(languages(&data, "Dune (2021).mkv").is_empty());
}

#[test]
fn a_loose_track_in_a_subs_folder_is_the_one_film_s_but_no_one_episode_s() {
    let data = scanned(
        "loose",
        &[
            "Film (2019)/Film (2019).mkv",
            "Film (2019)/Subs/2_English.srt",
            "Show/Season 1/Show S01E01.mkv",
            "Show/Season 1/Show S01E02.mkv",
            "Show/Season 1/Subs/2_English.srt",
            "Show/Season 1/Subs/Show S01E01/3_French.srt",
        ],
    );

    assert_eq!(languages(&data, "Film (2019)/Film (2019).mkv"), ["en"]);
    assert_eq!(languages(&data, "Show/Season 1/Show S01E01.mkv"), ["fr"]);
    assert!(languages(&data, "Show/Season 1/Show S01E02.mkv").is_empty());
}

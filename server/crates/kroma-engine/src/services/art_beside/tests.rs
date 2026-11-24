use std::path::{Path, PathBuf};

use crate::infra::image::test_support::scoped_dir;

use super::*;

fn lay_out(root: &Path, files: &[&str]) -> Vec<PathBuf> {
    files
        .iter()
        .map(|file| {
            let path = root.join("media").join(file);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, "320").unwrap();
            path
        })
        .collect()
}

fn source_of(cached: Option<PathBuf>) -> Option<String> {
    let encoded = std::fs::read_to_string(cached?).unwrap();
    let (_, picture) = encoded.split_once("/media/")?;
    Some(picture.split(" -o ").next()?.to_string())
}

#[test]
fn a_film_in_its_own_folder_shows_the_poster_beside_it() {
    let dir = scoped_dir();
    let files = lay_out(
        dir.path(),
        &["Heat (1995)/Heat (1995).mkv", "Heat (1995)/Folder.JPG"],
    );

    let poster = film_poster(dir.path(), &files[..1]);

    assert_eq!(source_of(poster).as_deref(), Some("Heat (1995)/Folder.JPG"));
}

#[test]
fn a_picture_named_after_the_film_comes_before_the_folder_s_own() {
    let dir = scoped_dir();
    let files = lay_out(
        dir.path(),
        &["Heat/Heat.mkv", "Heat/poster.jpg", "Heat/Heat-poster.png"],
    );

    let poster = film_poster(dir.path(), &files[..1]);

    assert_eq!(source_of(poster).as_deref(), Some("Heat/Heat-poster.png"));
}

#[test]
fn a_folder_shared_by_two_films_gives_each_only_its_named_picture() {
    let dir = scoped_dir();
    let files = lay_out(
        dir.path(),
        &[
            "Films/Heat.mkv",
            "Films/Ronin.mkv",
            "Films/poster.jpg",
            "Films/Ronin.webp",
        ],
    );

    let heat = film_poster(dir.path(), &files[..1]);
    let ronin = film_poster(dir.path(), &files[1..2]);

    assert_eq!(source_of(heat), None);
    assert_eq!(source_of(ronin).as_deref(), Some("Films/Ronin.webp"));
}

#[test]
fn the_parts_of_one_film_keep_their_folder_s_poster() {
    let dir = scoped_dir();
    let files = lay_out(
        dir.path(),
        &["Heat/Heat cd1.mkv", "Heat/Heat cd2.mkv", "Heat/cover.jpeg"],
    );

    let poster = film_poster(dir.path(), &files[..2]);

    assert_eq!(source_of(poster).as_deref(), Some("Heat/cover.jpeg"));
}

#[test]
fn a_show_reads_its_poster_from_the_folder_above_its_seasons() {
    let dir = scoped_dir();
    let files = lay_out(
        dir.path(),
        &[
            "Andor/Season 01/Andor S01E01.mkv",
            "Andor/Season 01/poster.jpg",
            "Andor/show.png",
        ],
    );

    let poster = show_poster(dir.path(), &files[..1]);

    assert_eq!(source_of(poster).as_deref(), Some("Andor/show.png"));
}

#[test]
fn a_season_s_poster_is_not_its_show_s() {
    let dir = scoped_dir();
    let files = lay_out(
        dir.path(),
        &[
            "Andor/Season 01/Andor S01E01.mkv",
            "Andor/Season 01/poster.jpg",
        ],
    );

    let poster = show_poster(dir.path(), &files[..1]);

    assert_eq!(source_of(poster), None);
}

#[test]
fn a_folder_holding_two_shows_gives_its_poster_to_neither() {
    let dir = scoped_dir();
    let files = lay_out(
        dir.path(),
        &[
            "Shows/Andor S01E01.mkv",
            "Shows/Severance S01E01.mkv",
            "Shows/poster.jpg",
        ],
    );

    let andor = show_poster(dir.path(), &files[..1]);
    let none = show_poster(dir.path(), &[]);

    assert_eq!(source_of(andor), None);
    assert_eq!(source_of(none), None);
}

use std::path::{Path, PathBuf};

use crate::db::art_beside::{BACKDROP, LOGO, POSTER};

use super::*;

fn scanned(files: &[&str]) -> (Folders, Vec<PathBuf>) {
    let (pictures, videos): (Vec<PathBuf>, Vec<PathBuf>) = files
        .iter()
        .map(|file| Path::new("/media").join(file))
        .partition(|path| !path.extension().is_some_and(|ext| ext == "mkv"));
    (Folders::new(pictures, videos.clone()), videos)
}

fn at(file: &str) -> Option<PathBuf> {
    Some(Path::new("/media").join(file))
}

#[test]
fn a_film_in_its_own_folder_shows_the_pictures_beside_it() {
    let (folders, videos) = scanned(&[
        "Heat (1995)/Heat (1995).mkv",
        "Heat (1995)/Folder.JPG",
        "Heat (1995)/fanart.jpg",
    ]);

    let art = film_art(&folders, &videos);

    assert_eq!(art.poster, at("Heat (1995)/Folder.JPG"));
    assert_eq!(art.backdrop, at("Heat (1995)/fanart.jpg"));
}

#[test]
fn a_picture_named_after_the_film_comes_before_the_folder_s_own() {
    let (folders, videos) = scanned(&[
        "Heat/Heat.mkv",
        "Heat/poster.jpg",
        "Heat/Heat-poster.png",
        "Heat/backdrop.jpg",
        "Heat/Heat-fanart.jpg",
    ]);

    let art = film_art(&folders, &videos);

    assert_eq!(art.poster, at("Heat/Heat-poster.png"));
    assert_eq!(art.backdrop, at("Heat/Heat-fanart.jpg"));
}

#[test]
fn a_folder_shared_by_two_films_gives_each_only_its_named_pictures() {
    let (folders, videos) = scanned(&[
        "Films/Heat.mkv",
        "Films/Ronin.mkv",
        "Films/poster.jpg",
        "Films/fanart.jpg",
        "Films/Ronin.webp",
        "Films/Ronin-backdrop.jpg",
    ]);

    let heat = film_art(&folders, &videos[..1]);
    let ronin = film_art(&folders, &videos[1..]);

    assert_eq!(heat, Art::default());
    assert_eq!(ronin.poster, at("Films/Ronin.webp"));
    assert_eq!(ronin.backdrop, at("Films/Ronin-backdrop.jpg"));
}

#[test]
fn a_film_s_logo_is_named_after_its_video_or_is_its_own_folder_s() {
    let (own, own_videos) = scanned(&["Heat/Heat.mkv", "Heat/ClearLogo.png"]);
    let (shared, shared_videos) = scanned(&[
        "Films/Heat.mkv",
        "Films/Ronin.mkv",
        "Films/logo.png",
        "Films/Ronin-clearlogo.png",
    ]);

    let heat = film_art(&own, &own_videos);
    let heat_shared = film_art(&shared, &shared_videos[..1]);
    let ronin = film_art(&shared, &shared_videos[1..]);

    assert_eq!(heat.logo, at("Heat/ClearLogo.png"));
    assert_eq!(heat_shared.logo, None);
    assert_eq!(ronin.logo, at("Films/Ronin-clearlogo.png"));
}

#[test]
fn the_parts_of_one_film_keep_their_folder_s_poster() {
    let (folders, videos) = scanned(&["Heat/Heat cd1.mkv", "Heat/Heat cd2.mkv", "Heat/cover.jpeg"]);

    let art = film_art(&folders, &videos);

    assert_eq!(art.poster, at("Heat/cover.jpeg"));
}

#[test]
fn two_pictures_with_one_name_settle_on_the_same_one_on_every_scan() {
    let (one_way, videos) = scanned(&["Heat/Heat.mkv", "Heat/poster.png", "Heat/poster.jpg"]);
    let (other_way, _) = scanned(&["Heat/Heat.mkv", "Heat/poster.jpg", "Heat/poster.png"]);

    let first = film_art(&one_way, &videos);
    let second = film_art(&other_way, &videos);

    assert_eq!(first.poster, at("Heat/poster.jpg"));
    assert_eq!(first, second);
}

#[test]
fn a_show_reads_its_art_from_the_folder_above_its_seasons() {
    let (folders, videos) = scanned(&[
        "Andor/Season 01/Andor S01E01.mkv",
        "Andor/Season 01/poster.jpg",
        "Andor/show.png",
        "Andor/background.jpg",
        "Andor/logo.png",
    ]);

    let art = show_art(&folders, &videos);

    assert_eq!(art.poster, at("Andor/show.png"));
    assert_eq!(art.backdrop, at("Andor/background.jpg"));
    assert_eq!(art.logo, at("Andor/logo.png"));
}

#[test]
fn a_season_s_poster_is_not_its_show_s() {
    let (folders, videos) = scanned(&[
        "Andor/Season 01/Andor S01E01.mkv",
        "Andor/Season 01/poster.jpg",
    ]);

    let art = show_art(&folders, &videos);

    assert_eq!(art, Art::default());
}

#[test]
fn a_folder_holding_two_shows_gives_its_art_to_neither() {
    let (folders, videos) = scanned(&[
        "Shows/Andor S01E01.mkv",
        "Shows/Severance S01E01.mkv",
        "Shows/poster.jpg",
    ]);

    let andor = show_art(&folders, &videos[..1]);
    let none = show_art(&folders, &[]);

    assert_eq!(andor, Art::default());
    assert_eq!(none, Art::default());
}

#[test]
fn an_episode_s_thumbnail_is_named_after_its_video() {
    let (folders, videos) = scanned(&[
        "Andor/Season 01/Andor S01E01.mkv",
        "Andor/Season 01/Andor S01E02.mkv",
        "Andor/Season 01/Andor S01E01.jpg",
        "Andor/Season 01/Andor S01E01-thumb.jpg",
        "Andor/Season 01/Andor S01E02.png",
        "Andor/Season 01/poster.jpg",
    ]);
    let (alone, alone_videos) = scanned(&["Andor/Andor S01E03.mkv", "Andor/folder.jpg"]);

    let first = episode_art(&folders, &videos[..1]);
    let second = episode_art(&folders, &videos[1..]);
    let third = episode_art(&alone, &alone_videos);

    assert_eq!(first.still, at("Andor/Season 01/Andor S01E01-thumb.jpg"));
    assert_eq!(second.still, at("Andor/Season 01/Andor S01E02.png"));
    assert_eq!(first.poster, None);
    assert_eq!(third, Art::default());
}

#[test]
fn a_season_s_poster_is_in_its_folder_or_named_after_it_in_the_show_s() {
    let (folders, videos) = scanned(&[
        "Andor/Season 01/Andor S01E01.mkv",
        "Andor/Season 02/Andor S02E01.mkv",
        "Andor/Season 03/Andor S03E01.mkv",
        "Andor/Specials/Andor S00E01.mkv",
        "Andor/Season 01/folder.jpg",
        "Andor/Season 01/Season01.jpg",
        "Andor/Season 02/Season02.png",
        "Andor/season03-poster.jpg",
        "Andor/season-specials-poster.jpg",
    ]);
    let poster = |number: u32, season: &[PathBuf]| {
        let season = SeasonVideos {
            number,
            videos: season,
        };
        season_poster(&folders, &videos, &season)
    };

    assert_eq!(poster(1, &videos[..1]), at("Andor/Season 01/folder.jpg"));
    assert_eq!(poster(2, &videos[1..2]), at("Andor/Season 02/Season02.png"));
    assert_eq!(poster(3, &videos[2..3]), at("Andor/season03-poster.jpg"));
    assert_eq!(
        poster(0, &videos[3..]),
        at("Andor/season-specials-poster.jpg")
    );
}

#[test]
fn a_folder_holding_two_seasons_gives_its_poster_to_the_show_alone() {
    let (folders, videos) = scanned(&[
        "Andor/Andor S01E01.mkv",
        "Andor/Andor S02E01.mkv",
        "Andor/poster.jpg",
        "Andor/Season02.jpg",
    ]);
    let season = |number: u32, season: &[PathBuf]| {
        let season = SeasonVideos {
            number,
            videos: season,
        };
        season_poster(&folders, &videos, &season)
    };

    assert_eq!(season(1, &videos[..1]), None);
    assert_eq!(season(2, &videos[1..]), at("Andor/Season02.jpg"));
    assert_eq!(show_art(&folders, &videos).poster, at("Andor/poster.jpg"));
}

#[test]
fn a_film_s_nfo_is_named_after_its_video_or_is_its_own_folder_s() {
    let (shared, videos) = scanned(&[
        "Films/Heat.mkv",
        "Films/Ronin.mkv",
        "Films/HEAT.nfo",
        "Films/movie.nfo",
    ]);
    let (own, own_videos) = scanned(&["Heat (1995)/Heat (1995).mkv", "Heat (1995)/movie.nfo"]);

    assert_eq!(film_nfo(&shared, &videos[..1]), at("Films/HEAT.nfo"));
    assert_eq!(film_nfo(&shared, &videos[1..]), None);
    assert_eq!(film_nfo(&own, &own_videos), at("Heat (1995)/movie.nfo"));
}

#[test]
fn a_show_s_nfo_is_in_the_folder_above_its_seasons() {
    let (folders, videos) = scanned(&[
        "Andor/Season 01/Andor S01E01.mkv",
        "Andor/Season 01/tvshow.nfo",
        "Andor/tvshow.nfo",
    ]);
    let (shared, shared_videos) = scanned(&[
        "Shows/Andor S01E01.mkv",
        "Shows/Severance S01E01.mkv",
        "Shows/tvshow.nfo",
    ]);

    assert_eq!(show_nfo(&folders, &videos), at("Andor/tvshow.nfo"));
    assert_eq!(show_nfo(&shared, &shared_videos[..1]), None);
}

#[test]
fn a_backdrop_is_cached_wider_than_a_poster_or_a_logo() {
    assert!(max_width(BACKDROP) > max_width(POSTER));
    assert!(max_width(BACKDROP) > max_width(LOGO));
}

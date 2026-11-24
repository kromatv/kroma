use std::path::Path;

use super::walk;
use crate::db::art_beside::{poster_of, source_of, BACKDROP, STILL};
use crate::db::metadata_core::{ITEM, SHOW};
use crate::infra::image::{beside_name, PUBLIC_PREFIX};
use crate::model::{Kind, MediaItem};
use crate::state::SharedState;
use crate::test_support::test_state;

fn put(root: &Path, files: &[&str]) {
    for file in files {
        let path = root.join(file);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, b"x").unwrap();
    }
}

fn first(state: &SharedState, kind: Kind) -> MediaItem {
    crate::db::list_items(&state.db, None)
        .unwrap()
        .into_iter()
        .find(|item| item.kind == kind)
        .unwrap()
}

#[test]
fn a_walk_records_the_pictures_beside_a_film_and_forgets_one_once_removed() {
    let state = test_state();
    let root = kroma_testing::temp_dir("live-art-beside-film");
    put(
        root.path(),
        &[
            "Heat (1995)/Heat (1995).mkv",
            "Heat (1995)/poster.jpg",
            "Heat (1995)/fanart.png",
        ],
    );
    let fanart = root.path().join("Heat (1995)/fanart.png");

    walk(&state, root.path());
    let film = first(&state, Kind::Movie);
    let poster = poster_of(&state.db, ITEM, &film.id).unwrap();
    std::fs::remove_file(root.path().join("Heat (1995)/poster.jpg")).unwrap();
    walk(&state, root.path());
    let after = poster_of(&state.db, ITEM, &film.id).unwrap();

    let backdrop = format!("{PUBLIC_PREFIX}{}", beside_name(&fanart).unwrap());
    let source = source_of(&state.db, &backdrop).unwrap().unwrap();
    assert!(poster.is_some_and(|url| url.starts_with(PUBLIC_PREFIX)));
    assert_eq!(after, None);
    assert_eq!(source.role, BACKDROP);
    assert!(source.path.ends_with("fanart.png"));
}

#[test]
fn a_walk_records_the_poster_in_a_show_s_folder() {
    let state = test_state();
    let root = kroma_testing::temp_dir("live-art-beside-show");
    put(
        root.path(),
        &["Andor/Season 01/Andor S01E01.mkv", "Andor/folder.jpg"],
    );

    walk(&state, root.path());
    let show = first(&state, Kind::Episode).show_id.unwrap();

    assert!(poster_of(&state.db, SHOW, &show).unwrap().is_some());
}

#[test]
fn a_walk_records_the_thumbnail_beside_an_episode_as_its_still() {
    let state = test_state();
    let root = kroma_testing::temp_dir("live-art-beside-episode");
    put(
        root.path(),
        &[
            "Andor/Season 01/Andor S01E01.mkv",
            "Andor/Season 01/Andor S01E01-thumb.jpg",
        ],
    );
    let thumb = root.path().join("Andor/Season 01/Andor S01E01-thumb.jpg");

    walk(&state, root.path());
    let mut episode = first(&state, Kind::Episode);
    crate::db::localize::overlay_each(&state.db, [&mut episode], "en").unwrap();

    let still = format!("{PUBLIC_PREFIX}{}", beside_name(&thumb).unwrap());
    let meta = episode.metadata.unwrap();
    assert_eq!(meta.backdrop_url, Some(still.clone()));
    assert_eq!(source_of(&state.db, &still).unwrap().unwrap().role, STILL);
}

use super::super::*;
use crate::ingest::test_support::*;
use crate::set_item_metadata;

fn dune() -> MediaItem {
    movie(
        "m1",
        "Dune",
        "lib",
        vec![file("f1", "/media/m1.mkv", false)],
    )
}

fn arrival() -> MediaItem {
    movie(
        "m2",
        "Arrival",
        "lib",
        vec![file("f2", "/media/m2.mkv", false)],
    )
}

fn walked(p: &Pool, found: &[MediaItem]) {
    finish_sync(
        p,
        &WalkEnd {
            libraries: &[lib("lib")],
            items: found,
            unread: &HashSet::new(),
            settled: &HashSet::new(),
        },
    )
    .unwrap();
}

fn both_resumed(p: &Pool) -> String {
    let both = [dune(), arrival()];
    sync_all(p, &[lib("lib")], &[], &both, &mtimes_of(&both, 100)).unwrap();
    set_item_metadata(p, "m2", &meta(329865, "Arrival")).unwrap();
    let viewer = crate::create_user(p, "viewer@example.test", "viewer", "x", &[]).unwrap();
    crate::upsert_progress(p, &viewer.id, "m2", 600_000, None).unwrap();
    viewer.id
}

fn movie_ids(p: &Pool) -> Vec<String> {
    crate::list_movies(p, None)
        .unwrap()
        .into_iter()
        .map(|item| item.id)
        .collect()
}

#[test]
fn a_title_whose_file_is_gone_from_a_folder_that_was_read_is_kept_with_its_watch_state() {
    let p = pool();
    let viewer = both_resumed(&p);

    walked(&p, &[dune()]);

    let kept = crate::get_item(&p, "m2").unwrap().unwrap();
    assert!(kept.files.is_empty());
    assert_eq!(kept.metadata.map(|m| m.tmdb_id), Some(329865));
    let position = crate::get_progress(&p, &viewer, "m2").unwrap();
    assert_eq!(position.map(|p| p.position_ms), Some(600_000));
}

#[test]
fn an_absent_title_is_out_of_browsing_search_and_every_list_built_from_ids() {
    let p = pool();
    both_resumed(&p);

    walked(&p, &[dune()]);

    assert_eq!(movie_ids(&p), ["m1"]);
    let (indexed, _) = crate::index_snapshot(&p).unwrap();
    assert_eq!(
        indexed.iter().map(|i| i.id.as_str()).collect::<Vec<_>>(),
        ["m1"]
    );
    let hydrated = crate::get_items_by_ids(&p, &["m1".into(), "m2".into()]).unwrap();
    assert_eq!(
        hydrated.iter().map(|i| i.id.as_str()).collect::<Vec<_>>(),
        ["m1"]
    );
    assert_eq!(crate::counts(&p).unwrap(), (1, 1, 0));
}

#[test]
fn a_title_whose_file_comes_back_is_listed_again_with_everything_it_had() {
    let p = pool();
    let viewer = both_resumed(&p);
    walked(&p, &[dune()]);

    let both = [dune(), arrival()];
    sync_all(&p, &[lib("lib")], &[], &both, &mtimes_of(&both, 100)).unwrap();

    assert_eq!(movie_ids(&p), ["m2", "m1"]);
    let back = crate::get_item(&p, "m2").unwrap().unwrap();
    assert_eq!(back.metadata.map(|m| m.tmdb_id), Some(329865));
    let position = crate::get_progress(&p, &viewer, "m2").unwrap();
    assert_eq!(position.map(|p| p.position_ms), Some(600_000));
}

#[test]
fn a_show_stays_listed_while_one_of_its_episodes_is_present() {
    let p = pool();
    let episodes = [episode("e1", "sev", 1), episode("e2", "sev", 2)];
    sync_all(
        &p,
        &[lib("lib")],
        &[show("sev", "lib")],
        &episodes,
        &mtimes_of(&episodes, 100),
    )
    .unwrap();

    walked(&p, &episodes[..1]);
    let one_left = crate::list_shows(&p, None).unwrap();
    walked(&p, &[]);
    let none_left = crate::list_shows(&p, None).unwrap();

    assert_eq!(
        one_left.iter().map(|s| s.episode_count).collect::<Vec<_>>(),
        [1]
    );
    assert!(none_left.is_empty());
    assert!(crate::get_item(&p, "e2").unwrap().is_some());
}

#[test]
fn an_absent_title_leaves_the_home_rails_and_continue_watching_until_it_is_back() {
    let p = pool();
    let viewer = both_resumed(&p);
    let resumed =
        |p: &Pool| -> Vec<String> { crate::continue_watching_ids(p, &viewer, 90).unwrap() };
    let before = resumed(&p);

    walked(&p, &[dune()]);

    assert_eq!(before, ["m2"]);
    assert!(resumed(&p).is_empty());
    assert_eq!(crate::recently_added_ids(&p, 10).unwrap(), ["m1"]);
    let facts = crate::title_facts(&p).unwrap();
    assert_eq!(
        facts.iter().map(|f| f.id.as_str()).collect::<Vec<_>>(),
        ["m1"]
    );
}

#[test]
fn the_next_episode_skips_an_episode_whose_file_is_gone() {
    let p = pool();
    let episodes = [
        episode("e1", "sev", 1),
        episode("e2", "sev", 2),
        episode("e3", "sev", 3),
    ];
    sync_all(
        &p,
        &[lib("lib")],
        &[show("sev", "lib")],
        &episodes,
        &mtimes_of(&episodes, 100),
    )
    .unwrap();

    walked(&p, &[episodes[0].clone(), episodes[2].clone()]);

    let next = crate::following_episodes(&p, "e1", 5).unwrap();
    assert_eq!(
        next.iter().map(|e| e.id.as_str()).collect::<Vec<_>>(),
        ["e3"]
    );
}

#[test]
fn an_episode_whose_file_is_gone_is_one_the_library_lacks_again() {
    let p = pool();
    let episodes = [episode("e1", "sev", 1), episode("e2", "sev", 2)];
    sync_all(
        &p,
        &[lib("lib")],
        &[show("sev", "lib")],
        &episodes,
        &mtimes_of(&episodes, 100),
    )
    .unwrap();

    walked(&p, &episodes[..1]);

    let conn = p.get().unwrap();
    assert_eq!(crate::episodes_present(&conn, "sev").unwrap(), [(1, 1)]);
    let on_disk = crate::episodes_on_disk(&conn, "sev").unwrap();
    assert_eq!(on_disk.iter().map(|e| e.episode).collect::<Vec<_>>(), [1]);
}

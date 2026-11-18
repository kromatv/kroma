use super::*;
use crate::ingest::test_support::*;
use crate::{finish_sync, sync_all, sync_batch, ScanBatch};
use kroma_domain::MediaItem;

fn write_episode(p: &Pool, show_id: &str, episode_id: &str) -> usize {
    let episodes = [episode(episode_id, show_id, 1)];
    let items: Vec<&MediaItem> = episodes.iter().collect();
    sync_batch(
        p,
        &ScanBatch {
            library: &lib("lib"),
            shows: &[&show(show_id, "lib")],
            items: &items,
            mtimes: &mtimes_of(&episodes, 100),
        },
    )
    .unwrap()
}

fn unsettled(p: &Pool) -> Vec<String> {
    let mut shows: Vec<String> = unsettled_shows(p).unwrap().into_iter().collect();
    shows.sort();
    shows
}

#[test]
fn a_show_whose_episode_a_batch_wrote_stays_unsettled_until_a_walk_ends() {
    let p = pool();

    write_episode(&p, "s1", "e1");
    let rewritten = write_episode(&p, "s1", "e1");
    write_episode(&p, "s2", "e2");

    assert_eq!(rewritten, 0);
    assert_eq!(unsettled(&p), ["s1", "s2"]);

    finish_sync(
        &p,
        &[lib("lib")],
        &[episode("e1", "s1", 1), episode("e2", "s2", 1)],
    )
    .unwrap();

    assert!(unsettled(&p).is_empty());
}

#[test]
fn a_batch_that_writes_no_episode_leaves_no_show_unsettled() {
    let p = pool();
    let films = [movie(
        "m1",
        "Dune",
        "lib",
        vec![file("f1", "/media/m1.mkv", false)],
    )];
    let items: Vec<&MediaItem> = films.iter().collect();

    sync_batch(
        &p,
        &ScanBatch {
            library: &lib("lib"),
            shows: &[],
            items: &items,
            mtimes: &mtimes_of(&films, 100),
        },
    )
    .unwrap();

    assert!(unsettled(&p).is_empty());
}

#[test]
fn a_whole_sync_settles_what_an_earlier_batch_left() {
    let p = pool();
    write_episode(&p, "s1", "e1");
    let episodes = vec![episode("e1", "s1", 1)];

    sync_all(
        &p,
        &[lib("lib")],
        &[show("s1", "lib")],
        &episodes,
        &mtimes_of(&episodes, 100),
    )
    .unwrap();

    assert!(unsettled(&p).is_empty());
}

#[test]
fn a_stored_list_that_does_not_parse_reads_as_no_show() {
    let p = pool();
    crate::settings_set(
        &p,
        UNSETTLED_SHOWS_KEY,
        &serde_json::json!({"not": "a list"}),
    )
    .unwrap();

    assert!(unsettled(&p).is_empty());

    write_episode(&p, "s1", "e1");

    assert_eq!(unsettled(&p), ["s1"]);
}

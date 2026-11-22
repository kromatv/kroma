use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use anyhow::anyhow;
use serde_json::json;

use super::read::{self, DEPTH, RETRY_AFTER_MS};
use super::{slice, DiscoverHit, DiscoverPage, DiscoverScope, Held, List, Source, TrendingLists};
use crate::model::RequestKind;
use crate::test_support::FakeTmdb;

const NOW: i64 = 1_000_000;

fn film(tmdb_id: u64) -> DiscoverHit {
    DiscoverHit {
        kind: RequestKind::Movie,
        tmdb_id,
        title: format!("Film {tmdb_id}"),
        original_title: String::new(),
        year: Some(2026),
        poster_url: Some(format!("https://image.tmdb.org/t/p/w342/{tmdb_id}.jpg")),
        backdrop_url: None,
        overview: None,
        rating: None,
    }
}

fn page_of(hits: Vec<DiscoverHit>, total_pages: u32) -> DiscoverPage {
    DiscoverPage {
        hits,
        page: 1,
        total_pages,
    }
}

fn films(ids: impl IntoIterator<Item = u64>) -> Vec<DiscoverHit> {
    ids.into_iter().map(film).collect()
}

fn ids(hits: &[DiscoverHit]) -> Vec<u64> {
    hits.iter().map(|hit| hit.tmdb_id).collect()
}

fn one_film_a_page(total_pages: u32) -> impl Fn(u32) -> Result<DiscoverPage, ()> + Sync {
    move |number| Ok(page_of(films([u64::from(number)]), total_pages))
}

fn movies() -> Source {
    Source {
        key: "test-key".into(),
        language: "fr-FR".into(),
        scope: DiscoverScope::Movies,
    }
}

fn two_films() -> serde_json::Value {
    json!({
        "page": 1,
        "total_pages": 2,
        "results": [
            { "id": 603, "title": "The Matrix", "poster_path": "/matrix.jpg" },
            { "id": 604, "title": "The Matrix Reloaded", "poster_path": "/reloaded.jpg" },
        ],
    })
}

fn stale_list(hits: Vec<DiscoverHit>, reading: bool) -> Arc<List> {
    Arc::new(List {
        held: Mutex::new(Some(Held {
            hits: Arc::new(hits),
            until_ms: 0,
        })),
        reading: AtomicBool::new(reading),
    })
}

fn held_ids(list: &List) -> Vec<u64> {
    ids(&list.held.lock().unwrap().as_ref().unwrap().hits)
}

#[test]
fn a_title_the_provider_lists_twice_keeps_its_best_place() {
    let ranked = read::rank([page_of(films([1, 2, 3]), 2), page_of(films([2, 4, 1]), 2)]);

    assert_eq!(ids(&ranked), [1, 2, 3, 4]);
}

#[test]
fn a_film_and_a_show_under_the_same_number_are_two_titles() {
    let show = DiscoverHit {
        kind: RequestKind::Show,
        ..film(7)
    };

    let ranked = read::rank([page_of(vec![film(7), show], 1)]);

    assert_eq!(ranked.len(), 2);
}

#[test]
fn a_title_without_a_poster_is_left_out() {
    let bare = DiscoverHit {
        poster_url: None,
        ..film(2)
    };

    let ranked = read::rank([page_of(vec![film(1), bare, film(3)], 1)]);

    assert_eq!(ids(&ranked), [1, 3]);
}

#[test]
fn a_page_holds_sixty_titles_and_the_last_one_what_is_left() {
    let hits = films(1..=130);

    let (first, last) = (slice(&hits, 1), slice(&hits, 3));

    assert_eq!(
        (first.hits.len(), first.page, first.total_pages),
        (60, 1, 3)
    );
    assert_eq!(ids(&last.hits), (121..=130).collect::<Vec<_>>());
}

#[test]
fn a_page_past_the_end_is_the_last_page() {
    let hits = films(1..=70);

    let page = slice(&hits, 9);

    assert_eq!((page.page, page.total_pages, page.hits.len()), (2, 2, 10));
}

#[test]
fn an_empty_list_is_one_empty_page() {
    let page = slice(&[], 4);

    assert_eq!((page.page, page.total_pages, page.hits.len()), (1, 1, 0));
}

#[test]
fn the_read_stops_at_twenty_five_pages_however_many_the_provider_claims() {
    let asked = Mutex::new(Vec::new());
    let page = |number| {
        asked.lock().unwrap().push(number);
        one_film_a_page(500)(number)
    };

    let held = read::list(&page, NOW).unwrap();

    let mut asked = asked.into_inner().unwrap();
    asked.sort_unstable();
    assert_eq!(asked, (1..=DEPTH).collect::<Vec<_>>());
    assert_eq!(ids(&held.hits), (1..=u64::from(DEPTH)).collect::<Vec<_>>());
}

#[test]
fn a_whole_list_is_held_for_an_hour() {
    let held = read::list(&one_film_a_page(3), NOW).unwrap();

    assert_eq!(ids(&held.hits), [1, 2, 3]);
    assert_eq!(held.until_ms, NOW + 3_600_000);
}

#[test]
fn a_page_the_provider_fails_ends_the_list_there_and_it_is_read_again_sooner() {
    let page = |number| match number {
        3 => Err(()),
        _ => one_film_a_page(5)(number),
    };

    let held = read::list(&page, NOW).unwrap();

    assert_eq!(ids(&held.hits), [1, 2]);
    assert_eq!(held.until_ms, NOW + RETRY_AFTER_MS);
}

#[test]
fn a_provider_that_fails_the_first_page_fails_the_read() {
    let read = read::list(&|_| Err(()), NOW);

    assert!(read.is_err());
}

#[test]
fn a_list_is_read_once_and_its_pages_are_answered_from_memory() {
    let tmdb = FakeTmdb::start_shared(|_| (200, two_films()));
    let lists = TrendingLists::default();

    let first = lists.page(&movies(), 1).unwrap();
    let again = lists.page(&movies(), 1).unwrap();

    assert_eq!(tmdb.requests().len(), 2);
    assert_eq!(ids(&first.hits), [603, 604]);
    assert_eq!(ids(&again.hits), [603, 604]);
}

#[test]
fn each_kind_and_each_language_has_a_list_of_its_own() {
    let tmdb = FakeTmdb::start_shared(|_| (200, two_films()));
    let lists = TrendingLists::default();
    let shows = Source {
        scope: DiscoverScope::Shows,
        ..movies()
    };
    let english = Source {
        language: "en-US".into(),
        ..movies()
    };

    for source in [movies(), shows, english, movies()] {
        lists.page(&source, 1).unwrap();
    }

    assert_eq!(tmdb.requests().len(), 6);
}

#[test]
fn a_list_the_provider_cannot_read_fails_and_the_next_page_asks_again() {
    let tmdb = FakeTmdb::start_shared(|_| (500, json!({})));
    let lists = TrendingLists::default();

    let pages = [lists.page(&movies(), 1), lists.page(&movies(), 1)];

    assert!(pages.iter().all(Result::is_err));
    assert_eq!(tmdb.requests().len(), 2);
}

#[test]
fn warming_reads_the_films_and_the_shows_before_any_page_is_asked() {
    let tmdb = FakeTmdb::start_shared(|_| (200, two_films()));
    let lists = TrendingLists::default();
    let shows = Source {
        scope: DiscoverScope::Shows,
        ..movies()
    };

    for read in lists.warm("test-key", "fr-FR") {
        read.join().unwrap();
    }

    assert_eq!(ids(&lists.page(&movies(), 1).unwrap().hits), [603, 604]);
    assert_eq!(ids(&lists.page(&shows, 1).unwrap().hits), [603, 604]);
    assert_eq!(tmdb.requests().len(), 4);
}

#[test]
fn warming_reads_only_the_lists_nothing_is_held_for() {
    let _tmdb = FakeTmdb::start_shared(|_| (200, two_films()));
    let lists = TrendingLists::default();
    let held = Held {
        hits: Arc::new(films([1])),
        until_ms: 0,
    };
    *lists.list(&movies()).held.lock().unwrap() = Some(held);

    let started = lists.warm("test-key", "fr-FR");

    let finished = started
        .into_iter()
        .map(JoinHandle::join)
        .filter(Result::is_ok);
    assert_eq!(finished.count(), 1);
}

#[test]
fn a_stale_list_is_answered_as_it_is() {
    let list = stale_list(films([1, 2]), true);

    let hits = list.hits(&movies()).unwrap();

    assert_eq!(ids(&hits), [1, 2]);
}

#[test]
fn a_stale_list_is_read_again_in_the_background() {
    let _tmdb = FakeTmdb::start_shared(|_| (200, two_films()));
    let list = stale_list(films([1]), false);

    list.read_again(movies()).unwrap().join().unwrap();

    assert_eq!(held_ids(&list), [603, 604]);
    assert!(!list.reading.load(Ordering::Acquire));
}

#[test]
fn a_read_already_under_way_is_not_started_twice() {
    let list = stale_list(films([1]), true);

    let started = list.read_again(movies());

    assert!(started.is_none());
}

#[test]
fn a_fresh_read_replaces_the_list() {
    let list = stale_list(films([1]), false);
    let read = Held {
        hits: Arc::new(films([5, 6])),
        until_ms: NOW,
    };

    list.settle(Ok(read), NOW);

    assert_eq!(held_ids(&list), [5, 6]);
}

#[test]
fn a_failed_read_keeps_the_stale_list_and_asks_again_a_little_later() {
    let list = stale_list(films([1]), false);

    list.settle(Err(anyhow!("the provider is down")), NOW);

    let held = list.held.lock().unwrap().clone().unwrap();
    assert_eq!(ids(&held.hits), [1]);
    assert_eq!(held.until_ms, NOW + RETRY_AFTER_MS);
}
